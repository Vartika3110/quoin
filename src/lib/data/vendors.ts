import { Prisma, type VendorStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  gstinProblem,
  isAccountNumberShaped,
  isIfscShaped,
  isPanShaped,
  isVpaShaped,
  panFromGstin,
} from "@/lib/vendors/identifiers";
import type { Paise } from "@/lib/types/catalog";

/**
 * Vendors: who Quoin buys from.
 *
 * ## Where the checks live
 *
 * Here, not only in the form. A form validates what somebody typed; this
 * validates what reaches the table, and the two are not the same thing
 * the moment anything else writes a vendor — an import, a script, a
 * second screen. The identifier arithmetic itself is pure and lives in
 * `src/lib/vendors/identifiers.ts`; this is where it is *enforced*, and
 * where the rule about what makes a vendor payable is kept.
 *
 * ## What "active" means
 *
 * `ACTIVE` is the only status a payout may ever be filed against, and
 * this module will not set it from a create or an update. It is reached
 * through `markVerified`, which demands the two things a payment needs —
 * somewhere to send money, and a record of who checked — and refuses
 * without them. A status that can be set by typing it into a form is a
 * status that means nothing.
 */

export class VendorFieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "VendorFieldError";
  }
}

export class VendorNotFoundError extends Error {
  constructor() {
    super("No such vendor");
    this.name = "VendorNotFoundError";
  }
}

export interface VendorInput {
  legalName: string;
  tradeName?: string;
  gstin?: string;
  pan?: string;
  phone: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  upiVpa?: string;
  paymentTermsDays?: number;
  notes?: string;
}

const GSTIN_MESSAGE: Record<NonNullable<ReturnType<typeof gstinProblem>>, string> = {
  length: "A GSTIN is fifteen characters.",
  shape: "That is not the shape of a GSTIN — two digits, then a PAN, then 1Z and a check character.",
  state: "The first two digits are not an Indian state code.",
  checksum:
    "The last character does not match the rest, so there is a typo somewhere in it.",
};

/**
 * Everything a vendor row has to satisfy before it is written.
 *
 * Returns the cleaned values rather than mutating the input: uppercase
 * identifiers, trimmed names. Stored lower-case or padded, a GSTIN
 * stops matching its own unique index.
 */
function clean(input: VendorInput) {
  const legalName = input.legalName.trim();
  if (legalName.length < 2) {
    throw new VendorFieldError("legalName", "A vendor needs the name on their PAN.");
  }

  const phone = input.phone.trim();
  if (phone.length < 6) {
    throw new VendorFieldError("phone", "A vendor needs a number somebody can ring.");
  }

  const gstin = input.gstin?.trim().toUpperCase() || null;
  if (gstin) {
    const problem = gstinProblem(gstin);
    if (problem) throw new VendorFieldError("gstin", GSTIN_MESSAGE[problem]);
  }

  let pan = input.pan?.trim().toUpperCase() || null;
  if (pan && !isPanShaped(pan)) {
    throw new VendorFieldError("pan", "A PAN is five letters, four digits and a letter.");
  }
  /* A GSTIN carries the holder's PAN at positions 3–12. Two of them that
     disagree is a typo in one, and which one is not guessable — so the
     refusal names both rather than silently preferring either. */
  if (gstin && pan && panFromGstin(gstin) !== pan) {
    throw new VendorFieldError(
      "pan",
      `This PAN is not the one inside the GSTIN (${panFromGstin(gstin)}). One of the two is mistyped.`,
    );
  }
  /* Nothing is gained by asking twice when the GSTIN already says it. */
  if (gstin && !pan) pan = panFromGstin(gstin);

  const bankAccountNumber = input.bankAccountNumber?.trim() ?? "";
  const bankIfsc = input.bankIfsc?.trim().toUpperCase() ?? "";
  const upiVpa = input.upiVpa?.trim() ?? "";

  if (bankAccountNumber && !isAccountNumberShaped(bankAccountNumber)) {
    throw new VendorFieldError(
      "bankAccountNumber",
      "An account number is nine to eighteen digits, with no spaces.",
    );
  }
  if (bankIfsc && !isIfscShaped(bankIfsc)) {
    throw new VendorFieldError(
      "bankIfsc",
      "An IFSC is four letters, a zero, then six characters — the fifth is a zero, not the letter O.",
    );
  }
  /* Half a bank account is worse than none: it looks filled in. */
  if (Boolean(bankAccountNumber) !== Boolean(bankIfsc)) {
    throw new VendorFieldError(
      bankAccountNumber ? "bankIfsc" : "bankAccountNumber",
      "An account number and an IFSC go together — one without the other cannot be paid.",
    );
  }
  if (upiVpa && !isVpaShaped(upiVpa)) {
    throw new VendorFieldError("upiVpa", "A UPI ID looks like name@bank.");
  }

  const paymentTermsDays = input.paymentTermsDays ?? 7;
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 1 || paymentTermsDays > 90) {
    throw new VendorFieldError("paymentTermsDays", "Terms are between 1 and 90 days.");
  }

  return {
    legalName,
    tradeName: input.tradeName?.trim() ?? "",
    gstin,
    pan,
    phone,
    email: input.email?.trim() || null,
    addressLine: input.addressLine?.trim() ?? "",
    city: input.city?.trim() ?? "",
    state: input.state?.trim() ?? "",
    pincode: input.pincode?.trim() ?? "",
    bankAccountName: input.bankAccountName?.trim() ?? "",
    bankAccountNumber,
    bankIfsc,
    upiVpa,
    paymentTermsDays,
    notes: input.notes?.trim() ?? "",
  };
}

/** Whether there is anywhere to send money. One route is enough. */
export function isPayable(vendor: {
  status: VendorStatus;
  bankAccountNumber: string;
  bankIfsc: string;
  upiVpa: string;
}): boolean {
  const hasRoute =
    (Boolean(vendor.bankAccountNumber) && Boolean(vendor.bankIfsc)) || Boolean(vendor.upiVpa);
  return vendor.status === "ACTIVE" && hasRoute;
}

export async function createVendor(input: VendorInput) {
  const data = clean(input);
  try {
    /* Always DRAFT. A vendor becomes payable through `markVerified` and
       no other way — see the note at the top. */
    return await db.vendor.create({ data: { ...data, status: "DRAFT" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new VendorFieldError("gstin", "A vendor with that GSTIN is already on the list.");
    }
    throw error;
  }
}

export async function updateVendor(id: string, input: VendorInput) {
  const data = clean(input);
  try {
    const claimed = await db.vendor.updateMany({ where: { id }, data });
    if (claimed.count === 0) throw new VendorNotFoundError();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new VendorFieldError("gstin", "A vendor with that GSTIN is already on the list.");
    }
    throw error;
  }
  return db.vendor.findUniqueOrThrow({ where: { id } });
}

/**
 * Records that a person has checked this vendor, and makes them payable.
 *
 * The note is required and is not decoration: it is the only place the
 * *reason* lives when somebody accepts a bank name that does not quite
 * match the PAN, which is the judgement that costs money if it is wrong.
 */
export async function markVerified(id: string, note: string) {
  const vendor = await db.vendor.findUnique({ where: { id } });
  if (!vendor) throw new VendorNotFoundError();

  const trimmed = note.trim();
  if (trimmed.length < 3) {
    throw new VendorFieldError("verificationNote", "Say what was checked.");
  }
  if (!isPayable({ ...vendor, status: "ACTIVE" })) {
    throw new VendorFieldError(
      "bankAccountNumber",
      "There is nowhere to send money yet — add an account and IFSC, or a UPI ID.",
    );
  }

  return db.vendor.update({
    where: { id },
    data: { status: "ACTIVE", verifiedAt: new Date(), verificationNote: trimmed },
  });
}

export async function setVendorStatus(id: string, status: Exclude<VendorStatus, "ACTIVE">) {
  const claimed = await db.vendor.updateMany({ where: { id }, data: { status } });
  if (claimed.count === 0) throw new VendorNotFoundError();
}

export interface VendorRow {
  id: string;
  legalName: string;
  tradeName: string;
  gstin: string | null;
  phone: string;
  status: VendorStatus;
  payable: boolean;
  productCount: number;
  /** Lines supplied by this vendor that nobody has costed yet. */
  uncostedCount: number;
}

/**
 * The list, with the two numbers that decide whether this vendor can
 * appear on a statement: what they supply, and how much of it has a
 * cost against it.
 */
export async function listVendors(): Promise<VendorRow[]> {
  const rows = await db.vendor.findMany({
    orderBy: [{ status: "asc" }, { legalName: "asc" }],
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      gstin: true,
      phone: true,
      status: true,
      bankAccountNumber: true,
      bankIfsc: true,
      upiVpa: true,
      _count: { select: { products: true } },
    },
  });

  const uncosted = await db.product.groupBy({
    by: ["vendorId"],
    where: { vendorId: { not: null }, variants: { some: { costPaise: null } } },
    _count: { _all: true },
  });
  const uncostedByVendor = new Map(uncosted.map((r) => [r.vendorId ?? "", r._count._all]));

  return rows.map((row) => ({
    id: row.id,
    legalName: row.legalName,
    tradeName: row.tradeName,
    gstin: row.gstin,
    phone: row.phone,
    status: row.status,
    payable: isPayable(row),
    productCount: row._count.products,
    uncostedCount: uncostedByVendor.get(row.id) ?? 0,
  }));
}

export async function getVendor(id: string) {
  return db.vendor.findUnique({ where: { id } });
}

/** ---- Cost ------------------------------------------------------------
 *
 * What Quoin pays, against what it charges. Both are GST-inclusive
 * integers in paise — see `taxForLine`: every figure in this app
 * contains its tax rather than having it added later, and a cost that
 * broke that rule would make every margin wrong by the slab.
 */

export class CostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostError";
  }
}

/**
 * Sets what one variant costs.
 *
 * `null` clears it, which is not the same as zero: absent means nobody
 * has costed this line, and a payout must skip it rather than pay
 * nothing for it.
 *
 * A cost above the sell price is allowed and deliberately so — a loss
 * leader is a real decision, and refusing to record one would mean the
 * margin report quietly never shows the lines that need looking at. It
 * is reported, not blocked.
 */
export async function setVariantCost(variantId: string, costPaise: Paise | null) {
  if (costPaise !== null && (!Number.isInteger(costPaise) || costPaise < 0)) {
    throw new CostError("A cost is a whole number of paise, or nothing at all.");
  }

  const claimed = await db.productVariant.updateMany({
    where: { id: variantId },
    data: { costPaise },
  });
  if (claimed.count === 0) throw new CostError("No such variant.");
}

/** Points a product at the vendor it is bought from. */
export async function setProductVendor(sku: string, vendorId: string | null) {
  const claimed = await db.product.updateMany({ where: { sku }, data: { vendorId } });
  if (claimed.count === 0) throw new VendorNotFoundError();
}

export interface MarginRow {
  sku: string;
  name: string;
  pricePaise: Paise;
  costPaise: Paise | null;
  /** `null` where there is no cost — unknown, not zero. */
  marginPaise: Paise | null;
  marginPct: number | null;
}

/** Price against cost for one vendor's lines, dearest margin first. */
export async function listVendorMargins(vendorId: string): Promise<MarginRow[]> {
  const products = await db.product.findMany({
    where: { vendorId },
    select: {
      sku: true,
      name: true,
      variants: { select: { pricePaise: true, costPaise: true, isDefault: true } },
    },
    orderBy: { name: "asc" },
  });

  return products.map((product) => {
    const variant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
    const pricePaise = variant?.pricePaise ?? 0;
    const costPaise = variant?.costPaise ?? null;
    const marginPaise = costPaise == null ? null : pricePaise - costPaise;
    return {
      sku: product.sku,
      name: product.name,
      pricePaise,
      costPaise,
      marginPaise,
      marginPct:
        marginPaise == null || pricePaise === 0
          ? null
          : Math.round((marginPaise / pricePaise) * 1000) / 10,
    };
  });
}
