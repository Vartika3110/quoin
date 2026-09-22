import type { ReactNode } from "react";

/**
 * The furniture every policy page shares.
 *
 * One file rather than a copy per page, so the five of them cannot drift
 * into five different typographic treatments of the same kind of
 * document — which is exactly what happens when a legal page is written
 * once and cloned four times.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** ISO date. Shown because a policy with no date is a policy nobody
      can tell is current. */
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <p className="text-eyebrow uppercase text-accent">Quoin</p>
      <h1 className="mt-1.5 font-display text-headline font-semibold text-ink lg:text-headline-lg">
        {title}
      </h1>
      <p className="nums mt-2 text-caption text-faint">
        Last updated{" "}
        {new Date(updated).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      {intro && <div className="mt-5 text-body-lg leading-relaxed text-muted">{intro}</div>}
      <div className="mt-8 flex flex-col gap-7">{children}</div>
    </>
  );
}

export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-title-sm font-semibold text-ink">{heading}</h2>
      <div className="mt-2 flex flex-col gap-3 text-body leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

/**
 * A fact nobody at Quoin has supplied yet.
 *
 * Rendered visibly, in the accent, because the alternative is a policy
 * that reads as finished while quietly asserting a registered address or
 * a refund window that does not exist. A customer seeing this knows the
 * page is incomplete; a customer seeing an invented address does not.
 */
export function ToConfirm({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-accent-wash px-1.5 py-0.5 text-accent">
      [LEGAL TO CONFIRM] {children}
    </mark>
  );
}
