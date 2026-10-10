/**
 * Who Quoin is, as a customer needs to be told.
 *
 * One file, because these same five facts are owed in at least five
 * places — the footer, `/contact`, `/grievance`, `/privacy` and a payment
 * gateway's onboarding review — and a registered address that disagrees
 * with itself across two pages is worse than one that is missing from
 * both.
 *
 * ## Everything marked SAMPLE is not real
 *
 * The values below are placeholders with the shape of the real thing, so
 * the pages lay out correctly and can be reviewed. They are **not** this
 * business's details and must not be shown to a customer as if they were.
 * `isSample` is true while any of them is still a placeholder, and the
 * surfaces that print them use it to say so out loud rather than
 * quietly asserting a GSTIN nobody has verified.
 *
 * Replacing them is this file and nothing else: put the real values in,
 * set `isSample` to false, and every page that reads from here is correct
 * at once.
 */

export interface CompanyDetails {
  /** The registered entity, as it appears on the incorporation certificate. */
  legalName: string;
  /** What customers call it. */
  tradingName: string;
  registeredAddress: string;
  gstin: string;
  supportEmail: string;
  supportPhone: string;
  /** When somebody actually answers that phone. */
  supportHours: string;
  /**
   * India's Consumer Protection (E-Commerce) Rules, 2020 require an
   * e-commerce entity to appoint one and publish their name and contact
   * details. A role title is not enough — the rule asks for a person.
   */
  grievanceOfficer: {
    name: string;
    email: string;
    phone: string;
  };
}

/**
 * True while any value above is still a placeholder.
 *
 * Flip to `false` in the same commit that puts the real details in. It is
 * deliberately one manual switch rather than a check for the word
 * "SAMPLE": a half-replaced file should stay flagged, and a value that is
 * real but wrong is not something a string match can catch anyway.
 */
export const COMPANY_DETAILS_ARE_SAMPLE = true;

export const COMPANY: CompanyDetails = {
  legalName: "SAMPLE PRIVATE LIMITED",
  tradingName: "Quoin",
  registeredAddress: "SAMPLE — registered office address, New Delhi 110058",
  gstin: "SAMPLE — 07AAAAA0000A1Z5",
  supportEmail: "sample@quoin.co.in",
  supportPhone: "+91 00000 00000",
  supportHours: "Mon–Sat, 10am–7pm",
  grievanceOfficer: {
    name: "SAMPLE — grievance officer name",
    email: "sample-grievance@quoin.co.in",
    phone: "+91 00000 00000",
  },
};

/**
 * The periods the policy pages quote.
 *
 * Here for the same reason the details above are: a return window stated
 * as seven days on a product page and left blank on `/refunds` is the
 * kind of disagreement a customer notices and a gateway's reviewer asks
 * about. One source, five pages.
 *
 * **`returnWindowDays` is not a guess.** Every product page already
 * tells customers "Unopened and unfitted goods can be returned within 7
 * days" — see the `After you buy` panel in `src/app/p/[slug]/page.tsx`.
 * The promise has been published to customers for months; the refunds
 * page simply never repeated it. Writing 7 here states what the site
 * already commits to rather than inventing a term.
 *
 * The rest are marked SAMPLE because nobody has decided them. They are
 * shaped like the real thing so the pages lay out and read correctly,
 * and `POLICY_IS_SAMPLE` keeps them visibly flagged until they are.
 */
export interface PolicyTerms {
  /** Days after delivery a customer may start a return. */
  returnWindowDays: number;
  /** Days after delivery to report damage or a short delivery. */
  damageReportDays: number;
  /** Days from an accepted return to the refund being initiated. */
  refundInitiationDays: number;
  /** How money taken offline (UPI, cash, bank transfer) is returned. */
  offlineRefundMethod: string;
  /** Hours before a booked slot that a service may be cancelled free. */
  serviceCancellationHours: number;
  /** How long records are kept, and why. */
  dataRetention: string;
  /** Days to answer a privacy request. */
  privacyResponseDays: number;
  /** Where privacy requests go. */
  privacyEmail: string;
}

/**
 * True while any value below is still a placeholder.
 *
 * Separate from `COMPANY_DETAILS_ARE_SAMPLE` because the two are filled
 * by different people: the entity details come off an incorporation
 * certificate, these are decisions the business makes. Either being
 * unresolved should flag the pages, and knowing which is unresolved is
 * what tells you whom to ask.
 */
export const POLICY_IS_SAMPLE = true;

export const POLICY: PolicyTerms = {
  /* Published already — see the note above. Not a placeholder. */
  returnWindowDays: 7,

  damageReportDays: 2,
  refundInitiationDays: 7,
  offlineRefundMethod: "SAMPLE — bank transfer to the account you nominate",
  serviceCancellationHours: 24,
  dataRetention: "SAMPLE — eight years, as the Income-tax Act requires of invoices",
  privacyResponseDays: 30,
  privacyEmail: "sample-privacy@quoin.co.in",
};
