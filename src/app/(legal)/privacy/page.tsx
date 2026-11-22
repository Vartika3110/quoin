import type { Metadata } from "next";
import { Clause, LegalPage } from "../legal-ui";
import { COMPANY, POLICY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy policy — Quoin",
  description: "What Quoin collects, why, and what it never does with it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="2026-11-22"
      intro={
        <p>
          This describes what Quoin collects when you browse, order or book a
          service, why each thing is collected, and how long it is kept.
        </p>
      }
    >
      <Clause heading="Who we are">
        {/* The entity disclosure, and the only page that carries the
            registered address in full. A GSTIN is printed when there is
            one; the sentence has to end cleanly when there is not, which
            is why it is composed rather than interpolated inline — a
            trailing ", GSTIN ." is exactly the kind of thing that ships. */}
        <p>
          Quoin is operated by {COMPANY.legalName}, registered at{" "}
          {COMPANY.registeredAddress}
          {COMPANY.gstin ? `, GSTIN ${COMPANY.gstin}` : ""}.
        </p>
      </Clause>

      <Clause heading="What we collect">
        <p>
          <strong>Your phone number</strong>, to sign you in and to reach you
          about an order. Sign-in is a one-time code — there is no password.
        </p>
        <p>
          <strong>Your name and email</strong>, when you sign in with Google,
          from your Google account.
        </p>
        <p>
          <strong>Delivery addresses</strong>, including a recipient name and
          number where you give one, so an order can reach a site rather than
          only a home.
        </p>
        <p>
          <strong>Orders, bookings and projects</strong> — what you bought,
          what it cost, and what state it is in.
        </p>
        <p>
          <strong>Files you upload</strong> — a parcha, a drawing, a photograph
          of a room. These are stored in a private bucket and are served only
          through short-lived signed links.
        </p>
      </Clause>

      <Clause heading="What we do not do">
        <p>
          We do not sell your data, and we do not share it for advertising. We
          do not store card numbers: online payments are handled by the payment
          gateway and the card details never reach Quoin&rsquo;s servers.
        </p>
      </Clause>

      <Clause heading="Who else sees it">
        {/* This named "our SMS provider" until it was audited, and there
            is no SMS provider — MSG91 was removed and a sign-in code now
            goes over WhatsApp, which means the recipient of a customer's
            phone number is Meta. Naming the wrong processor is not a
            wording slip: the whole point of the clause is to tell people
            which companies receive their data, and somebody deciding
            whether to hand over a number deserves the real answer.

            If delivery moves again, this sentence moves with it. */}
        <p>
          Our payment gateway, for the amount and the reference of a
          transaction. Meta, when a one-time sign-in code is sent to your
          number over WhatsApp. Our hosting, database and storage providers,
          who hold the data on our behalf. Nobody else.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          {/* "covers what ... require" rather than "as tax law
              requires": the second asserts that the law names this
              period, and which law applies to this entity is still
              with its accountant. Eight years satisfies both candidate
              rules, so this sentence is true either way. */}
          Orders and invoices are kept for {POLICY.dataRetention}, which
          covers what tax and accounting rules require. Everything else is
          deleted when you delete your account.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          You can ask for a copy of your data, ask us to correct it, or ask us
          to delete your account and everything in it. Write to{" "}
          {POLICY.privacyEmail} and we will answer within{" "}
          {`${POLICY.privacyResponseDays} days`}.
        </p>
      </Clause>
    </LegalPage>
  );
}
