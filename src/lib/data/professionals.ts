/**
 * The professionals Quoin books, as the home page shows them.
 *
 * ## Everything here is SAMPLE data
 *
 * The owner asked for the reference design's roster — a name, a trade, a
 * star rating, a job count, a response time and a visit fee each — and
 * this is it. **None of it is real.** There is no vendor table in this
 * schema, nobody has been rated, nobody has completed a counted job, and
 * no roster behind the app makes a response time true.
 *
 * So it follows `src/lib/company.ts` exactly: placeholder values with the
 * shape of the real thing, and one switch that says so out loud.
 * `PROFESSIONALS_ARE_SAMPLE` is true while any row below is invented, and
 * the surfaces that print them use it to label the row rather than
 * quietly asserting a 4.9 nobody earned.
 *
 * This is the whole reason the flag exists. A page of invented names with
 * invented ratings is the most damaging thing a marketplace can ship,
 * because it teaches a customer that the numbers on this site are
 * decorative — and the catalogue's 2,513 prices are not decorative. The
 * flag keeps the layout reviewable without spending that credibility.
 *
 * ## Replacing this with real people
 *
 * Two steps, and the second is the one that matters.
 *
 *  1. Put the real roster in `PROFESSIONALS` and set the flag false. The
 *     cards stop being labelled and start being claims.
 *  2. Move it to the database. A roster that changes — someone leaves,
 *     a rating moves, a fee is renegotiated — does not belong in a
 *     deployed constant. `listProfessionals` is already async and returns
 *     what a `/api/v1/professionals` endpoint would, so that move is an
 *     implementation change rather than a rewrite of the card.
 *
 * **Do not add a rating until there is a review table.** A number with
 * nothing behind it is the one field here that cannot be corrected later:
 * a customer who booked on a 4.9 and got a bad job has been actively
 * misled, not merely under-informed.
 */

/** True while any row below is invented. See above. */
export const PROFESSIONALS_ARE_SAMPLE = true;

export interface Professional {
  id: string;
  /** As they would be introduced on the phone. */
  name: string;
  /** The trade, as a customer would say it — "Senior Electrician". */
  trade: string;
  /** Which `Service` this person is booked through. Must match a slug in
      `src/lib/data/services.ts`, or the card's Book button leads nowhere
      the booking form understands. */
  serviceSlug: string;
  /** Out of 5. Meaningless until a review table exists — see above. */
  rating: number;
  /** Completed jobs, floored to the nearest ten for the "1,240+" form. */
  jobsCompleted: number;
  /** Typical minutes to respond to a request. */
  responseMinutes: number;
  /** The visit fee in paise, matching every other money value in this
      codebase. Never rupees, never a float. */
  visitFeePaise: number;
}

export const PROFESSIONALS: Professional[] = [
  {
    id: "sample-1",
    name: "SAMPLE — electrician",
    trade: "Senior Electrician",
    serviceSlug: "electrical",
    rating: 4.9,
    jobsCompleted: 1240,
    responseMinutes: 15,
    visitFeePaise: 29_900,
  },
  {
    id: "sample-2",
    name: "SAMPLE — plumber",
    trade: "Licensed Plumber",
    serviceSlug: "plumbing",
    rating: 4.8,
    jobsCompleted: 980,
    responseMinutes: 20,
    visitFeePaise: 24_900,
  },
  {
    id: "sample-3",
    name: "SAMPLE — painter",
    trade: "Painting Contractor",
    serviceSlug: "painting",
    rating: 4.7,
    jobsCompleted: 760,
    responseMinutes: 30,
    visitFeePaise: 39_900,
  },
  {
    id: "sample-4",
    name: "SAMPLE — carpenter",
    trade: "Carpenter & Fitter",
    serviceSlug: "installation",
    rating: 4.8,
    jobsCompleted: 610,
    responseMinutes: 25,
    visitFeePaise: 34_900,
  },
];

/**
 * Async, and returning what an endpoint would, so moving this to the
 * database later does not touch the card. See the note above.
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
