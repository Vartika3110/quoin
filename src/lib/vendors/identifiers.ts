/**
 * Checking a vendor's identifiers without calling anybody.
 *
 * Three tiers of check stand between a typo and a weekly payout landing
 * in a stranger's account. This module is the first and cheapest one:
 * everything here is arithmetic on the string itself, runs in
 * microseconds, costs nothing, and catches the overwhelming majority of
 * wrong entries — because the overwhelming majority of wrong entries are
 * mistyped rather than fraudulent.
 *
 * The other two tiers are not here and are deliberately named so nobody
 * believes this file is the whole of it:
 *
 *  - **Does it exist** — `ifsc.razorpay.com/{code}` answers for a branch,
 *    free and unauthenticated.
 *  - **Does it belong to them** — a penny drop returns the name the bank
 *    holds for an account, and a GSTIN lookup returns the registered
 *    name *and whether the registration is still live*. Both cost money
 *    per call and both need credentials Quoin does not have yet.
 *
 * `matchesName` below is written for the third tier even though nothing
 * calls it yet, because the hard part of a penny drop is not the call,
 * it is deciding whether "M/s Sharma Traders Pvt. Ltd." and "SHARMA
 * TRADERS" are the same business.
 */

/** ---- GSTIN -----------------------------------------------------------
 *
 * Fifteen characters: a two-digit state code, the holder's ten-character
 * PAN, a one-character entity number, a literal `Z`, and a checksum.
 *
 * The checksum is the part worth having. It is computed from the other
 * fourteen characters, so a single mistyped digit almost always fails it
 * — which means a wrong GSTIN is caught in the form rather than three
 * months later when an input-tax-credit claim is rejected.
 */

/** Position in this string *is* the value: `0`–`9` then `A`–`Z`. */
const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 01 Jammu & Kashmir through 38 Ladakh, plus 97 (other territory) and
    99 (centralised). A code outside these is not a state. */
function isStateCode(code: string): boolean {
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

export type GstinProblem =
  | "length"
  | "shape"
  | "state"
  | "checksum";

/**
 * `null` when the GSTIN is well formed, otherwise what is wrong with it.
 *
 * Returning the reason rather than a boolean because the form shows it:
 * "that is not a state code" and "the last character does not match the
 * rest" send somebody to different parts of the number.
 */
export function gstinProblem(raw: string): GstinProblem | null {
  const gstin = raw.trim().toUpperCase();

  if (gstin.length !== 15) return "length";
  /* State code, PAN, entity number, Z, checksum. The `Z` is fixed by the
     spec and is the cheapest single character to check. */
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) return "shape";
  if (!isStateCode(gstin.slice(0, 2))) return "state";
  if (gstin[14] !== gstinChecksum(gstin.slice(0, 14))) return "checksum";

  return null;
}

/**
 * The fifteenth character, from the first fourteen.
 *
 * Each character's value is its index in the alphabet above. Odd
 * positions (1-indexed) count once, even positions twice; a doubled
 * value that overflows 36 is folded by adding its quotient back — the
 * same trick as a Luhn digit, in base 36. The check digit is whatever
 * takes the total to a multiple of 36.
 */
function gstinChecksum(first14: string): string {
  let total = 0;

  for (let i = 0; i < first14.length; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(first14[i]);
    if (value < 0) return "";
    const weighted = value * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(weighted / 36) + (weighted % 36);
  }

  return GSTIN_ALPHABET[(36 - (total % 36)) % 36];
}

/** ---- PAN -------------------------------------------------------------
 *
 * Ten characters, `AAAAA9999A`. The fourth letter is the holder type —
 * `P` individual, `C` company, `F` firm, `H` HUF, `T` trust, and so on —
 * and the fifth is the first letter of the surname or entity name. There
 * is no checksum, so this is a shape check and nothing more.
 */
export function isPanShaped(raw: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(raw.trim().toUpperCase());
}

/**
 * The PAN a GSTIN contains, or null if the GSTIN is not well formed.
 *
 * Positions 3–12 of a GSTIN *are* the holder's PAN, which is worth using
 * rather than asking twice: a PAN typed separately that disagrees with
 * the one inside the GSTIN is a mistake in one of the two, and the form
 * can say so without calling anybody.
 */
export function panFromGstin(raw: string): string | null {
  const gstin = raw.trim().toUpperCase();
  if (gstinProblem(gstin)) return null;
  return gstin.slice(2, 12);
}

/** ---- IFSC ------------------------------------------------------------
 *
 * Eleven characters: four letters for the bank, a literal `0` reserved
 * for future use, then six for the branch. Shape only — whether the
 * branch exists is a question for `ifsc.razorpay.com`, which is free and
 * is the next tier up.
 */
export function isIfscShaped(raw: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(raw.trim().toUpperCase());
}

/** ---- UPI -------------------------------------------------------------
 * `name@handle`. The handle is a PSP's, not a domain, so there is no dot
 * to require and nothing here can tell a live VPA from a dead one.
 */
export function isVpaShaped(raw: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/.test(raw.trim());
}

/** ---- Account number ---------------------------------------------------
 * Indian account numbers run from nine to eighteen digits depending on
 * the bank, and carry no common check digit. Length and digits are all
 * that can be said without asking the bank.
 */
export function isAccountNumberShaped(raw: string): boolean {
  return /^[0-9]{9,18}$/.test(raw.trim());
}

/** ---- Name matching -----------------------------------------------------
 *
 * For the tier this module does not implement: a penny drop returns the
 * name the bank holds, and something has to decide whether it is the
 * same business as the one on the PAN.
 *
 * Exact comparison is useless — "M/s Sharma Traders Pvt. Ltd." and
 * "SHARMA TRADERS" are the same shop — and a fuzzy threshold that
 * auto-accepts is worse than useless, because the failure it lets
 * through is paying a stranger. So this answers one of three things and
 * the middle one goes to a person.
 */
export type NameMatch = "same" | "close" | "different";

/** Business-name furniture that carries no identity. */
const NOISE = [
  "m/s", "messrs", "pvt", "private", "ltd", "limited", "llp", "inc",
  "co", "company", "and", "&", "the", "india", "enterprises", "enterprise",
];

function normaliseName(value: string): string[] {
  return value
    .toLowerCase()
    /* `M/s` goes before the punctuation strip, not after. Stripped
       first it becomes the two words "m" and "s", and neither can be
       put in the noise list — a single letter is meaningful in plenty
       of real names. */
    .replace(/^\s*(m\/s|messrs)\.?\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !NOISE.includes(word));
}

/**
 * Compares two business names after stripping case, punctuation and the
 * furniture above.
 *
 * `same` when what is left is identical. `close` when one is a subset of
 * the other — "Sharma Traders" against "Sharma Traders Sanitary", which
 * is usually a trading name and usually fine, but is a judgement. Any
 * other overlap is `different`, including a shared first word: "Sharma
 * Traders" and "Sharma Electricals" are two businesses.
 */
export function matchesName(a: string, b: string): NameMatch {
  const left = normaliseName(a);
  const right = normaliseName(b);
  if (left.length === 0 || right.length === 0) return "different";

  const leftKey = left.join(" ");
  const rightKey = right.join(" ");
  if (leftKey === rightKey) return "same";

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shorter = left.length <= right.length ? left : right;
  const longerSet = left.length <= right.length ? rightSet : leftSet;

  /* Every word of the shorter name appearing in the longer one is the
     trading-name case. One word short of that is a different business. */
  return shorter.every((word) => longerSet.has(word)) ? "close" : "different";
}
