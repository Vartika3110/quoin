import type { Metadata } from "next";
import { Clause, LegalPage, ToConfirm } from "../legal-ui";

export const metadata: Metadata = {
  title: "Terms of service — Quoin",
  description: "The terms you agree to when you order from or book through Quoin.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="2026-09-22"
      intro={
        <p>
          These terms apply when you place an order, book a service, or use the
          project tools on Quoin.
        </p>
      }
    >
      <Clause heading="Prices and taxes">
        <p>
          Prices on Quoin are in Indian rupees and are{" "}
          <strong>inclusive of GST</strong> at the rate applicable to each
          product. The tax on a line is extracted from the price shown, never
          added on top of it, and the breakdown appears on your invoice.
        </p>
        <p>
          A price is confirmed at checkout, not when a product is added to your
          basket. If the catalogue price changes in between, the new price is
          shown to you before you pay.
        </p>
      </Clause>

      <Clause heading="Where we deliver">
        <p>
          Quoin currently serves selected neighbourhoods in West Delhi.
          Serviceability is decided on the exact address, not the PIN code, and
          is confirmed at checkout.
        </p>
      </Clause>

      <Clause heading="Delivery and lead times">
        <p>
          Every product states how it is fulfilled. Stocked items are delivered
          from a local store; scheduled items come from a warehouse to a day;
          made-to-order items are cut or manufactured against your order; a
          booked service is a person attending a site on a slot. These cannot be
          combined into one delivery date, and Quoin does not promise one.
        </p>
      </Clause>

      <Clause heading="Services and quotes">
        <p>
          A booking is a request. A professional confirms the day and, where the
          work needs to be seen first, quotes for it. Nothing on Quoin is a
          contract for work until that quote is accepted.
        </p>
      </Clause>

      <Clause heading="Your account">
        <p>
          You are responsible for the number on your account and for the codes
          sent to it. Tell us at once if you lose access to it.
        </p>
      </Clause>

      <Clause heading="Liability">
        <p>
          <ToConfirm>limitation of liability, governed-by and jurisdiction clauses</ToConfirm>
        </p>
      </Clause>
    </LegalPage>
  );
}
