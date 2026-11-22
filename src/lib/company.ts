/**
 * Who Quoin is, as a customer needs to be told.
 *
 * One file, because these same five facts are owed in at least five
 * places — the footer, `/contact`, `/grievance`, `/privacy` and a payment
 * gateway's onboarding review — and a registered address that disagrees
 * with itself across two pages is worse than one that is missing from
 * both.
 *
 * ## The entity details are real; the policy periods are not yet
 *
 * `COMPANY` below carries this business's actual details, and
 * `COMPANY_DETAILS_ARE_SAMPLE` is false. `POLICY` further down still
 * holds placeholders, so `POLICY_IS_SAMPLE` is true and every legal page
 * still shows its "not final" notice. Two flags, because the two sets
 * are filled by different people from different sources.
 *
 * ## Where each field is printed, and why it is there
 *
 * Deliberately uneven, so that a detail appears where somebody needs it
 * and not on all forty routes:
 *
 * - **Footer, every page** — trading name, legal name. Support email.
 *   *Not* the phone: a number in a footer is the first thing a scraper
 *   takes, and `/contact` is one click away.
 * - **`/contact`** — support email, phone, hours. *Not* the registered
 *   address; somebody writing to the company does not need it and
 *   publishing it forty times over is not what the Rules ask for.
 * - **`/privacy`** — the entity block: legal name, registered address,
 *   GSTIN if there is one. This is the "who we are" disclosure.
 * - **`/grievance`** — the officer if one is appointed, otherwise
 *   support, plus the registered address.
 *
 * Anything absent is absent on purpose. Nothing here should ever hold a
 * placeholder that a reader could mistake for a fact — that is what the
 * `null`s and the flags are for.
 */

export interface CompanyDetails {
  /**
   * The name the business trades and is addressed under.
   *
   * Usually the registered entity from an incorporation certificate.
   * **Quoin Ventures is a sole proprietorship**, so there is no such
   * certificate and no entity separate from its owner: on the GST
   * registration this is the *Trade Name*, while the *Legal Name* field
   * carries the proprietor's own name from their PAN.
   *
   * The owner's decision is to publish the trade name and not their
   * personal one. Recorded here so the next reader does not "fix" it.
   * The thing to watch is Razorpay: its KYC is in the proprietor's
   * name, and a reviewer comparing the account to the site is where the
   * difference would surface.
   */
  legalName: string;
  /** What customers call it. */
  tradingName: string;
  registeredAddress: string;
  /**
   * `null` where the business does not publish one.
   *
   * GST law requires a GSTIN on the name board and on every tax invoice.
   * It does not require one on a website, and this site issues no tax
   * invoice — `/account/orders/[reference]/receipt` is labelled "Order
   * summary" precisely because it is not one. So omitting it here is a
   * real choice rather than an omission, and the type says so instead of
   * forcing a placeholder into the field.
   *
   * Razorpay's merchant review does tend to look for it, which is a
   * reason to fill it in eventually and not a reason to invent one.
   */
  gstin: string | null;
  supportEmail: string;
  supportPhone: string;
  /** When somebody actually answers that phone. */
  supportHours: string;
  /**
   * India's Consumer Protection (E-Commerce) Rules, 2020 require an
   * e-commerce entity to appoint one and publish their name and contact
   * details. A role title is not enough — the rule asks for a person.
   *
   * `null` means **nobody has been appointed yet**, which is the owner's
   * decision and is recorded here honestly rather than papered over with
   * a plausible-looking name. `/grievance` then routes complaints to
   * support and keeps the statutory 48-hour and one-month commitments,
   * which serves a complaining customer but does **not** satisfy the
   * letter of the Rules. Naming a person — a director will do — is the
   * cheapest open item on the compliance list.
   */
  grievanceOfficer: {
    name: string;
    email: string;
    phone: string;
  } | null;
}

/**
 * True while any value above is still a placeholder.
 *
 * It is deliberately one manual switch rather than a check for the word
 * "SAMPLE": a half-replaced file should stay flagged, and a value that is
 * real but wrong is not something a string match can catch anyway.
 *
 * **A deliberately omitted field does not make this true.** `null` is an
 * answer — "we do not publish this" — and the surfaces below render
 * around it. A placeholder is the absence of an answer, and that is what
 * this flag is for. The distinction matters because the old shape forced
 * every field to be a `string`, which is exactly how the file came to
 * carry an invented GSTIN: there was no way to say "none".
 */
export const COMPANY_DETAILS_ARE_SAMPLE = false;

export const COMPANY: CompanyDetails = {
  legalName: "Quoin Ventures",
  tradingName: "Quoin",
  registeredAddress:
    "Second Floor, D-30, Surya Enclave, Multan Nagar, West Delhi, New Delhi 110063",
  /* Not published — see the note on the field. */
  gstin: null,
  supportEmail: "support@quoin.co.in",
  supportPhone: "+91 96676 20940",
  supportHours: "Mon–Sun, 9am–9pm",
  /* Not appointed yet — see the note on the field. */
  grievanceOfficer: null,
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
export const POLICY_IS_SAMPLE = false;

export const POLICY: PolicyTerms = {
  /* Published already — see the note above. Not a placeholder. */
  returnWindowDays: 7,

  damageReportDays: 2,
  refundInitiationDays: 7,
  /* Real. Covers every offline method including cash, which a UPI
     reversal cannot, and leaves a trail on both sides. */
  offlineRefundMethod: "bank transfer to the account you nominate",
  serviceCancellationHours: 24,
  /**
   * A period, not a citation — and deliberately so.
   *
   * Quoin Ventures is a **sole proprietorship**, so the Companies Act
   * 2013 does not reach it and its s.128 figure of eight years is not
   * the rule here. Two statutes are:
   *
   * - Income-tax Rule 6F — six years from the end of the relevant
   *   **assessment year**;
   * - CGST s.36 — seventy-two months from the due date of the annual
   *   return.
   *
   * **Neither of those is six years from the invoice.** An invoice
   * raised in FY 2026-27 belongs to assessment year 2027-28, which ends
   * 31 March 2028, and six years from there is 2034 — a little over
   * seven years after the sale. Both rules land in the same place.
   *
   * So the value is seven, not six. A customer reads "kept for N years"
   * as N years from their purchase, and a policy promising six while
   * the law needs the record for seven is a promise to delete evidence
   * early. Keeping records longer than required is not a breach;
   * keeping them too short is, and here the shorter number is the one
   * that looks statutory.
   */
  dataRetention: "seven years",
  privacyResponseDays: 30,
  /* Real. One inbox rather than an alias nobody would monitor: a
     privacy request that lands somewhere unread is worse than one that
     arrives beside the order queries, and the DPDP Act cares that it is
     answered, not that it arrived at a dedicated address. */
  privacyEmail: "support@quoin.co.in",
};
