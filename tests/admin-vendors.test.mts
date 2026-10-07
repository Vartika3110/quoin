import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and admin-vendors pulls in `db`
   (src/lib/db.ts) via src/lib/env.ts. Same shim as every other test that
   reaches a data module. `validateVendor` itself touches no database. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { validateVendor, InvalidVendorError } = await import("@/lib/data/admin-vendors");

/** A store that should validate, for tests that vary one field. */
const GOOD = {
  code: "DEL-JNK",
  name: "Quoin Janakpuri",
  contactName: "Ramesh",
  whatsappPhone: "+919876543210",
  lat: 28.6219,
  lng: 77.0878,
  serviceRadiusKm: 5,
  baseEtaMinutes: 18,
};

/** Runs `validateVendor` and returns the per-field messages it threw. */
function fieldsFor(input: Parameters<typeof validateVendor>[0]): Record<string, string> {
  try {
    validateVendor(input);
    return {};
  } catch (error) {
    assert.ok(error instanceof InvalidVendorError, "expected an InvalidVendorError");
    return error.fields;
  }
}

describe("validateVendor — a good store", () => {
  it("accepts a realistic one and normalises what it should", () => {
    const vendor = validateVendor({ ...GOOD, code: "del-jnk", name: "  Quoin Janakpuri  " });

    assert.equal(vendor.code, "DEL-JNK", "the code is upper-cased");
    assert.equal(vendor.name, "Quoin Janakpuri", "the name is trimmed");
    assert.equal(vendor.whatsappPhone, "+919876543210");
    assert.equal(vendor.serviceAreaId, null, "an absent area is null, not an empty string");
  });

  it("normalises a phone number typed any of the ways a person types one", () => {
    /* The same `normalizePhone` every customer number goes through, so
       "98765 43210", "+91 98765-43210" and "09876543210" are one vendor
       rather than three different rows that cannot be messaged. */
    for (const typed of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210"]) {
      assert.equal(
        validateVendor({ ...GOOD, whatsappPhone: typed }).whatsappPhone,
        "+919876543210",
        `${typed} should normalise`,
      );
    }
  });

  it("treats an empty phone number as no number rather than as an error", () => {
    /* A store can legitimately exist before anybody has a number for it;
       that is recorded honestly as a failed notification later, not
       refused here. */
    assert.equal(validateVendor({ ...GOOD, whatsappPhone: "" }).whatsappPhone, null);
    assert.equal(validateVendor({ ...GOOD, whatsappPhone: "   " }).whatsappPhone, null);
    assert.equal(validateVendor({ ...GOOD, whatsappPhone: undefined }).whatsappPhone, null);
  });

  it("treats an empty contact name as none, so the store name is used instead", () => {
    assert.equal(validateVendor({ ...GOOD, contactName: "  " }).contactName, null);
  });
});

describe("validateVendor — the store code", () => {
  it("accepts the shapes the seeded stores already use", () => {
    for (const code of ["DEL-JNK", "GKP01", "DEL-NCR-01"]) {
      assert.deepEqual(fieldsFor({ ...GOOD, code }), {}, `${code} should be accepted`);
    }
  });

  it("rejects a code that is not a code", () => {
    for (const code of ["", "D", "DEL JNK", "del/jnk", "DEL_JNK", "-DEL"]) {
      assert.ok(fieldsFor({ ...GOOD, code }).code, `${JSON.stringify(code)} should be rejected`);
    }
  });
});

describe("validateVendor — coordinates", () => {
  it("rejects a latitude and longitude typed the wrong way round", () => {
    /* The most likely typo on this form and the hardest to notice
       afterwards: it puts the store in the Indian Ocean, inside nobody's
       radius, where it silently serves no orders at all rather than
       failing loudly. */
    const fields = fieldsFor({ ...GOOD, lat: 77.0878, lng: 28.6219 });
    assert.ok(fields.lat, "a latitude of 77 is not in India");
    assert.ok(fields.lng, "a longitude of 28 is not in India");
  });

  it("rejects a blank coordinate rather than placing the store at (0, 0)", () => {
    /* `Number("")` is 0, which is a perfectly well-formed coordinate in
       the Gulf of Guinea. The form sends NaN for a blank field precisely
       so this check catches it. */
    assert.ok(fieldsFor({ ...GOOD, lat: Number.NaN }).lat);
    assert.ok(fieldsFor({ ...GOOD, lng: Number.NaN }).lng);
    assert.ok(fieldsFor({ ...GOOD, lat: 0, lng: 0 }).lat, "(0, 0) is not in India");
  });

  it("accepts coordinates from the far corners of the country", () => {
    for (const [lat, lng, where] of [
      [34.08, 74.8, "Srinagar"],
      [8.52, 76.94, "Thiruvananthapuram"],
      [26.14, 91.73, "Guwahati"],
      [11.68, 92.74, "Port Blair"],
    ] as const) {
      assert.deepEqual(fieldsFor({ ...GOOD, lat, lng }), {}, `${where} should be accepted`);
    }
  });
});

describe("validateVendor — reach and timing", () => {
  it("rejects a radius that is zero, negative or absurd", () => {
    for (const serviceRadiusKm of [0, -5, 500, Number.NaN]) {
      assert.ok(
        fieldsFor({ ...GOOD, serviceRadiusKm }).serviceRadiusKm,
        `${serviceRadiusKm} km should be rejected`,
      );
    }
  });

  it("rejects a pick-and-pack time that is not a sane whole number of minutes", () => {
    for (const baseEtaMinutes of [0, -1, 18.5, 5000, Number.NaN]) {
      assert.ok(
        fieldsFor({ ...GOOD, baseEtaMinutes }).baseEtaMinutes,
        `${baseEtaMinutes} minutes should be rejected`,
      );
    }
  });
});

describe("validateVendor — reporting", () => {
  it("reports every bad field at once, not just the first", () => {
    /* The form attaches each message to its own input, so stopping at the
       first would make the operator submit four times to find four
       mistakes. */
    const fields = fieldsFor({
      code: "bad code",
      name: "",
      whatsappPhone: "12345",
      lat: 0,
      lng: 0,
      serviceRadiusKm: 0,
      baseEtaMinutes: 0,
    });

    for (const key of [
      "code",
      "name",
      "whatsappPhone",
      "lat",
      "lng",
      "serviceRadiusKm",
      "baseEtaMinutes",
    ]) {
      assert.ok(fields[key], `${key} should have its own message`);
    }
  });

  it("gives every message to a field the form actually has", () => {
    const fields = fieldsFor({ ...GOOD, code: "", lat: 0 });
    const known = new Set([
      "code",
      "name",
      "contactName",
      "whatsappPhone",
      "lat",
      "lng",
      "serviceRadiusKm",
      "baseEtaMinutes",
      "serviceAreaId",
    ]);
    for (const key of Object.keys(fields)) {
      assert.ok(known.has(key), `${key} is not a field on the add-vendor form`);
    }
  });
});
