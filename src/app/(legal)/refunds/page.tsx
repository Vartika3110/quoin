import type { Metadata } from "next";
import { Clause, LegalPage } from "../legal-ui";
import { POLICY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Refunds & cancellations — Quoin",
  description: "When an order can be cancelled, what can be returned, and how a refund is paid.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds & cancellations"
      updated="2026-09-22"
      intro={
        <p>
          Building materials are not all returnable, and this page says plainly
          which are and which are not rather than leaving it to a conversation
          at the door.
        </p>
      }
    >
      <Clause heading="Cancelling an order">
        <p>
          An order can be cancelled from your account at any time before it is
          dispatched. Once a made-to-order item has been cut or manufactured it
          cannot be cancelled, because it cannot be sold to anybody else.
        </p>
      </Clause>

      <Clause heading="What can be returned">
        <p>
          Unopened, undamaged goods in their original packaging, within{" "}
          {`${POLICY.returnWindowDays} days`} of delivery.
        </p>
        <p>
          Cement, adhesives, paints that have been tinted, and anything cut to
          your measurements cannot be returned once opened or cut.
        </p>
      </Clause>

      <Clause heading="Damaged or wrong goods">
        <p>
          Tell us within {`${POLICY.damageReportDays} days`} of
          delivery and we will replace the item or refund it in full, including
          any delivery charge. Photographs help and are not required.
        </p>
      </Clause>

      <Clause heading="How a refund is paid">
        <p>
          To the method you paid with. A card or UPI refund is initiated within{" "}
          {`${POLICY.refundInitiationDays} days`} of the return being accepted
          and reaches you on your bank&rsquo;s own timeline, typically five to
          seven working days. An order paid on callback is refunded by{" "}
          {POLICY.offlineRefundMethod}.
        </p>
      </Clause>

      <Clause heading="Cancelling a service booking">
        <p>
          A booking can be cancelled free of charge up to{" "}
          {`${POLICY.serviceCancellationHours} hours`} before the slot.
          After that a visit fee may apply where the professional has already
          travelled.
        </p>
      </Clause>
    </LegalPage>
  );
}
