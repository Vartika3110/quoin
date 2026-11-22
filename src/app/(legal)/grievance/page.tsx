import type { Metadata } from "next";
import { Clause, LegalPage } from "../legal-ui";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Grievance officer — Quoin",
  description: "Who to write to at Quoin about a complaint, and how long a reply takes.",
  alternates: { canonical: "/grievance" },
};

/**
 * Required by the Consumer Protection (E-Commerce) Rules, 2020, and asked
 * for by every Indian payment gateway before an account goes live: a
 * named person, a way to reach them, and a stated time to acknowledge and
 * to resolve.
 *
 * ## No officer is named yet, and this page says so
 *
 * `COMPANY.grievanceOfficer` is `null` — nobody has been appointed. A
 * grievance officer is a real appointment, not a page element, and
 * inventing a name would be a false statement about who is accountable
 * to a customer who has already been let down once.
 *
 * So the page falls back to the support channel and keeps the statutory
 * 48-hour and one-month commitments, which is what actually serves a
 * complaining customer. **It does not satisfy the letter of the Rules**,
 * which ask for a person by name. The fallback is a holding position, not
 * a solution: fill in `grievanceOfficer` and this page names them
 * instead, with no other change needed.
 */
/** One labelled line of the contact block. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-faint">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

export default function GrievancePage() {
  const officer = COMPANY.grievanceOfficer;

  return (
    <LegalPage
      title="Grievance officer"
      updated="2026-11-22"
      intro={
        officer ? (
          <p>
            If something has gone wrong and support has not resolved it, this
            is the person responsible for it, as required by the Consumer
            Protection (E-Commerce) Rules, 2020.
          </p>
        ) : (
          <p>
            If something has gone wrong and support has not resolved it, write
            to the address below and it will be escalated. Quoin has not yet
            appointed a named grievance officer; until it does, complaints are
            handled by support to the same timelines.
          </p>
        )
      }
    >
      <Clause heading="Who to write to">
        <div className="rounded-card border border-line-soft bg-surface p-5">
          <dl className="flex flex-col gap-2.5 text-body-sm">
            {officer ? (
              <>
                <Row label="Name">{officer.name}</Row>
                <Row label="Designation">Grievance Officer, Quoin</Row>
                <Row label="Email">{officer.email}</Row>
                <Row label="Phone">{officer.phone}</Row>
              </>
            ) : (
              <>
                {/* No named officer — see the note at the top of this
                    file. Support is the channel, and saying so plainly
                    beats a page that reads as though somebody specific
                    is waiting when nobody has been appointed. */}
                <Row label="Write to">Quoin Customer Support</Row>
                <Row label="Email">{COMPANY.supportEmail}</Row>
                <Row label="Phone">
                  {`${COMPANY.supportPhone} · ${COMPANY.supportHours}`}
                </Row>
              </>
            )}
            <Row label="Address">{COMPANY.registeredAddress}</Row>
          </dl>
        </div>
      </Clause>

      <Clause heading="How long a reply takes">
        <p>
          A complaint is acknowledged within <strong>48 hours</strong> of being
          received, and resolved within <strong>one month</strong>. Those are
          the periods the Rules require, and Quoin holds itself to them.
        </p>
      </Clause>

      <Clause heading="Before you write">
        <p>
          Include your order or booking reference. It is on your confirmation
          and in your account, and it is the fastest way to find what happened.
        </p>
      </Clause>
    </LegalPage>
  );
}
