/**
 * Saying a list of localities out loud.
 *
 * Here, and not in `src/lib/data/service-areas.ts`, because both the
 * product page's delivery panel and the home hero are client components
 * and that module imports `db` — pulling it into a browser bundle is a
 * build error, and duplicating the sentence in two files is how the two
 * come to disagree about the Oxford comma while one of them quietly
 * stops naming the fourth area.
 */

/**
 * "Janakpuri, Paschim Vihar, Pitampura and Rajendra Nagar".
 *
 * `Intl.ListFormat` rather than `join(", ")` with a hand-written "and":
 * the last separator is a language's business, and this app already
 * renders `en-IN` numbers.
 *
 * **Never truncated with "and more".** Four localities is the whole
 * operation, and a customer in the fifth one needs to read that their
 * own is missing — a list that trails off lets them assume they are in
 * the part that was elided, which is the one mistake this sentence
 * exists to prevent.
 */
export function formatAreas(names: readonly string[]): string {
  return new Intl.ListFormat("en-IN", {
    style: "long",
    type: "conjunction",
  }).format(names);
}
