import type { Metadata } from "next";
import { Clause, LegalPage, ToConfirm } from "../legal-ui";

export const metadata: Metadata = {
  title: "Privacy policy — Quoin",
  description: "What Quoin collects, why, and what it never does with it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="2026-09-22"
      intro={
        <p>
          This describes what Quoin collects when you browse, order or book a
          service, why each thing is collected, and how long it is kept.
        </p>
      }
    >
      <Clause heading="Who we are">
        <p>
          Quoin is operated by <ToConfirm>registered entity name</ToConfirm>,
          registered at <ToConfirm>registered address</ToConfirm>, GSTIN{" "}
          <ToConfirm>GSTIN</ToConfirm>.
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
        <p>
          Our payment gateway, for the amount and the reference of a
          transaction. Our SMS provider, for the number a one-time code is sent
          to. Our hosting and database providers, who store the data on our
          behalf. Nobody else.
        </p>
      </Clause>

      <Clause heading="How long we keep it">
        <p>
          Orders and invoices are kept for{" "}
          <ToConfirm>statutory retention period</ToConfirm> as tax law requires.
          Everything else is deleted when you delete your account.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          You can ask for a copy of your data, ask us to correct it, or ask us
          to delete your account and everything in it. Write to{" "}
          <ToConfirm>privacy email address</ToConfirm> and we will answer within{" "}
          <ToConfirm>response window</ToConfirm>.
        </p>
      </Clause>
    </LegalPage>
  );
}
