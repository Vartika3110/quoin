import type { FaqEntry } from "@/lib/support/faq";

/**
 * The questions people ask before paying to talk to somebody.
 *
 * Its own list rather than a section inside `src/lib/support/faq.ts`,
 * because that file answers questions about *orders* — delivery, returns,
 * payment — and is rendered on `/faq` and `/account/support`. These
 * answers only make sense standing next to the booking form, and half of
 * them are about money changing hands before any work is done, which is
 * the thing a customer is entitled to be suspicious about.
 *
 * ## The rule these answers follow
 *
 * Every one of them is checkable against the code. The hold is fifteen
 * minutes because `CONSULT_HOLD_MINUTES` is 15. The link appears on
 * payment because `getBookingByReference` releases `videoRoom` only when
 * `paymentStatus` is `PAID`. The refund promise is the one place this
 * list makes a commitment the code cannot keep on its own — a human has
 * to issue the refund — so it is worded as what Quoin will do, not as
 * something automatic.
 *
 * Nothing here promises a named expert, a recording, a written report or
 * a timeline for anything. `src/lib/data/services.ts` sets that rule for
 * the services and it holds here: no professionals, no reviews, no
 * promised capacity.
 */
export const CONSULT_FAQ: FaqEntry[] = [
  {
    q: "What exactly do I get for the fee?",
    a: "A scheduled video call of 15 to 20 minutes with a Quoin expert, at the time you picked. You can share your screen, show them the room on your camera, and ask whatever you came to ask. The fee covers the call and the expert's attention on your problem — nothing else is charged during it.",
  },
  {
    q: "Why are there three prices?",
    a: "Because three different kinds of question take three different amounts of preparation. ₹99 is repair and service guidance — what is wrong and who fixes it. ₹149 is product and material selection, where the expert has to know the catalogue, the grades and the quantities. ₹200 is interiors and renovation, which means layout, finishes, sequencing and a budget. Pick the one your question sits in; if you are between two, pick the cheaper and we will tell you on the call if it needs more.",
  },
  {
    q: "Is GST extra?",
    a: "No. ₹99, ₹149 and ₹200 are what you pay. The tax is already inside the price, as it is everywhere else on Quoin.",
  },
  {
    q: "How do I join the call? Do I need to install anything?",
    a: "Nothing to install. The moment your payment clears, a Join button appears on your booking page and the link works in any modern browser on a phone or a laptop. The button goes live ten minutes before the start time.",
  },
  {
    q: "What happens if I cannot make it?",
    a: "Tell us before the call and we will move it to another slot at no charge. If you simply do not turn up, the slot and the fee are used — the expert held that time for you and turned down other work for it.",
  },
  {
    q: "What if Quoin misses the call?",
    a: "You get the full fee back, and we will say so without being asked. If an expert cannot make the time we agreed, that is our failure, not a scheduling inconvenience to pass on to you.",
  },
  {
    q: "Will the expert try to sell me things?",
    a: "They will tell you what to buy if that is what you asked — that is the point of the ₹149 band. What they will not do is pretend a product is the only option when it is not. If the honest answer is that your existing fitting is fine, you will be told that, and you will have paid ₹99 to avoid spending ₹9,000.",
  },
  {
    q: "Do I have to book a service afterwards?",
    a: "No. The consultation stands on its own and the fee is not conditional on ordering anything. Plenty of people book one specifically so they can brief their own contractor properly.",
  },
  {
    q: "Is the fee deducted from a later order or service?",
    a: "Not automatically, and we are not going to claim otherwise. If the call leads directly to work Quoin carries out, mention the consultation reference when you book it and we will take a view on it then.",
  },
  {
    q: "Can I get it in writing?",
    a: "Anything specific you agree on the call — a product shortlist, quantities, a sequence of work — we will send to you on WhatsApp afterwards. It is a summary of what was said, not a stamped drawing or a structural opinion.",
  },
  {
    q: "Can the expert quote for the job on the call?",
    a: "Not a firm one. Nothing is measured on a video call, so any number on it is a range. A quote you can order against needs a site visit, which is the other option on this page and is priced after someone has seen the scope.",
  },
  {
    q: "What language will the call be in?",
    a: "Hindi or English, whichever you are comfortable in. Say so in the notes when you book and we will match the expert to it.",
  },
  {
    q: "How long is my slot held while I pay?",
    a: "Fifteen minutes. If the payment does not complete in that time the slot goes back on the board — nothing is charged, and you can book again.",
  },
  {
    q: "What if I just have a quick question?",
    a: "Do not pay for it. Request a free call back further down this page, or ask the assistant in the search bar — it will point you at the right product or trade for nothing. The paid call is for when you want somebody's considered opinion for twenty minutes.",
  },
];

/**
 * The same questions as `FAQPage` structured data.
 *
 * Worth emitting: these are exactly the queries somebody types before
 * searching for an interior consultant, and the answers are genuinely on
 * the page rather than teased on it — which is the condition Google's
 * guidance actually sets.
 */
export function consultFaqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: CONSULT_FAQ.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
}
