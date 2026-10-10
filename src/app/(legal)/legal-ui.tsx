import type { ReactNode } from "react";
import { COMPANY_DETAILS_ARE_SAMPLE, POLICY_IS_SAMPLE } from "@/lib/company";

/**
 * Says out loud that a page is still carrying placeholder values.
 *
 * The pages now read their facts from `src/lib/company.ts` rather than
 * marking each one individually, which is a real improvement and
 * introduces a real risk: a sampled GSTIN printed in an ordinary
 * sentence looks exactly like a real one. `ToConfirm` used to make that
 * impossible to miss by highlighting every value; pulling the values
 * from one place means the warning has to move to the page.
 *
 * So it sits at the top, before the first clause, and it is deliberately
 * not subtle. It names which of the two sources is unresolved, because
 * they are filled by different people — the entity details come off an
 * incorporation certificate, the policy windows are decisions the
 * business makes.
 *
 * Both flags false renders nothing at all.
 */
function SampleNotice() {
  if (!COMPANY_DETAILS_ARE_SAMPLE && !POLICY_IS_SAMPLE) return null;

  const missing = [
    COMPANY_DETAILS_ARE_SAMPLE && "the company's registered details",
    POLICY_IS_SAMPLE && "some policy periods",
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="mt-5 rounded-card border border-accent/40 bg-accent-wash px-4 py-3 text-body-sm text-accent"
    >
      <strong className="font-semibold">This page is not final.</strong> It
      still shows placeholder text for {missing.join(" and ")}, so the page can
      be laid out and reviewed. Do not rely on anything here until this notice
      is gone.
    </div>
  );
}

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
      <SampleNotice />
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
