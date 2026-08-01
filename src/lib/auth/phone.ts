/**
 * Phone normalisation.
 *
 * Every phone number is normalised to E.164 before it touches the
 * database or an OTP hash. "98765 43210", "+91 98765-43210" and
 * "09876543210" are one customer, and storing them as three rows means
 * three accounts, three wallets and three carts.
 */

const INDIA_CC = "91";

export class InvalidPhoneError extends Error {
  constructor(message = "Enter a valid 10-digit Indian mobile number") {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

/**
 * Returns E.164 (+919876543210) or throws.
 *
 * India-only by design: Quoin delivers from physical stores in Indian
 * cities, so accepting an arbitrary international number would create an
 * account that can never be served. Widen this when that stops being true.
 */
export function normalizePhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) throw new InvalidPhoneError();

  let local = digits;

  // +91XXXXXXXXXX / 91XXXXXXXXXX
  if (local.length === 12 && local.startsWith(INDIA_CC)) {
    local = local.slice(2);
  }
  // 0XXXXXXXXXX — the STD trunk prefix
  else if (local.length === 11 && local.startsWith("0")) {
    local = local.slice(1);
  }

  if (local.length !== 10) throw new InvalidPhoneError();

  /* Indian mobile numbers begin 6-9. Rejecting the rest stops landlines
     and obvious junk before an SMS is paid for. */
  if (!/^[6-9]\d{9}$/.test(local)) throw new InvalidPhoneError();

  return `+${INDIA_CC}${local}`;
}

/** Masks a number for display and logs: +919876543210 → +91 ***** 43210. */
export function maskPhone(e164: string): string {
  const local = e164.replace(`+${INDIA_CC}`, "");
  if (local.length !== 10) return "+91 **********";
  return `+91 ***** ${local.slice(5)}`;
}
