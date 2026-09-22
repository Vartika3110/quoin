"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";

/**
 * The two moves a customer may make on their own booking — accepting (or
 * declining) a quote, and cancelling. `canAccept`/`canCancel` are computed
 * server-side by the detail page from `nextBookingStatuses(status,
 * "customer")`, the same table `canTransitionBooking` enforces on the
 * write — this component never re-derives which buttons should exist, it
 * only calls the two routes that are actually allowed to move the row.
 *
 * Both actions `router.refresh()` on success rather than updating local
 * state: the new status badge, the history line and which buttons show
 * next are all server-rendered from one read of `getBookingForUser`.
 */
export function ServiceBookingActions({
  reference,
  canAccept,
  canCancel,
}: {
  reference: string;
  canAccept: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [acceptBusy, setAcceptBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineBusy, setDeclineBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptQuote() {
    setAcceptBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/services/bookings/${reference}/accept`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not accept this quote.");
      toast.success("Quote accepted");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept this quote.");
    } finally {
      setAcceptBusy(false);
    }
  }

  async function cancelBooking(
    reason: string,
    close: () => void,
    setBusy: (v: boolean) => void,
    successMessage: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/services/bookings/${reference}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "That did not go through.");
      close();
      toast.success(successMessage);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAccept && !canCancel) return null;

  /* Mutually exclusive on purpose: a quote sitting at `QUOTE_RECEIVED` is
     both accept-able and cancel-able (the state machine allows either),
     but "Decline" *is* that cancellation from here — showing a second,
     generic "Cancel booking" button beside it would be two controls
     asking the same question in different words. */
  return (
    <div className="space-y-3">
      {error && <InlineError>{error}</InlineError>}

      {canAccept ? (
        <div className="flex flex-wrap gap-2">
          <Button loading={acceptBusy} disabled={acceptBusy} onClick={acceptQuote}>
            Accept Quote
          </Button>
          <Button variant="outline" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
        </div>
      ) : (
        canCancel && (
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            Cancel booking
          </Button>
        )
      )}

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this quote?"
        description="Quoin will be told this quote was not accepted. You can still book again later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)} disabled={declineBusy}>
              Never mind
            </Button>
            <Button
              variant="danger"
              loading={declineBusy}
              disabled={declineBusy}
              onClick={() =>
                cancelBooking(declineReason, () => setDeclineOpen(false), setDeclineBusy, "Quote declined")
              }
            >
              Decline quote
            </Button>
          </>
        }
      >
        <Textarea
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Reason (optional)"
        />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelBusy}>
              Never mind
            </Button>
            <Button
              variant="danger"
              loading={cancelBusy}
              disabled={cancelBusy}
              onClick={() =>
                cancelBooking(cancelReason, () => setCancelOpen(false), setCancelBusy, "Booking cancelled")
              }
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <Textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Reason (optional)"
        />
      </Modal>
    </div>
  );
}
