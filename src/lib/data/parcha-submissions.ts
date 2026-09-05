import { Prisma } from "@prisma/client";
import type { ParchaSource as DbSource, ParchaStatus as DbStatus } from "@prisma/client";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { REFERENCE_ATTEMPTS, generateReference } from "@/lib/reference";
import { parseParcha, type ParchaLine } from "@/lib/parcha";
import { matchParchaLines, type Suggestion } from "@/lib/data/search";
import {
  classifyFile,
  decideExtractionAction,
  decodeCsvBuffer,
  extractCsvLines,
  getOcrProvider,
} from "@/lib/parcha-extract";
import { getStorageProvider, isStorageConfigured } from "@/lib/storage";

/**
 * Persisting a Parcha submission.
 *
 * Parsing (`parseParcha`) and matching (`matchParchaLines`) already work
 * in memory — this module is what makes a submission survive the request
 * that created it: a customer can leave and come back to it by reference,
 * and staff can see the ones that need a human.
 *
 * `QP`-prefixed references, same alphabet and collision-retry idiom as
 * orders (`QO`) and consultations (`QC`) — see `src/lib/reference.ts`.
 */

const REFERENCE_PREFIX = "QP";

/** ---- Wire ↔ DB enum mapping ----------------------------------------------
 * Written out as exhaustive `Record`s, matching `src/lib/data/catalog.ts`
 * and `src/lib/data/consultations.ts`: adding a schema enum value without
 * handling it here is a type error, not a silently unmapped value.
 */

const FROM_DB_SOURCE: Record<DbSource, "typed" | "upload"> = {
  TYPED: "typed",
  UPLOAD: "upload",
};

const FROM_DB_STATUS: Record<
  DbStatus,
  "awaiting_extraction" | "extracting" | "needs_review" | "awaiting_manual_review" | "failed" | "completed"
> = {
  AWAITING_EXTRACTION: "awaiting_extraction",
  EXTRACTING: "extracting",
  NEEDS_REVIEW: "needs_review",
  AWAITING_MANUAL_REVIEW: "awaiting_manual_review",
  FAILED: "failed",
  COMPLETED: "completed",
};

export interface ParchaItemView {
  id: string;
  position: number;
  raw: string;
  term: string;
  qty: number;
  unit: string | null;
  matchedProductSlug: string | null;
  matchedVariantId: string | null;
  confidence: number | null;
  accepted: boolean | null;
}

export interface ParchaSubmissionView {
  reference: string;
  source: "typed" | "upload";
  status: (typeof FROM_DB_STATUS)[DbStatus];
  rawText: string | null;
  extractionNote: string | null;
  createdAt: string;
  updatedAt: string;
  extractedAt: string | null;
  items: ParchaItemView[];
}

type SubmissionWithItems = Prisma.ParchaSubmissionGetPayload<{ include: { items: true } }>;

function toView(row: SubmissionWithItems): ParchaSubmissionView {
  return {
    reference: row.reference,
    source: FROM_DB_SOURCE[row.source],
    status: FROM_DB_STATUS[row.status],
    rawText: row.rawText,
    extractionNote: row.extractionNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    extractedAt: row.extractedAt?.toISOString() ?? null,
    items: [...row.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        raw: item.raw,
        term: item.term,
        qty: item.qty,
        unit: item.unit,
        matchedProductSlug: item.matchedProductSlug,
        matchedVariantId: item.matchedVariantId,
        confidence: item.confidence,
        accepted: item.accepted,
      })),
  };
}

async function loadSubmission(id: string): Promise<ParchaSubmissionView | null> {
  const row = await db.parchaSubmission.findUnique({ where: { id }, include: { items: true } });
  return row ? toView(row) : null;
}

function isReferenceCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    ((error.meta?.target as string[] | undefined)?.includes("reference") ?? false)
  );
}

/** ---- Matching --------------------------------------------------------- */

/**
 * How much of the customer's line the matched product's name actually
 * accounts for, 0–100.
 *
 * There is no fuzzy-matching library in this codebase (four runtime
 * dependencies, deliberately — see AGENTS.md) and inventing a
 * similarity-looking number would fail the review this score exists to
 * support: a number that *looks* precise but means nothing makes a weak
 * match rubber-stamp itself. This instead asks a question with a real
 * answer — of the words in what was searched for, how many appear, whole,
 * in the title of what was found? "Cement OPC 53" against "UltraTech
 * Cement OPC 53 Grade 50kg Bag" covers 3 of 3 words → 100. "blue tile"
 * against "Kajaria Ceramic Floor Tile 2x2" covers 1 of 2 → 50, which is
 * exactly the case where a person should check the colour before
 * accepting it.
 *
 * No stopword list: parcha terms are short material names someone wrote
 * on a list, not sentences, so every word in one is load-bearing.
 */
export function matchConfidence(term: string, matchedLabel: string): number {
  const termWords = wordsOf(term);
  if (termWords.length === 0) return 0;
  const labelWords = new Set(wordsOf(matchedLabel));
  const covered = termWords.filter((w) => labelWords.has(w)).length;
  return Math.round((covered / termWords.length) * 100);
}

function wordsOf(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** The cheapest active variant per product slug — the same rule
 * `POST /api/v1/parcha` prices a match with. Used to pre-fill
 * `ParchaItem.matchedVariantId` with a real, sellable variant rather than
 * leaving it null whenever a product matched at all. */
async function cheapestVariantBySlug(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();

  const rows = await db.product.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      variants: {
        where: { isActive: true },
        orderBy: { pricePaise: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    const variant = row.variants[0];
    if (variant) map.set(row.slug, variant.id);
  }
  return map;
}

interface ItemCreateInput {
  position: number;
  raw: string;
  term: string;
  qty: number;
  unit: string | null;
  matchedProductSlug: string | null;
  matchedVariantId: string | null;
  confidence: number | null;
  accepted: null;
}

/** Builds the item rows for a set of parsed lines and their catalogue
 * matches, resolving matches and variants in one batched pass rather
 * than one query per line — the same reasoning `suggest()` documents for
 * product listing. */
async function buildItemInputs(
  lines: ParchaLine[],
  matches: (Suggestion | null)[],
): Promise<ItemCreateInput[]> {
  const slugs = matches.flatMap((m) => (m ? [m.href.replace("/p/", "")] : []));
  const variantBySlug = await cheapestVariantBySlug(slugs);

  return lines.map((line, index) => {
    const match = matches[index];
    const slug = match ? match.href.replace("/p/", "") : null;
    return {
      position: index,
      raw: line.raw,
      term: line.term,
      qty: line.qty,
      unit: line.unit,
      matchedProductSlug: slug,
      matchedVariantId: slug ? variantBySlug.get(slug) ?? null : null,
      /* Null when nothing matched at all — distinct from a confident
         match to nothing, per the schema comment on `ParchaItem.confidence`. */
      confidence: match ? matchConfidence(line.term, match.label) : null,
      accepted: null,
    };
  });
}

/** A submission with no readable lines is not the same as one nobody has
 * looked at yet — `NEEDS_REVIEW` implies there is something to review.
 * Shared between the typed path and CSV extraction so both fail the same
 * way for the same reason. */
function statusForExtractedLines(lineCount: number): {
  status: "NEEDS_REVIEW" | "FAILED";
  note: string | null;
} {
  return lineCount > 0
    ? { status: "NEEDS_REVIEW", note: null }
    : { status: "FAILED", note: "No materials could be read from this list." };
}

/** ---- Creating a submission --------------------------------------------- */

/**
 * `POST /api/v1/parcha/submissions` with `source: "typed"`.
 *
 * The real end-to-end path: parse, match, and write in one call. Matches
 * and their variants are resolved once, outside the reference-retry loop
 * below — they do not depend on which reference eventually wins, and
 * re-running them on every collision would be wasted database work for
 * an event `REFERENCE_ATTEMPTS` (5) exists to make rare.
 */
export async function createTypedSubmission(input: {
  userId: string | null;
  rawText: string;
  /** Set only for a guest — see the note on `hashIp`. */
  ipHash?: string | null;
}): Promise<ParchaSubmissionView> {
  const rawText = input.rawText.trim();
  const lines = parseParcha(rawText);
  const matches = await matchParchaLines(lines.map((l) => l.term));
  const items = await buildItemInputs(lines, matches);
  const { status, note } = statusForExtractedLines(lines.length);

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const created = await db.$transaction(async (tx) => {
        const submission = await tx.parchaSubmission.create({
          data: {
            reference: generateReference(REFERENCE_PREFIX),
            userId: input.userId,
            /* Guests only. A signed-in caller is already counted by
               `userId`, and collecting an address as well would be keeping
               personal data the limiter has no use for. */
            ipHash: input.userId ? null : (input.ipHash ?? null),
            source: "TYPED",
            status,
            rawText,
            extractionNote: note,
            extractedAt: new Date(),
          },
        });

        if (items.length > 0) {
          await tx.parchaItem.createMany({
            data: items.map((item) => ({ ...item, submissionId: submission.id })),
          });
        }

        return submission;
      });

      return (await loadSubmission(created.id))!;
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
    }
  }

  throw new Error("Could not allocate a parcha reference");
}

/** Thrown when an uploaded file cannot be attached to a submission —
 * missing, not the caller's, not a Parcha upload, or not finished
 * uploading. Always surfaced as "not found" at the API boundary: a file
 * id is as unguessable as an order reference, and confirming that one
 * exists but belongs to someone else is the disclosure `requireStaff`'s
 * 404 pattern exists to avoid elsewhere in this app. */
export class ParchaFileError extends Error {}

/**
 * `POST /api/v1/parcha/submissions` with `source: "upload"`.
 *
 * Creates the submission, then runs extraction inline — there is no job
 * queue in this codebase, and a submission that sat in `AWAITING_EXTRACTION`
 * until some future worker polled for it would be a customer waiting on
 * infrastructure that does not exist. `runExtraction` guarantees the row
 * never rests in `EXTRACTING`: every path out of it, including a throw,
 * ends in a terminal-for-now status.
 */
export async function createUploadSubmission(input: {
  userId: string | null;
  fileId: string;
  /** Set only for a guest — see the note on `hashIp`. */
  ipHash?: string | null;
}): Promise<ParchaSubmissionView> {
  const file = await db.storedFile.findUnique({ where: { id: input.fileId } });
  if (!file) throw new ParchaFileError("No such file");
  if (file.kind !== "PARCHA") throw new ParchaFileError("That file is not a materials list upload");

  /* The file id is not itself proof of ownership. A signed-in caller may
     only attach a file recorded as theirs; a guest (no session at all)
     may only attach a file that was itself uploaded with no owner —
     mirroring exactly how `ParchaSubmission.userId` treats a guest, so a
     stranger cannot ride a signed-in customer's upload into a guest
     submission by guessing its id. */
  if ((file.userId ?? null) !== input.userId) {
    throw new ParchaFileError("No such file");
  }
  if (file.status !== "STORED") {
    throw new ParchaFileError("This file has not finished uploading yet");
  }

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      const submission = await db.parchaSubmission.create({
        data: {
          reference: generateReference(REFERENCE_PREFIX),
          userId: input.userId,
          /* Guests only — see the equivalent note in
             `createTypedSubmission`. */
          ipHash: input.userId ? null : (input.ipHash ?? null),
          source: "UPLOAD",
          status: "AWAITING_EXTRACTION",
          fileId: file.id,
        },
      });

      await runExtraction(submission.id, {
        storageKey: file.storageKey,
        contentType: file.contentType,
        originalName: file.originalName,
      });

      return (await loadSubmission(submission.id))!;
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
    }
  }

  throw new Error("Could not allocate a parcha reference");
}

/**
 * Runs the reader appropriate to a file's type and lands the submission
 * in whichever status is actually true of what happened: `NEEDS_REVIEW`
 * or `FAILED` for something that was read, `AWAITING_MANUAL_REVIEW` for
 * something nothing here can read, and — the one rule this function must
 * never break — never `EXTRACTING` once it returns. Every exit, including
 * the catch at the bottom, writes a terminal status.
 */
async function runExtraction(
  submissionId: string,
  file: { storageKey: string; contentType: string; originalName: string },
): Promise<void> {
  await db.parchaSubmission.update({ where: { id: submissionId }, data: { status: "EXTRACTING" } });

  try {
    const kind = classifyFile(file.contentType, file.originalName);
    const ocr = getOcrProvider();
    const decision = decideExtractionAction(kind, ocr.configured);

    if (decision.action === "manual_review") {
      await db.parchaSubmission.update({
        where: { id: submissionId },
        data: { status: "AWAITING_MANUAL_REVIEW", extractionNote: decision.note },
      });
      return;
    }

    if (!isStorageConfigured()) {
      throw new Error("Object storage is not configured; the uploaded file cannot be read.");
    }

    const buffer = await getStorageProvider().readObject(file.storageKey);
    const text =
      decision.action === "parse_csv"
        ? extractCsvLines(decodeCsvBuffer(buffer)).join("\n")
        : await ocr.extractText({ buffer, contentType: file.contentType });

    const lines = parseParcha(text);
    const matches = await matchParchaLines(lines.map((l) => l.term));
    const items = await buildItemInputs(lines, matches);
    const { status, note } = statusForExtractedLines(lines.length);

    await db.$transaction([
      ...(items.length > 0
        ? [
            db.parchaItem.createMany({
              data: items.map((item) => ({ ...item, submissionId })),
            }),
          ]
        : []),
      db.parchaSubmission.update({
        where: { id: submissionId },
        data: { status, extractionNote: note, extractedAt: new Date() },
      }),
    ]);
  } catch (error) {
    console.error(`[parcha] extraction failed for submission ${submissionId}`, error);
    await db.parchaSubmission.update({
      where: { id: submissionId },
      data: {
        status: "FAILED",
        extractionNote:
          error instanceof Error ? error.message : "Extraction failed unexpectedly.",
        extractedAt: new Date(),
      },
    });
  }
}

/** ---- Reading a submission back ------------------------------------------ */

/**
 * `GET /api/v1/parcha/submissions/{reference}`.
 *
 * Ownership is enforced in the `where` clause, not by filtering the
 * result afterward, so a reference that exists but belongs to someone
 * else reads as "not found" rather than "found, not yours". A submission
 * with no owner (`userId` null — a guest's) matches regardless of who is
 * asking: it has no session to check against, so the unguessable
 * reference itself is the only credential such a submission has, exactly
 * as the schema comment on `ParchaSubmission.userId` says.
 */
export async function getSubmissionByReference(
  reference: string,
  sessionUserId: string | null,
): Promise<ParchaSubmissionView | null> {
  const row = await db.parchaSubmission.findFirst({
    where: {
      reference,
      OR: [{ userId: null }, ...(sessionUserId ? [{ userId: sessionUserId }] : [])],
    },
    include: { items: true },
  });
  return row ? toView(row) : null;
}

/** ---- Review ------------------------------------------------------------- */

export class ParchaItemNotFoundError extends Error {}

export class ParchaValidationError extends Error {
  constructor(
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/**
 * Whether every item on a submission has been decided — the definition of
 * `COMPLETED`. Pure so it can be tested without a database: `accepted` is
 * `null` until a customer has looked at a line, `true` or `false` once
 * they have (see the schema comment on `ParchaItem.accepted`), and a
 * submission with zero items is never complete — there is nothing to
 * have reviewed.
 */
export function statusAfterItemDecisions(
  items: { accepted: boolean | null }[],
): "NEEDS_REVIEW" | "COMPLETED" {
  return items.length > 0 && items.every((i) => i.accepted !== null)
    ? "COMPLETED"
    : "NEEDS_REVIEW";
}

/**
 * `PATCH /api/v1/parcha/submissions/{reference}/items/{itemId}`.
 *
 * A correction to `matchedProductSlug`/`matchedVariantId` is validated
 * the same way `quoteCart` validates a basket line: a variant id only
 * means something under the product it actually belongs to, so the pair
 * is cross-checked against the catalogue rather than trusted — otherwise
 * a corrected line could be made to point at a different, cheaper
 * product's variant while displaying another product's name.
 *
 * `qty` is written exactly as given. It is a reading of what someone
 * wrote, not a transacted quantity — `normalizeQty` only snaps it onto a
 * variant's integer grid if and when it reaches a basket.
 */
export async function updateParchaItem(input: {
  reference: string;
  itemId: string;
  sessionUserId: string | null;
  accepted?: boolean;
  qty?: number;
  matchedProductSlug?: string | null;
  matchedVariantId?: string | null;
}): Promise<ParchaSubmissionView> {
  const submission = await db.parchaSubmission.findFirst({
    where: {
      reference: input.reference,
      OR: [{ userId: null }, ...(input.sessionUserId ? [{ userId: input.sessionUserId }] : [])],
    },
    select: { id: true, status: true },
  });
  if (!submission) throw new ParchaItemNotFoundError("No such submission");

  const item = await db.parchaItem.findFirst({
    where: { id: input.itemId, submissionId: submission.id },
    select: { id: true },
  });
  if (!item) throw new ParchaItemNotFoundError("No such item");

  let matchUpdate: { matchedProductSlug: string | null; matchedVariantId: string | null } | undefined;
  if (input.matchedProductSlug !== undefined || input.matchedVariantId !== undefined) {
    const slug = input.matchedProductSlug ?? null;
    const variantId = input.matchedVariantId ?? null;

    if ((slug === null) !== (variantId === null)) {
      throw new ParchaValidationError("Correct the product and its variant together", {
        matchedProductSlug: "Provide both, or clear both",
      });
    }

    if (slug !== null && variantId !== null) {
      const variant = await db.productVariant.findFirst({
        where: { id: variantId, product: { slug } },
        select: { id: true },
      });
      if (!variant) {
        throw new ParchaValidationError("That variant does not belong to that product", {
          matchedVariantId: "Pick a variant of the chosen product",
        });
      }
    }

    matchUpdate = { matchedProductSlug: slug, matchedVariantId: variantId };
  }

  await db.parchaItem.update({
    where: { id: item.id },
    data: {
      ...(input.accepted !== undefined ? { accepted: input.accepted } : {}),
      ...(input.qty !== undefined ? { qty: input.qty } : {}),
      ...(matchUpdate ?? {}),
    },
  });

  /* Recomputed from all of the submission's items rather than tracked
     incrementally, so a correction never needs its own bookkeeping and
     can never drift from what the rows actually say. Only moves a
     submission that is currently reviewable — `NEEDS_REVIEW` or already
     `COMPLETED` — never a status like `AWAITING_MANUAL_REVIEW` that this
     endpoint has no business touching (and which, in practice, has no
     items yet to patch). */
  if (submission.status === "NEEDS_REVIEW" || submission.status === "COMPLETED") {
    const items = await db.parchaItem.findMany({
      where: { submissionId: submission.id },
      select: { accepted: true },
    });
    const nextStatus = statusAfterItemDecisions(items);
    if (nextStatus !== submission.status) {
      await db.parchaSubmission.update({ where: { id: submission.id }, data: { status: nextStatus } });
    }
  }

  return (await loadSubmission(submission.id))!;
}

/** ---- Rate limiting -------------------------------------------------------
 *
 * Guests are allowed to write a submission — see the schema comment on
 * `ParchaSubmission.userId` — which makes this an unauthenticated write,
 * the same shape as OTP requests and consultation call-backs, both of
 * which are limited (`src/app/api/v1/auth/otp/request/route.ts`,
 * `src/lib/data/consultations.ts`).
 *
 * Both are limited against the database — persisted, and correct no
 * matter how many server instances are running, exactly like
 * `countRequestsSince` in consultations.ts. A signed-in caller is counted
 * by `userId`; a guest by `ipHash`.
 *
 * An in-memory window was the obvious shortcut here and is not good
 * enough. This app runs on serverless: consecutive requests land on
 * whichever instance is free, instances are recycled constantly, and a
 * counter held in one process's memory is therefore a limit an anonymous
 * caller can step around by simply making the next request. On a public
 * endpoint that writes rows, that is not a weaker limit — it is close to
 * none. `ParchaSubmission.ipHash` exists to make it real.
 */

const GUEST_RATE_WINDOW_MS = 60 * 60 * 1000;
const GUEST_RATE_MAX = 12;

/**
 * HMAC of a caller's IP, peppered with the server secret.
 *
 * The limiter only ever needs to ask "have I seen this caller recently",
 * and a digest answers that without `parcha_submissions` quietly becoming
 * a log of who looked at the catalogue. Peppered rather than plain-hashed
 * because the IPv4 space is small enough to enumerate a bare SHA-256 of.
 */
export function hashIp(ip: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`parcha-ip:${ip}`).digest("hex");
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export async function checkGuestRateLimit(ipHash: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - GUEST_RATE_WINDOW_MS);
  const count = await db.parchaSubmission.count({
    where: { ipHash, createdAt: { gte: since } },
  });

  if (count >= GUEST_RATE_MAX) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(GUEST_RATE_WINDOW_MS / 1000),
    };
  }
  return { allowed: true };
}

const USER_RATE_WINDOW_MS = 60 * 60 * 1000;
const USER_RATE_MAX = 20;

export async function checkUserRateLimit(userId: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - USER_RATE_WINDOW_MS);
  const count = await db.parchaSubmission.count({ where: { userId, createdAt: { gte: since } } });
  if (count >= USER_RATE_MAX) {
    return { allowed: false, retryAfterSeconds: Math.ceil(USER_RATE_WINDOW_MS / 1000) };
  }
  return { allowed: true };
}

/** The first hop in `X-Forwarded-For`, or `X-Real-Ip`, or `"unknown"`.
 * `"unknown"` shares one rate-limit bucket across every caller who
 * triggers it, which only matters if this host stops setting the header
 * a real reverse proxy always sets — an availability trade against a
 * limiter that otherwise does nothing for such a request. */
export function callerIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
