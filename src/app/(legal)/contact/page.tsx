import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalPage, ToConfirm } from "../legal-ui";

export const metadata: Metadata = {
  title: "Contact us — Quoin",
  description: "How to reach Quoin about an order, a booking or anything else.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact us"
      updated="2026-09-22"
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
              <ToConfirm>support email address</ToConfirm>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-faint">Phone</dt>
            <dd className="text-ink">
              <ToConfirm>support phone number and hours</ToConfirm>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 shrink-0 text-faint">Address</dt>
            <dd className="text-ink">
              <ToConfirm>registered address</ToConfirm>
            </dd>
          </div>
        </dl>
      </Clause>

      <Clause heading="A complaint">
        <p>
          If support has not resolved something, the{" "}
          <Link href="/grievance" className="font-medium text-accent hover:underline">
            grievance officer
          </Link>{" "}
          is the named person responsible for it.
        </p>
      </Clause>
    </LegalPage>
  );
}
