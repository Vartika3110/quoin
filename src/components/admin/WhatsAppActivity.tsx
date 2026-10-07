"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { MESSAGE_TYPE_LABEL } from "@/lib/whatsapp/templates";
import type { WhatsAppActivityEntry } from "@/lib/data/whatsapp-notifications";

/**
 * "WhatsApp activity" — every message an order has caused, and the retry
 * button for the ones that did not land.
 *
 * This card is the visible half of the rule that a WhatsApp failure must
 * never break an order. The order was always fine; what failed was a
 * message, and the failure is on this list with the provider's own words
 * next to it ("Template is paused", "Recipient phone number not in
 * allowed list", or this app's own "No WhatsApp number on file") so that
 * the person reading it can tell whether to fix a number, a template or
 * nothing at all.
 *
 * A client component because of exactly one thing: the retry button. The
 * list itself is server-rendered data passed in as a prop, and a retry
 * replaces the whole list from the route's response rather than patching
 * a row — one shape, defined once, in
 * `src/lib/data/whatsapp-notifications.ts`.
 *
 * Phone numbers arrive already masked (`recipientPhoneMasked`). The raw
 * column is never sent to a browser; a staff member who needs the full
 * number has it on the customer card above.
 */

type Status = WhatsAppActivityEntry["status"];

const TONE: Record<Status, "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "neutral",
  SENT: "success",
  RETRYING: "warning",
  FAILED: "danger",
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Sending",
  SENT: "Sent",
  RETRYING: "Retrying",
  FAILED: "Failed",
};

const TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function WhatsAppActivity({
  reference,
  activity,
  configured,
}: {
  reference: string;
  activity: WhatsAppActivityEntry[];
  /** False when this deployment has no WhatsApp credentials. The card
      then says so once, at the top, rather than leaving a staff member
      to deduce it from five identical failures. */
  configured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(activity);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(id: string) {
    setRetrying(id);
    try {
      const res = await fetch(
        `/api/v1/admin/orders/${encodeURIComponent(reference)}/whatsapp/${encodeURIComponent(id)}/retry`,
        { method: "POST" },
      );
      const body = await res.json();

      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not retry this message");
        return;
      }

      /* The route answers with the order's whole refreshed activity list,
         so this is a replacement rather than a patch — no local guess at
         what the new row looks like. `router.refresh()` as well, because
         the queue's WhatsApp column and the order's status badge are
         server-rendered from the same data. */
      setRows(body.data.activity as WhatsAppActivityEntry[]);
      const sent = (body.data.activity as WhatsAppActivityEntry[]).find((row) => row.id === id);
      if (sent?.status === "SENT") toast.success("Message sent");
      else toast.error(sent?.errorMessage ?? "The message failed again");
      router.refresh();
    } catch {
      toast.error("Network error — the message was not retried");
    } finally {
      setRetrying(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        {configured
          ? "No WhatsApp message has been sent for this order yet. The customer and the vendor are messaged once the payment is confirmed."
          : "WhatsApp is not configured on this deployment, so no messages are being sent. Orders are unaffected."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!configured && (
        <p className="rounded-lg bg-warning-wash px-3 py-2 text-caption text-warning">
          WhatsApp is not configured on this deployment. Nothing below was actually sent; each one
          can be retried once the credentials are set.
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="border-b border-line-hair pb-3 text-body-sm last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink">
                {MESSAGE_TYPE_LABEL[row.messageType]}
                <span className="text-muted">
                  {" — "}
                  {row.recipientType === "CUSTOMER" ? "Customer" : (row.storeName ?? "Vendor")}
                </span>
              </span>
              <Badge tone={TONE[row.status]} size="sm">
                {STATUS_LABEL[row.status]}
              </Badge>
            </div>

            <p className="nums mt-0.5 text-caption text-muted">
              {row.recipientPhoneMasked}
              {" · "}
              {TIME_FORMAT.format(new Date(row.sentAt ?? row.createdAt))}
              {row.attempts > 1 ? ` · ${row.attempts} attempts` : ""}
            </p>

            {row.errorMessage && (
              <p className="mt-2 rounded-lg bg-danger-wash px-3 py-2 text-caption text-danger">
                {row.errorMessage}
              </p>
            )}

            {/* Only a failure can be retried. Retrying a SENT message
                would send it a second time, which the route refuses
                anyway — this is not showing a button that would be
                rejected. */}
            {row.status === "FAILED" && (
              <Button
                onClick={() => retry(row.id)}
                loading={retrying === row.id}
                disabled={retrying !== null}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Retry
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
