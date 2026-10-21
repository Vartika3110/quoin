import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  gstinProblem,
  isPanShaped,
  isIfscShaped,
  isVpaShaped,
  isAccountNumberShaped,
  matchesName,
  panFromGstin,
} = await import("@/lib/vendors/identifiers");

/**
 * The cheap half of vendor verification.
 *
 * These checks stand between a mistyped bank detail and a weekly payout
 * landing somewhere it should not. They are tested rather than trusted
 * because the expensive checks — penny drop, GSTIN lookup — cost money
 * per call, and a format check that wrongly passes is a rupee spent to
 * learn what arithmetic could have said for free.
 */

/* Real-format GSTINs with correct checksums, computed from the spec. */
const VALID_GSTIN = "27AAPFU0939F1ZV";

describe("GSTIN", () => {
  it("accepts a well-formed one", () => {
    assert.equal(gstinProblem(VALID_GSTIN), null);
  });

  it("tolerates lower case and surrounding space", () => {
    assert.equal(gstinProblem(`  ${VALID_GSTIN.toLowerCase()} `), null);
  });

  it("catches a single mistyped character on the checksum", () => {
    /* The whole reason the checksum is worth computing: one wrong digit
       in the middle of fifteen is invisible to a human and fails here. */
    const typo = `27AAPFU0939F1ZW`;
    assert.equal(gstinProblem(typo), "checksum");
  });

  it("names what is wrong rather than answering yes or no", () => {
    assert.equal(gstinProblem("27AAPFU0939F1Z"), "length");
    assert.equal(gstinProblem("27AAPFU0939F1AV"), "shape");
    assert.equal(gstinProblem("99AAPFU0939F1ZV"), "checksum");
    assert.equal(gstinProblem("45AAPFU0939F1ZV"), "state");
  });

  it("reads the PAN out of a valid one, and refuses an invalid one", () => {
    assert.equal(panFromGstin(VALID_GSTIN), "AAPFU0939F");
    assert.equal(panFromGstin("27AAPFU0939F1ZW"), null);
  });
});

describe("the other identifiers", () => {
  it("checks a PAN's shape", () => {
    assert.equal(isPanShaped("AAPFU0939F"), true);
    assert.equal(isPanShaped("AAPFU0939"), false);
    assert.equal(isPanShaped("AAPF10939F"), false);
  });

  it("requires the IFSC's fifth character to be zero", () => {
    /* Reserved by the spec. It is the one position a human reliably
       mistypes as the letter O. */
    assert.equal(isIfscShaped("HDFC0001234"), true);
    assert.equal(isIfscShaped("HDFCO001234"), false);
    assert.equal(isIfscShaped("HDFC001234"), false);
  });

  it("checks a VPA and an account number", () => {
    assert.equal(isVpaShaped("sharma@okaxis"), true);
    assert.equal(isVpaShaped("sharma"), false);
    assert.equal(isAccountNumberShaped("123456789012"), true);
    assert.equal(isAccountNumberShaped("12345678"), false);
    assert.equal(isAccountNumberShaped("1234 5678 9012"), false);
  });
});

describe("matching a bank's name against a legal one", () => {
  it("sees through the furniture", () => {
    assert.equal(matchesName("M/s Sharma Traders Pvt. Ltd.", "SHARMA TRADERS"), "same");
    assert.equal(matchesName("The Sharma & Co Enterprises", "Sharma"), "same");
  });

  it("calls a trading name close, not identical", () => {
    /* A judgement, and the point of the middle answer: this is usually
       the same shop and must not be auto-accepted. */
    assert.equal(matchesName("Sharma Traders", "Sharma Traders Sanitary"), "close");
  });

  it("calls two different businesses different", () => {
    /* A shared first word is not a match. This is the case that costs
       money if it is wrong. */
    assert.equal(matchesName("Sharma Traders", "Sharma Electricals"), "different");
    assert.equal(matchesName("Sharma Traders", "Verma Traders"), "different");
  });

  it("refuses to match when a name is only furniture", () => {
    assert.equal(matchesName("M/s Pvt Ltd", "Sharma"), "different");
  });
});
