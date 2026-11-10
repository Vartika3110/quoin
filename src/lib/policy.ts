/**
 * The windows and periods Quoin commits to, as a customer is told them.
 *
 * The sibling of `src/lib/company.ts`, and separate from it on purpose.
 * Those are facts about the registered entity, settled by paperwork and
 * confirmed once. These are *decisions* — how long a customer has to
 * send something back, how long a complaint takes — settled by whoever
 * runs the business and revisited as it learns. Two files because they
 * are confirmed by different people at different times, and because
 * publishing the registered address should not wait on somebody picking
 * a returns window.
 *
 * ## Everything here is a PROPOSAL until `POLICY_IS_SAMPLE` is false
 *
 * The values below are conventional defaults for an Indian
 * building-materials business, not decisions anybody at Quoin has made.
 * While the flag holds, the policy pages render `[LEGAL TO CONFIRM]`
 * rather than printing them, so a customer is never shown a window the
 * business has not agreed to and could not be held to.
 *
 * One of them is different, and it is worth knowing which.
 * `returnWindowDays` is **already published**: every product page has
 * been telling customers "returned within 7 days" (see `AFTER_SALE`,
 * `src/app/p/[slug]/page.tsx`) while `/refunds` said the window was
 * undecided. That is the disagreement this file exists to make
 * impossible — the product page now reads the number from here, so the
 * two cannot drift again, and 7 is recorded because it is what the site
 * has been promising, not because it was picked.
 */

export interface PolicyWindows {
  /**
   * Days from delivery to send unopened goods back. Reused by the
   * product page, so it is a number rather than a phrase.
   */
  returnWindowDays: number;
  /**
   * How long a customer has to report damage or a wrong item.
   *
   * Shorter than the return window on purpose, and defensible for this
   * trade: damage to a pallet of tiles is visible when it is unloaded,
   * and a claim made a week later cannot be told apart from damage done
   * on site. It matches the 48 hours `/grievance` already commits to for
   * acknowledging a complaint.
   */
  damageReportWindow: string;
  /** From the return being accepted to the refund being sent to the
      gateway. The bank's own 5–7 working days are on top, and the page
      says so. */
  refundInitiationWindow: string;
  /**
   * How money taken outside a gateway comes back.
   *
   * It cannot be "to the method you paid with": `recordOfflinePayment`
   * (`src/lib/data/orders.ts`) accepts UPI, cash, a bank transfer and a
   * cheque, and cash has no method to return to. A nominated bank
   * account is the only answer true of all four.
   */
  offlineRefundMethod: string;
  /** Notice needed to cancel a service booking without a visit fee. */
  serviceCancellationWindow: string;
  /**
   * How long order records are kept after an account is closed.
   *
   * Not a preference: section 36 of the CGST Act requires books and
   * records to be kept for 72 months from the due date of the annual
   * return, and income-tax assessment can reach back further. Eight
   * years from the end of the financial year clears both with a margin.
   * Shortening it to be generous about privacy would put the business in
   * breach of tax law, which is why this one is stated as the legal
   * floor it is.
   */
  dataRetentionPeriod: string;
  /** How long a data request — a copy, a correction, a deletion — takes
      to answer. Matched to the one month `/grievance` commits to for
      resolving a complaint, so the business has one clock to run. */
  dataRequestResponseWindow: string;
}

/**
 * True while any value above is still a proposal rather than a decision.
 *
 * Flip to `false` in the same commit that settles them. One manual
 * switch, for the reason `COMPANY_DETAILS_ARE_SAMPLE` is one: a
 * half-agreed file should stay flagged, and `npm run check:legal` reads
 * this to decide whether the policy pages are publishable.
 */
export const POLICY_IS_SAMPLE = true;

export const POLICY: PolicyWindows = {
  returnWindowDays: 7,
  damageReportWindow: "48 hours",
  refundInitiationWindow: "2 working days",
  offlineRefundMethod: "bank transfer to an account you nominate",
  serviceCancellationWindow: "24 hours",
  dataRetentionPeriod: "8 years from the end of the financial year",
  dataRequestResponseWindow: "30 days",
};
