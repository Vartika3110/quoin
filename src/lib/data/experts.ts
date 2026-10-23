import { listProfessionals, type Professional } from "@/lib/data/professionals";
import { listServices, type Service } from "@/lib/data/services";

/**
 * Experts: the specialist end of what Quoin can send you.
 *
 * ## What this page can and cannot claim
 *
 * The brief asks for "bespoke artists, high end professionals for
 * customised works, and highly skilled artisans" — and Quoin's data
 * supports exactly one half of that. There are thirty real tradespeople
 * on the roster and ten real services. There is **no** rating, no job
 * count, no portfolio, no certification and no tier, and
 * `src/lib/data/professionals.ts` is explicit about why those four fields
 * are left empty: "a made-up 4.9 beside *Prem chand* is a claim about a
 * real person who never agreed to it."
 *
 * That rule is not relaxed here, so this page does not rank people and
 * does not call anybody an artist. What it does instead is the honest
 * version of the same filter: it narrows to the **work that is
 * specialist by nature** — design, bespoke joinery, finishes, survey —
 * and shows the trades and the people who do it, with a route to a paid
 * consultation for somebody who wants an opinion before committing.
 *
 * ## The one judgement on this page, made explicit
 *
 * `EXPERT_SERVICES` below is a business decision: which of Quoin's
 * services are specialist work rather than routine. It is a named
 * constant in a file somebody can review, not an inference, and changing
 * it is one line. Everything else on the page is derived.
 *
 * Nobody is promoted individually today. `Professional.expert` exists on
 * the interface for the day the owner marks people by hand — and until
 * somebody does, nothing on this page pretends to know.
 */

/**
 * The services that are specialist work.
 *
 * Chosen on one test: does doing this well require judgement and craft
 * that a competent general tradesperson does not have? Design and survey
 * are judgement; bespoke fitting and fine finishes are craft.
 *
 * Deliberately **not** here: the free `consultation` call-back, for the
 * reason noted inline below. And electrical, plumbing and civil work. They
 * are skilled, they are the backbone of what Quoin sells, and calling
 * them unspecialised would be wrong — but they are also the routine
 * trades a customer books to get something fixed, which is what
 * `/services` is for. A page that lists all ten services is `/services`
 * with a different heading, and the brief asks for the opposite: "this
 * section filters and be more specific".
 */
export const EXPERT_SERVICES: readonly string[] = [
  "architecture",
  "interior-design",
  "installation",
  "painting",
  "site-inspection",
  /* `consultation` is deliberately absent, and it was here at first.
     It is the free call-back, priced "Free." in `services.ts` — and the
     page puts the *paid* video consultation in its own block immediately
     underneath, from ₹99. Listing both meant a card reading "Consultation
     — Free." sitting directly above a button asking for ₹99, which reads
     as a bait rather than as two different offers. The free call back is
     still one click away on `/consult`, where the difference between the
     two is explained properly. */
];

/** What each specialist service is called *as expert work*, which is a
    different emphasis from the service card's own summary. */
export const EXPERT_FRAMING: Record<string, string> = {
  architecture: "Drawings, approvals and the structural decisions that come before anything is built.",
  "interior-design": "Layout, finish and palette — the work that decides how a finished room reads.",
  installation: "Bespoke joinery and fine fitting: made-to-measure wardrobes, units and carpentry.",
  painting: "Specialist finishes — textures, wood polish, stencils and feature walls.",
  "site-inspection": "A measured survey, condition notes and a quantity list you can order against.",
  /* Unused while `consultation` is out of `EXPERT_SERVICES`. Kept so
     putting it back is one line in one place. */
  consultation: "Twenty minutes of an expert's considered opinion, before you commit to anything.",
};

export interface ExpertRoster {
  /** The specialist services, in the order `EXPERT_SERVICES` lists them. */
  services: Service[];
  /**
   * The tradespeople who do that work, grouped by their trade.
   *
   * Grouped rather than listed flat, and grouped by *trade* rather than
   * ranked, because the trade is the only thing about these people this
   * codebase actually knows. A customer looking for someone to build a
   * wardrobe wants the carpenters, not a leaderboard.
   */
  crafts: { trade: string; people: Professional[] }[];
  /** Everyone counted, for the heading. */
  total: number;
}

export async function getExpertRoster(): Promise<ExpertRoster> {
  /* Neither of these touches the database — both are constants today —
     so they are awaited together rather than in rounds. */
  const [services, people] = await Promise.all([listServices(), listProfessionals()]);

  const bySlug = new Map(services.map((service) => [service.slug, service]));
  const specialist = EXPERT_SERVICES.flatMap((slug) => bySlug.get(slug) ?? []);

  /* The roster, narrowed to people booked through a specialist service.
     This is a statement about the *work*, not about the person: Amit is
     here because bespoke joinery is specialist work, not because anybody
     has graded Amit. */
  const expertSlugs = new Set(EXPERT_SERVICES);
  const relevant = people.filter(
    (person) => expertSlugs.has(person.serviceSlug) || person.expert === true,
  );

  const byTrade = new Map<string, Professional[]>();
  for (const person of relevant) {
    const list = byTrade.get(person.trade) ?? [];
    list.push(person);
    byTrade.set(person.trade, list);
  }

  const crafts = [...byTrade.entries()]
    .map(([trade, group]) => ({ trade, people: group }))
    /* Deepest trade first — it is the one Quoin can most reliably staff —
       then alphabetically, so the order is stable between renders. */
    .sort((a, b) => b.people.length - a.people.length || a.trade.localeCompare(b.trade));

  return { services: specialist, crafts, total: relevant.length };
}
