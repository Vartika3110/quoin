import type { SupportCategorySlug } from "@/lib/data/support";

/**
 * Help & Support's static content.
 *
 * Every answer here is checked against the code that actually runs, not
 * against what would be nice to promise — see `AGENTS.md`'s "never invent
 * a capability". Two things this file deliberately never says: a refund
 * or delivery *timeline* (nothing in this app schedules either), and a
 * response-time guarantee (nobody has committed to one). Where the honest
 * answer is "someone looks at it", that is the answer.
 */

export interface FaqEntry {
  q: string;
  a: string;
}

export interface SupportCategoryInfo {
  slug: SupportCategorySlug;
  label: string;
  /** One line under the tile — what this category is for, not a repeat of the label. */
  summary: string;
}

export const SUPPORT_CATEGORIES: SupportCategoryInfo[] = [
  { slug: "orders", label: "Orders", summary: "Status, contents and cancelling one" },
  { slug: "payments", label: "Payments", summary: "How paying works, and refunds" },
  { slug: "delivery", label: "Delivery", summary: "Dates, addresses and what arrives" },
  { slug: "products", label: "Products", summary: "Pricing, stock and specifications" },
  { slug: "projects", label: "Projects", summary: "Budgets, materials and linked orders" },
  { slug: "services", label: "Services", summary: "Consultations and site visits" },
  { slug: "parcha", label: "Parcha & uploads", summary: "Typed, photographed and scanned lists" },
  { slug: "account", label: "Account", summary: "Signing in and your details" },
];

export const FAQ: Record<SupportCategorySlug, FaqEntry[]> = {
  orders: [
    {
      q: "Why does my order say \"Pending payment\"?",
      a: "An order stays Pending payment until Quoin's server has confirmation that money actually moved — either Razorpay reports the payment captured, or (for a \"Confirm with an expert\" order) staff record the payment they took over the phone. A payment success screen in your browser is not that confirmation on its own, which is why the status can lag it by a few moments.",
    },
    {
      q: "Can I cancel an order?",
      a: "There is no self-serve cancel button yet. Raise a request here with the order's reference — use the \"About\" chip so it is attached automatically — and the team will handle it from there.",
    },
    {
      q: "Where can I see everything in an order?",
      a: "Account → Orders lists every order with what was in it, its total and its current status. Opening one shows the full breakdown, exactly as it was priced at the time.",
    },
  ],
  payments: [
    {
      q: "How does paying online work?",
      a: "Online payment opens Razorpay's own checkout for UPI, card or netbanking. Quoin never sees or stores your card details — Razorpay handles that part directly, and only tells Quoin whether the payment succeeded.",
    },
    {
      q: "I just paid — why does the order still look unpaid?",
      a: "An order is marked paid only once Razorpay's confirmation reaches Quoin's server, which can take a few moments after your screen shows success. If it still says Pending payment after a few minutes, raise a request here with the order's reference.",
    },
    {
      q: "What about \"Confirm with an expert\" orders?",
      a: "Those are not charged online at all. The order is placed first, and payment — by UPI, cash, bank transfer or cheque — is only taken once someone calls to confirm it.",
    },
    {
      q: "Can I get a refund?",
      a: "Raise a request here with the order's reference and what happened. There is no automated refund flow yet, so the team looks at each one and follows up directly.",
    },
  ],
  delivery: [
    {
      q: "When will my order arrive?",
      a: "Quoin does not generate an automated delivery date, courier name or tracking number today. You can always see an order's current stage on its page (Confirmed, Packed, Dispatched, Out for delivery, Delivered); an actual date is only ever given to you directly by someone at Quoin, over a call.",
    },
    {
      q: "Can I change the delivery address after placing an order?",
      a: "There is no self-serve edit on a placed order yet. Raise a request here with the order's reference and the new address, and the team will see what can still be done before it ships.",
    },
  ],
  products: [
    {
      q: "Do prices already include tax?",
      a: "Yes. Every price shown is inclusive of GST — the tax is broken out per line at checkout for the invoice, never added on top of what you saw on the product page.",
    },
    {
      q: "A product I want is out of stock — what can I do?",
      a: "On a product Quoin tracks stock for, you can ask to be told when it is back in. The team follows up on the phone number on your account once it is — there is no automated SMS or push for this yet.",
    },
  ],
  projects: [
    {
      q: "Can an order count toward a project's budget?",
      a: "Yes. From a project's page you can file an existing order under it; once it is linked, that order's total counts toward what the project has actually spent, alongside the budget you set for it.",
    },
    {
      q: "What happens to a project once the work is done?",
      a: "You can archive it. An archived project is kept, not deleted — it stays as the record of what was planned and what it cost, and you can go back to it any time.",
    },
  ],
  services: [
    {
      q: "How do I book a consultation or a site visit?",
      a: "Requesting one does not charge you anything and does not reserve a slot by itself — it asks Quoin to call you back, usually within one working day, to agree an actual time and, for a site visit, the fee.",
    },
    {
      q: "Can I change or cancel a booking?",
      a: "Raise a request here with the booking's reference — use the \"About\" chip so it is attached automatically — and the team will follow up with you directly.",
    },
  ],
  parcha: [
    {
      q: "What happens when I upload a parcha?",
      a: "A typed list or a CSV is read immediately and matched against the catalogue right away. A photograph or a PDF is read by an automatic reader when one is switched on for this deploy; when it isn't — or the file is something else, like an Excel workbook — a Quoin team member opens it and enters the list by hand instead.",
    },
    {
      q: "Does Quoin read handwritten lists?",
      a: "A photograph of a handwritten parcha goes through the same automatic reader as a printed one, when it is switched on. Either way, you always see the resulting list in an editable box before anything is priced, so you can fix anything it read wrong.",
    },
    {
      q: "Some items on my list didn't get priced — why?",
      a: "Matching only works against products actually in Quoin's catalogue, so a brand or item Quoin does not stock will not find a match. The line stays visible so you know it was read, just not something that could be priced.",
    },
  ],
  account: [
    {
      q: "How do I sign in?",
      a: "With a one-time code sent to your phone, or with a Google account — there is no password to remember either way.",
    },
    {
      q: "Where do I update the number my orders deliver to?",
      a: "In Account → Settings, under your delivery phone. If you signed in with your own phone number, that verified number is always used for delivery ahead of anything typed into Settings.",
    },
    {
      q: "I signed in with Google — why is there no phone number on my account?",
      a: "Google does not hand over a phone number, so a Google account starts without one. Add a delivery phone in Account → Settings so orders and deliveries have a number to reach.",
    },
  ],
};
