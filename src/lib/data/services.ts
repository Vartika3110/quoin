import { listProducts } from "@/lib/data/catalog";
import type { Product } from "@/lib/types/catalog";
import type { ConsultMode } from "@/lib/types/consult";

/**
 * The services Quoin books.
 *
 * Presentation config, not catalogue rows — and that is a statement about
 * the data rather than a shortcut. There is exactly one `bookable` product
 * in the catalogue today, so a services section built by querying the
 * catalogue would be a single unloading service and thirteen empty pages.
 *
 * So the *shape* of the offer is defined here, and everything numeric is
 * either read from the catalogue or refused. Specifically:
 *
 *  - **No prices are invented.** A service shows a price only when a real
 *    bookable product backs it; otherwise it says the fee is quoted after
 *    the scope is seen, which is how this trade actually works.
 *  - **No professionals are listed.** There is no vendor table, and a page
 *    of invented names with invented ratings is the single most damaging
 *    thing a marketplace can ship.
 *  - **No reviews.** Same reason.
 *
 * Every booking routes to the consultation flow, which is real: it writes
 * a row, mails the team and shows up in the account.
 *
 * The accessors are async and return the shapes a `/api/v1/services`
 * endpoint would, so moving this to the database later is an
 * implementation change rather than a rewrite of every page.
 */

export type ServiceIcon =
  | "architect"
  | "interior"
  | "electrical"
  | "plumbing"
  | "painting"
  | "civil"
  | "installation"
  | "consultation";

export interface Service {
  slug: string;
  name: string;
  /** One line, used on cards and in search. */
  summary: string;
  icon: ServiceIcon;
  /** Longer description for the service's own page. */
  description: string;
  /** What the customer gets. Concrete deliverables, not adjectives. */
  includes: string[];
  /** What it explicitly does not cover, so nobody books the wrong thing. */
  excludes: string[];
  /** How the fee is arrived at. Never a number nobody has agreed to. */
  pricing: string;
  /** Realistic elapsed time, stated as a range. */
  timeline: string;
  /** Which consultation mode this service starts from. */
  startsWith: ConsultMode;
  /** Catalogue category to shop alongside the service, when there is one. */
  shopCategorySlug?: string;
}

const SERVICES: Service[] = [
  {
    slug: "architecture",
    name: "Architecture",
    summary: "Drawings, approvals and structure for a new build or an addition.",
    icon: "architect",
    description:
      "A registered architect takes the site from a measured survey through to the drawing set your contractor builds from — plans, elevations, sections and the structural coordination behind them.",
    includes: [
      "Measured site survey and existing-condition drawings",
      "Concept layout with two revisions",
      "Working drawing set for construction",
      "Structural coordination with the consulting engineer",
    ],
    excludes: [
      "Municipal approval fees and statutory charges",
      "Site supervision, which is contracted separately",
    ],
    pricing: "Quoted per square foot after the site visit.",
    timeline: "Four to ten weeks, depending on approvals.",
    startsWith: "site_visit",
  },
  {
    slug: "interior-design",
    name: "Interior design",
    summary: "Layout, materials and a specification your contractor can price.",
    icon: "interior",
    description:
      "A designer works through the space room by room and hands over a specification — finishes, fittings and joinery details — with every line matched to something you can actually buy.",
    includes: [
      "Room-by-room layout and furniture plan",
      "Material and finish board with real product references",
      "Joinery drawings for wardrobes and kitchen units",
      "A priced material list on Quoin",
    ],
    excludes: [
      "Furniture procurement outside the Quoin catalogue",
      "Bespoke art and styling",
    ],
    pricing: "Quoted per room after the site visit.",
    timeline: "Three to six weeks per home.",
    startsWith: "site_visit",
    shopCategorySlug: "plywood-laminates",
  },
  {
    slug: "civil-work",
    name: "Civil work",
    summary: "Demolition, masonry, plaster and everything structural.",
    icon: "civil",
    description:
      "The wet trades, run by a contractor who has done it before: breaking out, block work, plaster, screeds and the making-good that every renovation underestimates.",
    includes: [
      "Demolition and debris removal",
      "Block work, plaster and screeds",
      "Waterproofing to wet areas",
      "Making good around new services",
    ],
    excludes: ["Structural alterations without an engineer's drawing"],
    pricing: "Quoted against a measured scope. Materials billed separately.",
    timeline: "Two to twelve weeks by scope.",
    startsWith: "site_visit",
    shopCategorySlug: "cement-steel",
  },
  {
    slug: "electrical",
    name: "Electrical",
    summary: "Wiring, distribution boards, points and fittings.",
    icon: "electrical",
    description:
      "A licensed electrician takes the load schedule through to a tested installation — conduits, wiring, the board and every point terminated and labelled.",
    includes: [
      "Load schedule and point layout",
      "Conduiting and wiring to the board",
      "Distribution board, MCBs and earthing",
      "Fitting and testing of switches, sockets and fixtures",
    ],
    excludes: ["Utility meter applications and supply upgrades"],
    pricing: "Quoted per point, or per day for repairs.",
    timeline: "Three days to four weeks.",
    startsWith: "site_visit",
    shopCategorySlug: "electricals-lighting",
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    summary: "Supply, drainage, sanitaryware and everything that leaks.",
    icon: "plumbing",
    description:
      "Concealed supply and drainage laid and pressure-tested before anything is tiled over, then sanitaryware and mixers fitted and commissioned.",
    includes: [
      "Supply and drainage layout",
      "Concealed pipework, pressure-tested before tiling",
      "Sanitaryware and mixer installation",
      "Commissioning and leak testing",
    ],
    excludes: ["Municipal connection work and borewell installation"],
    pricing: "Quoted per point, or per day for repairs.",
    timeline: "Two days to three weeks.",
    startsWith: "site_visit",
    shopCategorySlug: "bathware-plumbing",
  },
  {
    slug: "painting",
    name: "Painting",
    summary: "Preparation, primer and finish coats, done properly.",
    icon: "painting",
    description:
      "Most of a good paint job is what happens before the colour: surfaces filled, sanded, primed and masked. Quoted by area with the preparation named explicitly, so the cheap quote and the real one can be compared.",
    includes: [
      "Surface preparation, filling and sanding",
      "Primer and two finish coats",
      "Masking and protection of floors and fittings",
      "Site cleaned on completion",
    ],
    excludes: ["Structural crack repair and damp treatment"],
    pricing: "Quoted per square foot of painted area.",
    timeline: "Three days to two weeks.",
    startsWith: "site_visit",
    shopCategorySlug: "paints-finishes",
  },
  {
    slug: "installation",
    name: "Installation",
    summary: "Fitting what you bought — from a single mixer to a full kitchen.",
    icon: "installation",
    description:
      "A fitter attends with the right tools for what is being installed, and takes the packaging away. Booked against a date rather than quoted, because the scope is known before anyone arrives.",
    includes: [
      "Fitting of the products in your order",
      "Testing and demonstration on completion",
      "Removal of packaging and offcuts",
    ],
    excludes: ["Civil or electrical alterations needed to make an item fit"],
    pricing: "Booked per visit. The fee is shown before you confirm.",
    timeline: "Same week, in serviceable areas.",
    startsWith: "site_visit",
  },
  {
    slug: "consultation",
    name: "Consultation",
    summary: "Twenty minutes with an expert before you commit to anything.",
    icon: "consultation",
    description:
      "A video call with someone who has built what you are building. Material options, a budget range, and a written summary afterwards — with nothing to buy at the end of it.",
    includes: [
      "Twenty minutes of an expert's time",
      "Material and finish options for your job",
      "A budget range before you commit",
      "A written summary afterwards",
    ],
    excludes: ["Nothing is measured on a call — a quote needs a site visit"],
    pricing: "Free.",
    timeline: "Usually within 48 hours.",
    startsWith: "video",
  },
];

export async function listServices(): Promise<Service[]> {
  return SERVICES;
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  return SERVICES.find((s) => s.slug === slug) ?? null;
}

/**
 * The bookable rows that do exist in the catalogue.
 *
 * Shown on the services index under their own heading rather than mixed
 * into the service cards, because these are priced, buyable things and
 * the services above are quoted engagements. Conflating the two is how a
 * customer ends up expecting a fixed price for a rewire.
 */
export async function listBookableProducts(): Promise<Product[]> {
  const page = await listProducts({ fulfilment: "bookable", pageSize: 12 });
  return page.items;
}
