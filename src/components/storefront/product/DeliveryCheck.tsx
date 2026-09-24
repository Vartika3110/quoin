"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle, Pin } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatAreas } from "@/lib/areas";
import type { FulfilmentType } from "@/lib/types/catalog";

/**
 * "Do you deliver to me, and when."
 *
 * The question every customer asks before they add anything, and the one
 * the page could not answer until they had signed in, added an address
 * and reached checkout. It is answered here against
 * `/api/v1/serviceability`, which is public precisely so that a visitor
 * who has never signed in can get a straight answer.
 *
 * **A pincode is not a promise of eighteen minutes, and this never says
 * it is.** That route's own note is explicit: coordinates give the
 * delivery promise, a pincode only says Quoin operates in the area,
 * because a pincode straddles store radii and half of one can sit outside
 * every store's reach. So an `instant` product answers "available in your
 * area" and hands the timing question to the address step, where there
 * are coordinates to answer it with. Everything else has a lead time
 * measured in days, which a locality *can* support.
 */

/** What a serviceable pincode is allowed to claim, per fulfilment type. */
function promise(fulfilment: FulfilmentType, leadTimeDays?: number): string {
  switch (fulfilment) {
    case "instant":
      /* Deliberately not "18 minutes" — see the note above. */
      return "Available in your area. Exact timing is confirmed once you add an address.";
    case "bookable":
      return "Experts attend this area. Slots are shown at checkout.";
    case "made_to_order":
      return `Cut to order and delivered in about ${leadTimeDays ?? 7} days.`;
    case "scheduled":
      return `Delivered in about ${leadTimeDays ?? 2} days.`;
  }
}

type Result =
  | { kind: "serviceable"; area: string; city: string }
  | { kind: "unserved"; pincode: string }
  | { kind: "error"; message: string };

export function DeliveryCheck({
  fulfilment,
  leadTimeDays,
  areas,
}: {
  fulfilment: FulfilmentType;
  leadTimeDays?: number;
  /** Every live locality, named. A panel that only asks a question
      leaves the answer entirely to somebody guessing whether their
      pincode is worth typing — and the ones who guess wrong are the
      ones who find out at the door. Empty renders nothing rather than
      an empty sentence. */
  areas: string[];
}) {
  const [pincode, setPincode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  /* Six digits, never leading zero — the same rule the route enforces.
     Checked here too so a plainly malformed entry is refused without a
     round trip, not because the client is trusted to enforce it. */
  const valid = /^[1-9][0-9]{5}$/.test(pincode);

  async function check() {
    if (!valid || busy) return;
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/v1/serviceability?pincode=${encodeURIComponent(pincode)}`,
      );
      const body = await response.json();

      if (!response.ok) {
        setResult({
          kind: "error",
          message: body?.error?.message ?? "Could not check that pincode.",
        });
      } else if (body.data.serviceable) {
        setResult({
          kind: "serviceable",
          area: body.data.area.name,
          city: body.data.area.city,
        });
      } else {
        setResult({ kind: "unserved", pincode: body.data.pincode });
      }
    } catch {
      /* Offline, or the request was cut off mid-flight. Saying so beats a
         silent no, which reads as "we do not deliver here". */
      setResult({ kind: "error", message: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="flex items-center gap-2 text-caption font-medium text-ink">
        <Pin className="size-4 text-accent" />
        Check delivery
      </p>

      {/* Stated before anything is typed, and hidden once there is a
          real answer on screen — at that point the list is a second,
          vaguer reply competing with the specific one. */}
      {areas.length > 0 && !result && (
        <p className="mt-1.5 text-caption leading-snug text-muted">
          Quoin delivers in {formatAreas(areas)}.
        </p>
      )}

      <div className="mt-2.5 flex gap-2">
        <input
          value={pincode}
          /* Digits only, capped at six: an Indian pincode has no other
             shape, and filtering on entry means the button's disabled
             state is about completeness rather than validity.

             **Editing the pincode clears the answer.** A result belongs
             to the pincode it was fetched for, and leaving it on screen
             while the field says something else is how someone in an
             unserved city reads a green "Delivering to Janakpuri" as a
             yes. The answer must never outlive the question. */
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setResult(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && check()}
          inputMode="numeric"
          autoComplete="postal-code"
          aria-label="Pincode"
          placeholder="Enter pincode"
          className="nums h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-body text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={check}
          disabled={!valid || busy}
          className={cn(
            "h-10 shrink-0 rounded-lg px-4 text-caption font-semibold transition-colors",
            valid && !busy
              ? "bg-accent text-on-accent hover:bg-accent-dim"
              : "cursor-not-allowed bg-sunk text-faint",
          )}
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </div>

      {result?.kind === "serviceable" && (
        <p className="mt-2.5 flex items-start gap-2 text-caption leading-snug text-success">
          <CheckCircle className="mt-px size-4 shrink-0" />
          <span>
            <span className="font-medium">
              Delivering to {result.area}, {result.city}.
            </span>{" "}
            <span className="text-muted">
              {promise(fulfilment, leadTimeDays)}
            </span>
          </span>
        </p>
      )}

      {result?.kind === "unserved" && (
        <p className="mt-2.5 text-caption leading-snug text-muted">
          Quoin does not deliver to {result.pincode} yet.{" "}
          <Link href="/consult" className="text-accent underline">
            Ask an expert
          </Link>{" "}
          — some lines ship outside the serviced areas on request.
        </p>
      )}

      {result?.kind === "error" && (
        <p className="mt-2.5 text-caption text-danger">{result.message}</p>
      )}
    </div>
  );
}
