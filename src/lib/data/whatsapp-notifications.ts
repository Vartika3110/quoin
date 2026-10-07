import { Prisma, type WhatsAppMessageType, type WhatsAppRecipient } from "@prisma/client";
import { db } from "@/lib/db";
import { maskPhone, normalizePhone } from "@/lib/auth/phone";
import {
  getWhatsAppSender,
  isWhatsAppAvailable,
  WhatsAppSendError,
} from "@/lib/whatsapp/client";
import type { WhatsAppMessage } from "@/lib/whatsapp/templates";

/**
 * The outbound WhatsApp log — the one function that sends anything, and
 * the one that makes sending safe to repeat.
 *
 * Three rules hold everywhere in this module, and the rest of the feature
 * depends on all three:
 *
 * **1. It never throws.** Every caller is already downstream of a
 * committed write — a settled payment, a status transition, a vendor
 * dispatch — and the order is the thing that matters. A WhatsApp failure
 * that propagated would mean a 500 on the Razorpay webhook and hours of
 * retries against an order that is in fact perfectly fine, or a status
 * transition that reports failure having already happened. So a failure
 * here becomes a FAILED row the admin can see and retry, and the caller
 * is told nothing it has to handle. Same contract as `notify`
 * (`src/lib/data/notifications.ts`), one channel out.
 *
 * **2. `eventKey` decides, and Postgres enforces it.** The unique index
 * is the whole of the idempotency: a redelivered `payment.captured`, the
 * reconciler settling a payment the webhook also settled, two staff
 * clicking the same transition, a vendor tapping their dispatch link
 * twice, a customer refreshing — all of them arrive here with the same
 * key, and the second insert is rejected by the database rather than
 * prevented by a `findFirst` two statements earlier that a concurrent
 * request can pass at the same time.
 *
 * **3. A failed send heals; a successful one never repeats.** When the
 * key already exists, what happens next depends on what the existing row
 * says. SENT, PENDING or RETRYING: nothing, the message is away or in
 * flight. FAILED: this is a free second chance, claimed with a guarded
 * `updateMany` so that two concurrent redeliveries cannot both send it.
 */

/** The admin's view of one row. */
export interface WhatsAppActivityEntry {
  id: string;
  recipientType: WhatsAppRecipient;
  /** Masked for display — see `maskPhone`. The raw column is never rendered. */
  recipientPhoneMasked: string;
  messageType: WhatsAppMessageType;
  status: "PENDING" | "SENT" | "FAILED" | "RETRYING";
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  /** The store this vendor message was about, when it was one. */
  storeName: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

/** Provider error bodies are already truncated by the sender; this is the
    belt-and-braces bound on anything else that reaches the column. */
const MAX_ERROR_CHARS = 500;

function errorText(error: unknown): string {
  if (error instanceof WhatsAppSendError) return error.message.slice(0, MAX_ERROR_CHARS);
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, MAX_ERROR_CHARS);
  return String(error).slice(0, MAX_ERROR_CHARS);
}

export interface SendOrderMessageInput {
  orderId: string;
  /** Set only for a vendor message, naming the leg it is about. */
  fulfilmentId?: string | null;
  recipientType: WhatsAppRecipient;
  /**
   * Where it is going. **Nullable on purpose** — a Google account that
   * has never given a number, a store nobody has filled a number in for.
   * That case is not an exception to swallow: it writes a FAILED row
   * saying so, which is the only way the admin ever finds out, and it is
   * why `createdAt` exists on a row that was never sent.
   */
  recipientPhone: string | null;
  messageType: WhatsAppMessageType;
  /** `{reference}:{TYPE}`, plus a store code for a vendor message. */
  eventKey: string;
  message: WhatsAppMessage;
}

/** What actually happened, for the caller that wants to log it. */
export type SendOutcome = "sent" | "failed" | "skipped_duplicate";

/**
 * Sends one message, once.
 *
 * The order of operations matters and is deliberate: the row is written
 * **before** the provider is called, never after. A row written
 * afterwards would mean a send that succeeded while the process died
 * before recording it, and the next retry would send the same message
 * again — which is exactly what `eventKey` exists to prevent, defeated by
 * writing it too late.
 */
export async function sendOrderMessage(input: SendOrderMessageInput): Promise<SendOutcome> {
  try {
    const to = safeRecipient(input.recipientPhone);

    /* No number to send to. Recorded as a FAILED attempt rather than
       quietly skipped: "the vendor was never told, and here is why" is
       information the person on the phone with a customer needs, and
       retrying it after filling the number in is the same one click as
       retrying a provider failure. */
    if (!to) {
      await recordUnsendable(input, "No WhatsApp number on file for this recipient.");
      return "failed";
    }

    /* Not configured, and no console sender to fall back to either —
       i.e. an unconfigured production deploy. Recorded honestly rather
       than left PENDING forever, and retryable the moment the
       credentials land. */
    if (!isWhatsAppAvailable()) {
      await recordUnsendable(
        { ...input, recipientPhone: to },
        "WhatsApp is not configured on this deployment (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).",
      );
      return "failed";
    }

    const claim = await claimRow({ ...input, recipientPhone: to });
    if (claim === null) return "skipped_duplicate";

    try {
      const result = await getWhatsAppSender().send(to, input.message);
      await db.whatsAppNotification.update({
        where: { id: claim },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      return "sent";
    } catch (error) {
      console.error("[whatsapp] send failed", {
        messageType: input.messageType,
        to: maskPhone(to),
        error,
      });
      await db.whatsAppNotification.update({
        where: { id: claim },
        data: { status: "FAILED", errorMessage: errorText(error) },
      });
      return "failed";
    }
  } catch (error) {
    /* The log write itself failed — a pooler timeout, say. There is
       nothing further to do and nothing to tell the caller: see rule 1.
       Logged loudly because it is the one failure mode that leaves no
       row behind to find later. */
    console.error("[whatsapp] could not record a notification", {
      messageType: input.messageType,
      orderId: input.orderId,
      error,
    });
    return "failed";
  }
}

/**
 * Normalises the recipient, or `null` if there is nothing sendable.
 *
 * `normalizePhone` throws on junk, and junk is a real possibility here:
 * `Store.whatsappPhone` is typed in by a person with no validation behind
 * it, and `Order.shipPhone` is a shipping contact rather than a verified
 * line. A throw would become an unhandled failure in the middle of a
 * payment webhook, so it is caught and turned into the same honest
 * "nothing to send to" the missing-number case produces.
 */
function safeRecipient(phone: string | null): string | null {
  if (!phone) return null;
  try {
    return normalizePhone(phone);
  } catch {
    return null;
  }
}

/**
 * Writes a row for a message that was never handed to a provider at all.
 *
 * Idempotent on `eventKey` the same way a real send is, and deliberately
 * so: a redelivered webhook must not stack up five identical "no number
 * on file" rows on one order.
 */
async function recordUnsendable(input: SendOrderMessageInput, reason: string): Promise<void> {
  try {
    await db.whatsAppNotification.create({
      data: {
        orderId: input.orderId,
        fulfilmentId: input.fulfilmentId ?? null,
        recipientType: input.recipientType,
        /* The column is non-null — a row has to say who it was for. An
           empty string is the honest value when there was no number, and
           `maskPhone` renders it as a masked placeholder. */
        recipientPhone: input.recipientPhone ?? "",
        messageType: input.messageType,
        status: "FAILED",
        errorMessage: reason,
        attempts: 0,
        eventKey: input.eventKey,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return; // Already recorded.
    throw error;
  }
}

/**
 * Claims the right to send this message, returning the row id to write
 * the outcome to — or `null` when somebody else has it.
 *
 * Two paths in:
 *
 *  - **No row yet.** The insert is the claim, and a concurrent request
 *    doing the same loses on the unique index rather than on a check.
 *  - **A FAILED row exists.** Moved to RETRYING with a guarded
 *    `updateMany` asserting it is still FAILED, exactly the pattern
 *    `settleCapturedPayment` uses (`src/lib/data/orders.ts`): the loser
 *    matches nothing, gets a count of zero, and returns null having
 *    changed nothing.
 */
async function claimRow(input: SendOrderMessageInput & { recipientPhone: string }): Promise<string | null> {
  try {
    const created = await db.whatsAppNotification.create({
      data: {
        orderId: input.orderId,
        fulfilmentId: input.fulfilmentId ?? null,
        recipientType: input.recipientType,
        recipientPhone: input.recipientPhone,
        messageType: input.messageType,
        status: "PENDING",
        attempts: 1,
        eventKey: input.eventKey,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  const existing = await db.whatsAppNotification.findUnique({
    where: { eventKey: input.eventKey },
    select: { id: true, status: true, attempts: true },
  });
  /* Cannot realistically miss — the insert above just told us this key
     exists — but a row deleted between the two statements is not worth a
     crash on a notification path. */
  if (!existing) return null;

  if (existing.status !== "FAILED") return null;

  const claimed = await db.whatsAppNotification.updateMany({
    where: { id: existing.id, status: "FAILED" },
    data: {
      status: "RETRYING",
      attempts: existing.attempts + 1,
      errorMessage: null,
      /* The number is re-written, not left as it was. The commonest
         reason a row is sitting in FAILED is that there was no number on
         file at all (`recordUnsendable` writes an empty string), and the
         whole point of the retry is that somebody has since filled one
         in — a row that said who we tried to reach while actually
         reaching somebody else would be worse than no record. */
      recipientPhone: input.recipientPhone,
    },
  });
  return claimed.count === 1 ? existing.id : null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** ---- Reads --------------------------------------------------------------- */

/**
 * One order's whole WhatsApp story, oldest first — the admin page's
 * "WhatsApp activity" card.
 */
export async function listOrderWhatsAppActivity(orderId: string): Promise<WhatsAppActivityEntry[]> {
  const rows = await db.whatsAppNotification.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      recipientType: true,
      recipientPhone: true,
      messageType: true,
      status: true,
      providerMessageId: true,
      errorMessage: true,
      attempts: true,
      createdAt: true,
      sentAt: true,
      fulfilment: { select: { storeName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    recipientType: row.recipientType,
    recipientPhoneMasked: row.recipientPhone ? maskPhone(row.recipientPhone) : "no number",
    messageType: row.messageType,
    status: row.status,
    providerMessageId: row.providerMessageId,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    storeName: row.fulfilment?.storeName ?? null,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  }));
}

/**
 * The one-word summary the order *list* shows, so a staff member can see
 * at a glance which orders have a messaging problem without opening each
 * one.
 *
 * Worst-case wins: one failure among five successes is the thing worth
 * surfacing. `none` means nothing has been attempted, which for a
 * PENDING_PAYMENT order is correct and not a problem.
 */
export type OrderWhatsAppSummary = "none" | "ok" | "pending" | "failed";

export function summariseWhatsApp(
  statuses: readonly ("PENDING" | "SENT" | "FAILED" | "RETRYING")[],
): OrderWhatsAppSummary {
  if (statuses.length === 0) return "none";
  if (statuses.includes("FAILED")) return "failed";
  if (statuses.includes("PENDING") || statuses.includes("RETRYING")) return "pending";
  return "ok";
}

/** ---- Delivery status (inbound webhook) ---------------------------------- */

/**
 * Applies what Meta later says happened to a message this app sent.
 *
 * Only ever moves a row *downward in certainty*: a `failed` status from
 * the provider overwrites SENT, because the provider knows better than
 * the accept response did — the number was invalid, the template was
 * paused, the user blocked the business. `delivered` and `read` are
 * deliberately **not** stored as statuses of their own: this table's job
 * is "did we manage to send it", and four states is already the whole of
 * what the admin page acts on. The timestamps are Meta's to keep.
 *
 * Matched on `providerMessageId`, which is the only thing the webhook
 * knows. An id this app has no row for is ignored rather than treated as
 * an error: the same business number can be sending from somewhere else.
 */
export async function applyDeliveryStatus(input: {
  providerMessageId: string;
  status: string;
  errorMessage?: string | null;
}): Promise<void> {
  if (input.status !== "failed") return;

  await db.whatsAppNotification.updateMany({
    where: { providerMessageId: input.providerMessageId },
    data: {
      status: "FAILED",
      errorMessage: (input.errorMessage ?? "The provider reported this message as failed.").slice(
        0,
        MAX_ERROR_CHARS,
      ),
    },
  });
}
