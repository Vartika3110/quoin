import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalPage } from "../legal-ui";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Contact us — Quoin",
  description: "How to reach Quoin about an order, a booking or anything else.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      updated="2026-11-22"
      intro={<p>A person, not a ticket queue.</p>}
    >
      <Clause heading="About an order or a booking">
        <p>
          Your account has the reference and the current state of everything you
          have ordered, and the fastest route is{" "}
          <Link href="/account/support" className="font-medium text-accent hover:underline">
            raising it from the order itself
          </Link>{" "}
          — it arrives with the reference already attached.
        </p>
      </Clause>

      <Clause heading="About what to buy">
        <p>
          <Link href="/consult" className="font-medium text-accent hover:underline">
            Talk to an expert
          </Link>
          . Somebody who has built with these materials will call you back.
        </p>
      </Clause>

      <Clause heading="Everything else">
        <dl className="flex flex-col gap-2.5 text-body-sm">
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-faint">Email</dt>
            <dd className="text-ink">
              {COMPANY.supportEmail}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-faint">Phone</dt>
            <dd className="text-ink">
              {`${COMPANY.supportPhone} · ${COMPANY.supportHours}`}
            </dd>
          </div>
          {/* The registered address is deliberately not here. It is a
              statutory disclosure rather than a way to reach support —
              nobody writing about an order needs it — and it is printed
              in full under "Who we are" on `/privacy`, plus on
              `/grievance` where a complaint may actually need posting.
              Twice is enough; this page is the one people land on. */}
        </dl>
      </Clause>

      <Clause heading="A complaint">
        {/* "the named person responsible" was true while a grievance
            officer was a required `string`. It is not true now that
            nobody is appointed and the field is `null`, and a sentence
            promising a named person to somebody whose order has already
            gone wrong is the worst place to be loose. The wording
            follows the data. */}
        <p>
          If support has not resolved something,{" "}
          <Link href="/grievance" className="font-medium text-accent hover:underline">
            escalate it here
          </Link>
          {COMPANY.grievanceOfficer
            ? " — a named person is responsible for it."
            : " — complaints are escalated and answered to the same timelines."}
        </p>
      </Clause>
    </LegalPage>
  );
}
