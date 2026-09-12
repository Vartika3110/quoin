import Link from "next/link";
import { Chevron, Headset } from "@/components/icons";

/**
 * The one band on the site that is a gradient.
 *
 * Everything else in the system is a flat tint, on the argument that four
 * gradients on a screen is how a page starts looking generated. One is
 * different: it is the loudest thing on whatever page it sits on, and it
 * only ever says one thing — that there is a person at the other end of
 * this. It appears on the pages where somebody is deciding rather than
 * buying, and nowhere else.
 *
 * No "arrives in 15 minutes". The consultation is booked to a slot the
 * customer picks, which is both what the flow actually does and a better
 * promise than one nobody has staffed.
 */
export function ConsultBand({
  title = "Not sure what you need?",
  detail = "Book a free video consultation with someone who has built it",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <Link
      href="/consult"
      className="flex items-center gap-3 rounded-card p-4 text-on-accent transition-opacity hover:opacity-95 lg:rounded-2xl"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--quoin-accent-dim), var(--quoin-accent))",
      }}
    >
      {/* White at low alpha rather than a token: the plate sits on the
          gradient, not on a page ground, so it has to be defined against
          whatever the gradient is doing underneath it. */}
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/20">
        <Headset className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-bold leading-tight">
          {title}
        </span>
        <span className="mt-0.5 block text-caption leading-snug text-on-accent/85">
          {detail}
        </span>
      </span>

      <Chevron className="size-4 shrink-0" />
    </Link>
  );
}
