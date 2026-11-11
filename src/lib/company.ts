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
 *
 * That was aspirational when it was written. The footer read from here;
 * `/contact`, `/grievance` and `/privacy` carried their own hard-coded
 * `<ToConfirm>` markers, so filling this file in would have left three
 * policy pages still saying "to confirm". They now read `CompanyFact`
 * (`src/app/(legal)/legal-ui.tsx`), which prints a value from here only
 * once `COMPANY_DETAILS_ARE_SAMPLE` is false, so the sentence above is
 * true and `npm run check:legal` reports on both halves.
 */

export interface CompanyDetails {
  /** The registered entity, as it appears on the incorporation certificate. */
  legalName: string;
  /** What customers call it. */
  tradingName: string;
  registeredAddress: string;
  gstin: string;
  supportEmail: string;
  /**
   * Where data requests go — a copy of someone's data, a correction, an
   * account deletion. Published on `/privacy` under "Your rights".
   *
   * Its own field rather than reusing `supportEmail`, even though at a
   * small business the two are normally one mailbox with an alias in
   * front of it. Two reasons, and neither is tidiness. A deletion
   * request arrives with a statutory clock on it and wants to be
   * filterable out of a queue of delivery questions. And if the two ever
   * do diverge — someone is hired to handle this, or counsel asks for a
   * separate route — that should be an edit to this file, not a change
   * to the wording of a policy page.
   */
  privacyEmail: string;
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
  /* One address for all three. The fields stay separate so that giving
     data requests or complaints their own mailbox later is an edit here
     and not a change to a policy page's wording — see `privacyEmail`
     above — but today they are one alias on one inbox, which is what a
     business this size actually runs. */
  supportEmail: "support@quoin.co.in",
  privacyEmail: "support@quoin.co.in",
  supportPhone: "+91 00000 00000",
  supportHours: "Mon–Sat, 10am–7pm",
  grievanceOfficer: {
    name: "SAMPLE — grievance officer name",
    email: "support@quoin.co.in",
    phone: "+91 00000 00000",
  },
};
