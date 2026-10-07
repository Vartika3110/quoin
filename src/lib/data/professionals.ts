/**
 * The people Quoin books, from the owner's own roster.
 *
 * Thirty real tradespeople, replacing the sample rows this file shipped
 * with. Two things about that roster decided the shape of everything
 * below, and both are worth stating because they are easy to undo by
 * accident.
 *
 * ## 1. No phone numbers live here
 *
 * The source sheet has a mobile number for every person. **None of them
 * are in this file**, and that is deliberate rather than an oversight.
 *
 * This module is imported by a server component that passes what it
 * returns to `ProfessionalRail` as props, so every field here is
 * serialised into the page's own payload and readable by anyone who
 * views source. Publishing a tradesperson's personal mobile would be
 * handing out thirty people's contact details to the open internet — and
 * it would route work around the business that is standing behind it,
 * since a customer who can read the number has no reason to book through
 * Quoin at all.
 *
 * Quoin calls the customer back. That is what `/services/book` is for,
 * and the numbers belong where the person making that call can see them:
 * an operations table behind authentication, not a constant compiled
 * into the storefront bundle.
 *
 * ## 2. Nobody has a rating, a job count, a response time or a fee
 *
 * The roster carries none of those four, and this file invents none of
 * them. They were placeholders before and they are gone rather than
 * carried over with real names attached to them — a made-up 4.9 beside
 * an invented name is a design mock, but a made-up 4.9 beside *Prem
 * chand* is a claim about a real person who never agreed to it.
 *
 * The four fields stay on the interface as optional, so the card renders
 * them the day they are real and shows what is true until then: the
 * trade, where the person works, and when.
 *
 * ## Who was left out, and why
 *
 * - **Deepak** and **Sanjay** are marked "no response" in the sheet. A
 *   roster is an offer to book somebody; nobody who has not answered can
 *   be offered.
 * - **Md Altamash** and **Mehboob khan** have no trade recorded. There is
 *   no honest place to file them.
 * - **Amit** appears twice on the same number and is listed once.
 *
 * Four phone numbers in the sheet are not ten digits — nitin's has
 * eleven, Mohit's has nine. They are not stored here, but they will need
 * correcting before anybody tries to ring them.
 */

/**
 * True while any row below is a placeholder.
 *
 * Now false: these are real people. The surfaces that print them stop
 * labelling the row as sample data — which is the whole point of the
 * flag, and why it is a constant rather than a check for the word
 * "SAMPLE".
 */
export const PROFESSIONALS_ARE_SAMPLE = false;

export interface Professional {
  id: string;
  /** As they would be introduced on the phone. */
  name: string;
  /** The trade, as a customer would say it — "Carpenter", "Plumber". */
  trade: string;
  /** Which `Service` this person is booked through. Must match a slug in
      `src/lib/data/services.ts`, or the Book button leads somewhere the
      booking form does not understand. */
  serviceSlug: string;
  /** Where they work, when the sheet records it. Not everyone's is
      known, and an invented locality is a promise to travel. */
  area?: string;
  /** When they work, when the sheet records it. */
  availability?: string;

  /* The four the roster does not carry. Optional, so the card shows them
     the day they are real and omits them until then. Do not fill any of
     these in by hand: a rating needs a review table, a job count needs
     booking history, a response time needs measurement, and a fee is the
     owner's to set. */
  rating?: number;
  jobsCompleted?: number;
  responseMinutes?: number;
  visitFeePaise?: number;
}

/** Carpenter, Tile and AC have no service of their own yet. Carpentry and
    air-conditioning are fitting work, tiling is masonry — so each books
    through the service that actually covers it rather than inventing
    three new ones nobody has written a scope for. */
export const PROFESSIONALS: Professional[] = [
  // ---- Electrical ------------------------------------------------------
  {
    id: "prem-chand",
    name: "Prem Chand",
    trade: "Electrician",
    serviceSlug: "electrical",
    area: "Paschim Vihar (National Market)",
    availability: "All days, mornings",
  },
  { id: "girish", name: "Girish", trade: "Electrician", serviceSlug: "electrical" },
  { id: "mohit", name: "Mohit", trade: "Electrician", serviceSlug: "electrical" },

  // ---- Plumbing --------------------------------------------------------
  { id: "bhola", name: "Bhola", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "neranjan", name: "Neranjan", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "pappu-plumber", name: "Pappu", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "mehak-singh", name: "Mehak Singh", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "badal", name: "Badal", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "pinto", name: "Pinto", trade: "Plumber", serviceSlug: "plumbing" },
  { id: "ratan", name: "Ratan", trade: "Plumber", serviceSlug: "plumbing" },

  // ---- Painting --------------------------------------------------------
  { id: "inderjeet-singh", name: "Inderjeet Singh", trade: "Painter", serviceSlug: "painting" },
  { id: "rakesh", name: "Rakesh", trade: "Painter", serviceSlug: "painting" },
  { id: "sultan", name: "Sultan", trade: "Painter", serviceSlug: "painting" },
  { id: "mahesh", name: "Mahesh", trade: "Painter", serviceSlug: "painting" },

  // ---- Carpentry, booked as fitting work -------------------------------
  {
    id: "amit",
    name: "Amit",
    trade: "Carpenter",
    serviceSlug: "installation",
    area: "Paschim Vihar",
    availability: "Monday to Sunday, mornings",
  },
  {
    id: "pappu-carpenter",
    name: "Pappu",
    trade: "Carpenter",
    serviceSlug: "installation",
    area: "Pitampura",
    availability: "Mondays, mornings",
  },
  { id: "ashok", name: "Ashok", trade: "Carpenter", serviceSlug: "installation" },
  { id: "anil", name: "Anil", trade: "Carpenter", serviceSlug: "installation" },
  { id: "irfan", name: "Irfan", trade: "Carpenter", serviceSlug: "installation" },
  { id: "naveen", name: "Naveen", trade: "Carpenter", serviceSlug: "installation" },
  { id: "faizan", name: "Faizan", trade: "Carpenter", serviceSlug: "installation" },
  { id: "sachin", name: "Sachin", trade: "Carpenter", serviceSlug: "installation" },
  { id: "satish", name: "Satish", trade: "Carpenter", serviceSlug: "installation" },
  { id: "pankaj", name: "Pankaj", trade: "Carpenter", serviceSlug: "installation" },
  { id: "chand", name: "Chand", trade: "Carpenter", serviceSlug: "installation" },
  { id: "nitin", name: "Nitin", trade: "Carpenter", serviceSlug: "installation" },

  // ---- Tiling, booked as civil work ------------------------------------
  { id: "heera", name: "Heera", trade: "Tiler", serviceSlug: "civil-work" },
  { id: "santosh", name: "Santosh", trade: "Tiler", serviceSlug: "civil-work" },
  { id: "patel", name: "Patel", trade: "Tiler", serviceSlug: "civil-work" },

  // ---- Air conditioning, booked as fitting work ------------------------
  { id: "amir", name: "Amir", trade: "AC Technician", serviceSlug: "installation" },
];

/**
 * Async, and returning what an endpoint would, so moving this roster to
 * the database later does not touch the card. It should move: thirty
 * people with contact details is operations data, and the numbers that
 * belong beside these names cannot live in a storefront bundle.
 */
export async function listProfessionals(): Promise<Professional[]> {
  return PROFESSIONALS;
}

/** "1,240+" — floored to the nearest ten, because an exact job count
    invites a precision the number does not have. */
export function jobsLabel(jobs: number): string {
  return `${(Math.floor(jobs / 10) * 10).toLocaleString("en-IN")}+ jobs`;
}

/** The two letters on the avatar. Falls back to one when there is no
    second word, rather than rendering an empty square. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
