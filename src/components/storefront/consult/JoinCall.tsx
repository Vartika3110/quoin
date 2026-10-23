"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Video } from "@/components/icons";

/**
 * The Join button, and the clock it depends on.
 *
 * A client component for one reason: the page it sits on is server
 * rendered, so "is the room open yet" is answered once, at render. A
 * customer who opens their booking page ten minutes early and waits —
 * which is exactly what people do — would sit in front of a disabled
 * button that never enables. This ticks.
 *
 * The *authority* on the window is still `roomIsOpen` on the server; this
 * recomputes the same rule against the device clock so the button
 * enables without a reload. A device clock that is wrong only ever
 * affects what this button looks like: the room itself is a URL, and
 * joining early or late is between the customer and the expert.
 */

/** Matches `VIDEO_OPEN_BEFORE_MINUTES` in `src/lib/consult/video.ts`. */
const OPEN_BEFORE_MS = 10 * 60_000;
const OPEN_AFTER_MS = 60 * 60_000;

export function JoinCall({ startsAt, url }: { startsAt: string; url: string }) {
  const start = new Date(startsAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    /* Every fifteen seconds. The window opens on a ten-minute boundary,
       so a second-accurate clock buys nothing and a timer that fires
       sixty times a minute on a page somebody leaves open is rude. */
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const open = now >= start - OPEN_BEFORE_MS && now <= start + OPEN_AFTER_MS;
  const over = now > start + OPEN_AFTER_MS;

  if (over) {
    return (
      <p className="text-caption text-muted">
        This call has finished. If it did not happen, tell us and we will refund the fee.
      </p>
    );
  }

  if (!open) {
    const minutes = Math.max(1, Math.round((start - OPEN_BEFORE_MS - now) / 60_000));
    return (
      <div className="space-y-2">
        <Button variant="primary" size="lg" disabled className="w-full">
          <Video className="size-4.5" />
          Join opens 10 minutes before
        </Button>
        <p className="text-micro text-muted">
          {minutes < 60
            ? `The button goes live in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`
            : "The button goes live ten minutes before your slot. Nothing to install — it opens in this browser."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        href={url}
        variant="primary"
        size="lg"
        className="w-full"
        /* A new tab, so leaving the call does not lose the booking page
           with the reference and the notes on it. `noopener` because the
           video room is a third-party origin. */
        target="_blank"
        rel="noopener noreferrer"
      >
        <Video className="size-4.5" />
        Join the call
      </Button>
      <p className="text-micro text-muted">
        Opens in a new tab. Allow camera and microphone when the browser asks.
      </p>
    </div>
  );
}

/**
 * Waits for a payment to clear.
 *
 * Shown while a booking sits at `pending`. The authority on whether the
 * fee was captured is `payment.captured` arriving at the webhook, which
 * happens on Razorpay's schedule and not the browser's — usually within a
 * couple of seconds, occasionally longer. So this refreshes the server
 * component rather than polling an endpoint of its own: one code path
 * decides what this page says, and it is the same one a reload uses.
 *
 * Gives up after two minutes. A spinner that spins forever teaches the
 * customer that the page is broken; a sentence telling them the money is
 * safe and what to do next does not.
 */
const POLL_MS = 4_000;
const GIVE_UP_MS = 2 * 60_000;

export function AwaitPayment({ reference }: { reference: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        window.clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  if (gaveUp) {
    return (
      <p className="rounded-card border border-line-soft bg-raised px-4 py-3 text-caption text-muted">
        Your payment has not reached us yet. If your bank has debited you, nothing is lost —
        quote {reference} to support and we will either confirm the booking or refund you. You
        can also reload this page in a few minutes.
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 rounded-card border border-line-soft bg-raised px-4 py-3 text-caption text-muted">
      <Spinner className="size-4" />
      Waiting for your payment to clear. This usually takes a few seconds — leave this page
      open.
    </p>
  );
}
