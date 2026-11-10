import type { Metadata } from "next";
import { Clause, CompanyFact, LegalPage } from "../legal-ui";
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
 * The name and the address show as `[LEGAL TO CONFIRM]` until somebody
 * has actually been appointed, because a grievance officer is a real
 * appointment and not a page element — inventing one would be a false
 * statement about who is accountable. They come from `COMPANY`
 * (`src/lib/company.ts`) through `CompanyFact`, which is what holds that
 * line: it prints nothing from that file until
 * `COMPANY_DETAILS_ARE_SAMPLE` is false.
 *
 * The designation below is hard-coded rather than a field, because the
 * Rules ask for the role this page *is* — there is no version of it where
 * the answer is not "Grievance Officer".
 */
export default function GrievancePage() {
  return (
    <LegalPage
      title="Grievance officer"
      updated="2026-09-22"
      intro={
        <p>
          If something has gone wrong and support has not resolved it, this is
          the person responsible for it, as required by the Consumer Protection
          (E-Commerce) Rules, 2020.
        </p>
      }
    >
      <Clause heading="Who to write to">
        <div className="rounded-card border border-line-soft bg-surface p-5">
          <dl className="flex flex-col gap-2.5 text-body-sm">
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-faint">Name</dt>
              <dd className="text-ink">
                <CompanyFact
                  label="grievance officer name"
                  value={COMPANY.grievanceOfficer.name}
                />
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-faint">Designation</dt>
              <dd className="text-ink">Grievance Officer, Quoin</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-faint">Email</dt>
              <dd className="text-ink">
                <CompanyFact
                  label="grievance email address"
                  value={COMPANY.grievanceOfficer.email}
                />
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-faint">Phone</dt>
              <dd className="text-ink">
                <CompanyFact
                  label="grievance phone number"
                  value={COMPANY.grievanceOfficer.phone}
                />
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-faint">Address</dt>
              <dd className="text-ink">
                <CompanyFact label="registered address" value={COMPANY.registeredAddress} />
              </dd>
            </div>
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
