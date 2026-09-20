/**
 * Pure address formatting and contact-resolution helpers.
 *
 * No `db` import on purpose: everything here is called from both a client
 * component (`AddressPicker`) and a server route (`checkout/order`), and a
 * module either of those can import has to stay free of anything that only
 * runs on the server — the moment this pulls in Prisma, the picker's
 * client bundle pulls it in too.
 */

export type AddressLabelValue = "HOME" | "WORK" | "SITE" | "OTHER";

const LABEL_TEXT: Record<AddressLabelValue, string> = {
  HOME: "Home",
  WORK: "Work",
  /* Not "Site" — see the comment on `AddressLabel` in prisma/schema.prisma.
     "Site" reads as a construction term to someone booking a delivery;
     "Project site" is what the address actually is to them. */
  SITE: "Project site",
  OTHER: "Other",
};

export function addressLabelText(label: AddressLabelValue): string {
  return LABEL_TEXT[label];
}

export interface AddressLinesInput {
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
}

/**
 * The two lines an address card renders: the plot and, on its own line so
 * it never wraps mid-word, the city/state/PIN. Returned as a tuple rather
 * than a joined string so a caller can put a `<br />` or a block element
 * between them without re-parsing the result.
 */
export function formatAddressLines(address: AddressLinesInput): [string, string] {
  const parts = [address.line1, address.line2].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const landmark = address.landmark?.trim();
  const first = parts.join(", ") + (landmark ? ` (${landmark})` : "");
  const second = `${address.city}, ${address.state} ${address.pincode}`;
  return [first, second];
}

export interface ShipContactInput {
  recipientName?: string | null;
  recipientPhone?: string | null;
  userName?: string | null;
  accountPhone?: string | null;
}

export interface ShipContact {
  shipName: string;
  shipPhone: string | null;
}

/**
 * Who and what number an order ships to, once an address may carry its
 * own delivery contact.
 *
 * `recipientPhone` wins outright over the account's own number: it is
 * what the customer typed *for this address*, and a site supervisor's
 * number is more useful to a driver standing at the gate than the account
 * holder's. `recipientName` follows the same rule for the same reason.
 * Either can fall through to the account side — a customer who names a
 * recipient but not a phone still wants that name on the slip — and the
 * name has one more fallback than the phone does, to `shipPhone` itself,
 * because a delivery label with a number and no name is still actionable
 * and one with neither field is not.
 *
 * Blank strings are treated as absent, not as a value to write: a form
 * field a customer cleared and a field they never touched must resolve
 * the same way, or clearing "Recipient name" silently keeps shipping to
 * the old name.
 */
export function resolveShipContact({
  recipientName,
  recipientPhone,
  userName,
  accountPhone,
}: ShipContactInput): ShipContact {
  const phone = blank(recipientPhone) ?? blank(accountPhone);
  const name = blank(recipientName) ?? blank(userName) ?? phone ?? "";
  return { shipName: name, shipPhone: phone };
}

function blank(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
