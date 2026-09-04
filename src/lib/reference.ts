import { randomInt } from "node:crypto";

/**
 * Human-quotable reference codes.
 *
 * Shared because there is now more than one thing a customer reads down a
 * phone line — a consultation and an order — and two copies of this
 * alphabet would drift the moment one of them gained a character the
 * other did not.
 */

/**
 * No O, 0, I, 1, S or 5. This code is read down a phone line and written
 * on the back of a card, and those are the pairs that come back wrong.
 */
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
const LENGTH = 6;

/** 29^6 ≈ 594M codes; a handful of retries covers any realistic volume. */
export const REFERENCE_ATTEMPTS = 5;

/**
 * `randomInt`, not `Math.random`: the reference is the only thing a
 * customer quotes to identify their order, so it must not be guessable
 * from another one issued the same second.
 */
export function generateReference(prefix: string): string {
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${out}`;
}
