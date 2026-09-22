"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceBookingStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export interface StaffStatusOption {
  value: ServiceBookingStatus;
  label: string;
}

/** Integer paise → a rupees string for the form's own default value —
    display only, never fed back into a money computation. The route is
    the authority on the reverse direction (`rupeesToPaise`). */
function paiseToRupees(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, "0")}`;
}

const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const IST_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Staff moving a booking, quoting it, or agreeing a time — the one form
 * behind `PATCH /api/v1/admin/services/{reference}`.
 *
 * `options` is computed server-side by `nextBookingStatuses(status,
 * "staff")` and passed in as plain data, the same shape `OrderStatusForm`
 * takes its own legal moves in: this is a client component, so the state
 * machine cannot be imported here without dragging Prisma into the
 * browser bundle, and re-deriving it by hand would be a second copy that
 * can drift from the one `staffUpdate` actually enforces.
 *
 * The quote amount is sent as the rupee text staff typed, not paise —
 * `rupeesToPaise` runs on the server, which is the actual authority on
 * turning it into an integer. Scheduling combines the IST day and time
 * fields into one `+05:30` ISO string the `Date` constructor parses
 * correctly on its own; India has one fixed offset and no daylight-saving
 * edge case to get wrong.
 */
export function ServiceBookingForm({
  reference,
  options,
  currentQuotePaise,
  currentQuoteNote,
  currentScheduledAt,
}: {
  reference: string;
  options: StaffStatusOption[];
  currentQuotePaise: number | null;
  currentQuoteNote: string | null;
  currentScheduledAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [quoteAmount, setQuoteAmount] = useState(
    currentQuotePaise != null ? paiseToRupees(currentQuotePaise) : "",
  );
  const [quoteNote, setQuoteNote] = useState(currentQuoteNote ?? "");
  const [scheduledDate, setScheduledDate] = useState(
    currentScheduledAt ? IST_DATE.format(new Date(currentScheduledAt)) : "",
  );
  const [scheduledTime, setScheduledTime] = useState(
    currentScheduledAt ? IST_TIME.format(new Date(currentScheduledAt)) : "",
  );
  const [note, setNote] = useState("");
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [fieldsError, setFieldsError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submit(toStatus?: ServiceBookingStatus) {
    setBusyStatus(toStatus ?? "__fields__");
    setError(null);
    setFieldsError({});

    let scheduledAt: string | undefined;
    if (scheduledDate && scheduledTime) {
      scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00+05:30`).toISOString();
    }

    try {
      const res = await fetch(`/api/v1/admin/services/${encodeURIComponent(reference)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus,
          quoteAmount: quoteAmount.trim() || undefined,
          quoteNote: quoteNote.trim() || undefined,
          scheduledAt,
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json();

      if (!res.ok) {
        setFieldsError(body?.error?.fields ?? {});
        setError(body?.error?.message ?? "That did not save.");
        return;
      }

      toast.success(toStatus ? `Moved to ${toStatus.replace(/_/g, " ").toLowerCase()}` : "Saved");
      setNote("");
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setBusyStatus(null);
    }
  }

  return (
    <div className="space-y-4">
      <Field
        label="Quote amount"
        htmlFor="quote-amount"
        hint="Rupees — e.g. 12500 or 12,500.50. GST-inclusive."
        error={fieldsError.quoteAmount}
      >
        <Input
          id="quote-amount"
          value={quoteAmount}
          onChange={(e) => setQuoteAmount(e.target.value)}
          inputMode="decimal"
          placeholder="12500"
        />
      </Field>

      <Field label="Quote note" htmlFor="quote-note" hint="Shown to the customer">
        <Textarea
          id="quote-note"
          value={quoteNote}
          onChange={(e) => setQuoteNote(e.target.value)}
          maxLength={1000}
          rows={2}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Scheduled date" htmlFor="scheduled-date">
          <Input
            id="scheduled-date"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </Field>
        <Field label="Scheduled time" htmlFor="scheduled-time" hint="IST">
          <Input
            id="scheduled-time"
            type="time"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Note"
        htmlFor="staff-note"
        hint="Recorded against whichever move you make below"
      >
        <Textarea
          id="staff-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
        />
      </Field>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line-hair pt-4">
        <Button
          variant="outline"
          loading={busyStatus === "__fields__"}
          disabled={busyStatus !== null}
          onClick={() => submit(undefined)}
        >
          Save details
        </Button>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === "CANCELLED" ? "danger" : "primary"}
            loading={busyStatus === option.value}
            disabled={busyStatus !== null}
            onClick={() => submit(option.value)}
          >
            Move to {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
