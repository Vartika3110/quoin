import type { ReactNode } from "react";
import { COMPANY_DETAILS_ARE_SAMPLE } from "@/lib/company";
import { POLICY_IS_SAMPLE } from "@/lib/policy";

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

/**
 * A company detail from `src/lib/company.ts`, printed only once it is
 * real. See `PolicyFact` below for its sibling.
 *
 * These pages used to carry their own `<ToConfirm>` markers for the
 * registered name, the GSTIN, the grievance officer and the rest — the
 * same facts `COMPANY` already held, written down a second time. That is
 * how a registered address comes to disagree with itself across two
 * pages, and it also meant filling in `company.ts` updated the footer
 * and left `/contact`, `/grievance` and `/privacy` still saying "to
 * confirm".
 *
 * So the page names the fact and where it comes from, and this decides
 * whether it can be shown. While `COMPANY_DETAILS_ARE_SAMPLE` holds,
 * `value` is never rendered at all: the placeholders in `COMPANY` are
 * shaped like the real thing, and a page that printed one would be
 * asserting a GSTIN nobody has verified — which is the failure the whole
 * arrangement exists to prevent. `label` is what a customer and
 * `check:legal` both read in the meantime, so write it as the thing
 * somebody still has to supply ("registered address"), not as a variable
 * name.
 *
 * `value` is therefore required but unused in the sample case, on
 * purpose: it keeps the page's claim about *which* detail this is next
 * to the label, so the two cannot drift.
 */
export function CompanyFact({ label, value }: { label: string; value: string }) {
  return <Settled label={label} value={value} settled={!COMPANY_DETAILS_ARE_SAMPLE} />;
}

/**
 * A window or period from `src/lib/policy.ts`, printed only once it is a
 * decision rather than a proposal.
 *
 * The same shape as `CompanyFact` and a separate component because it
 * reads a separate flag. A registered address is confirmed off a
 * certificate; a returns window is somebody choosing how the business
 * will behave. Those happen at different times and by different people,
 * so `/privacy` can go live naming the real entity while the retention
 * period it quotes is still being settled — or the reverse.
 */
export function PolicyFact({ label, value }: { label: string; value: string }) {
  return <Settled label={label} value={value} settled={!POLICY_IS_SAMPLE} />;
}

/** Shared by both, so the rule about never rendering an unconfirmed
    value lives in one place rather than in each wrapper. */
function Settled({ label, value, settled }: { label: string; value: string; settled: boolean }) {
  return settled ? <>{value}</> : <ToConfirm>{label}</ToConfirm>;
}
