import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { Button } from "@/components/ui/Button";
import { Calendar, Check, Clock, Headset, Info } from "@/components/icons";
import { AwaitPayment, JoinCall } from "@/components/storefront/consult/JoinCall";
import { getBookingByReference, startMinutesOf } from "@/lib/data/consult-sessions";
import { meetingUrl } from "@/lib/consult/video";
import {
  CONSULT_TOPIC_INFO,
  formatConsultDay,
  formatConsultTime,
  formatFee,
  istDay,
} from "@/lib/types/consult";

/**
 * One booking: what was paid for, when it is, and the way into it.
 *
 * Rendered per request, and never cached. Whether the fee has cleared
 * changes within seconds of the customer landing here, and a cached page
 * would show "awaiting payment" to somebody whose money has already
 * arrived.
 *
 * ## Who can open this
 *
 * Anyone holding the reference, with no sign-in — the same trust model
 * the order confirmation page uses, and necessary for the same reason:
 * consultations can be booked by a guest, so there is no account to put
 * this behind. The reference is random (see `src/lib/reference.ts`), the
 * phone number is deliberately not on the page, and the video room is
 * released only once the fee is captured.
 *
 * It is still a link that grants access to a call, which is why
 * `noindex`: a booking page has no business in a search index.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your consultation — Quoin",
  robots: { index: false, follow: false },
};

export default async function ConsultBookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = await getBookingByReference(reference.toUpperCase());

  if (!booking) notFound();

  const topic = booking.topic ? CONSULT_TOPIC_INFO[booking.topic] : null;
  const startsAt = booking.startsAt ? new Date(booking.startsAt) : null;
  const paid = booking.paymentStatus === "paid";

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="space-y-6 px-5 lg:px-0">
          <header className="space-y-1">
            <p className="text-micro font-medium uppercase tracking-wide text-muted">
              {booking.reference}
            </p>
            <h1 className="font-display text-display-sm font-semibold text-ink">
              {paid ? "Your consultation is booked" : "Almost booked"}
            </h1>
            {topic && (
              <p className="text-body text-muted">
                {topic.title} · {formatFee(booking.feePaise)}
                {paid ? " paid" : ""}
              </p>
            )}
          </header>

          {/* ---- When, and how to get in ------------------------------ */}
          <section className="space-y-4 rounded-card border border-line-soft bg-surface p-5">
            {startsAt ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-body font-semibold text-ink">
                  <Calendar className="size-4.5 shrink-0 text-accent" aria-hidden />
                  {formatConsultDay(istDay(startsAt))} at{" "}
                  {formatConsultTime(startMinutesOf(startsAt))}
                </p>
                <p className="flex items-center gap-2 text-caption text-muted">
                  <Clock className="size-4 shrink-0" aria-hidden />
                  {booking.durationMinutes} minutes, on video. Indian Standard Time.
                </p>
              </div>
            ) : (
              <p className="text-caption text-muted">
                No time is fixed on this one — an expert will call you back to agree one.
              </p>
            )}

            {paid && booking.videoRoom && startsAt ? (
              <JoinCall startsAt={booking.startsAt!} url={meetingUrl(booking.videoRoom)} />
            ) : booking.paymentStatus === "pending" ? (
              <AwaitPayment reference={booking.reference} />
            ) : booking.paymentStatus === "failed" ? (
              <div className="space-y-2">
                <p className="rounded-card border border-danger/30 bg-danger-wash px-4 py-3 text-caption text-danger">
                  That payment did not go through, so this time is not held any more. Nothing
                  was charged.
                </p>
                <Button href="/consult" variant="primary" size="md">
                  Book again
                </Button>
              </div>
            ) : booking.paymentStatus === "refunded" ? (
              <p className="rounded-card border border-line-soft bg-raised px-4 py-3 text-caption text-muted">
                This consultation was refunded in full. If that is news to you, quote{" "}
                {booking.reference} to support.
              </p>
            ) : null}
          </section>

          {/* ---- What to have ready ----------------------------------- */}
          {paid && (
            <section className="space-y-3 rounded-card border border-accent-edge bg-accent-wash p-5">
              <h2 className="font-display text-title-sm font-semibold text-ink">
                Worth having ready
              </h2>
              <ul className="space-y-1.5">
                {[
                  "Photos of the space, or be somewhere you can point the camera at it.",
                  "Rough measurements if you have them — even a tape reading helps.",
                  "A number you are working to, if you have one. It changes the advice.",
                  "Anything already bought or already quoted for.",
                ].map((line) => (
                  <li key={line} className="flex gap-2 text-caption text-ink">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* The brief back to the customer, so they can see what the
              expert will have read before the call. */}
          {booking.notes && (
            <section className="space-y-2">
              <h2 className="text-caption font-semibold text-ink">What you told us</h2>
              <p className="whitespace-pre-line rounded-card border border-line-soft bg-raised p-4 text-caption text-muted">
                {booking.notes}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <p className="flex gap-2 text-micro text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <span>
                Need to move it? Tell us before the call and we will reschedule at no charge. If
                we miss the call, you get the whole fee back.
              </span>
            </p>
            <Button href="/account/support" variant="outline" size="sm">
              <Headset className="size-4" />
              Contact support
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
