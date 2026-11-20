import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time, and admin-access.ts reads
   ADMIN_ALLOWLIST from it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  adminAccessRefusal,
  canAccessAdmin,
  identitiesOf,
  isApprovedAdmin,
  normalizeIdentity,
  parseAdminAllowlist,
} = await import("@/lib/auth/admin-access");

/**
 * Who may reach the internal tools.
 *
 * These tests exist because of a specific account. The first row ever
 * written to this database was created locally, during development of
 * sign-in, with the placeholder number that every comment in this repo
 * uses as an example — `+91 98765 43210`. It was given `isStaff` four
 * days later so somebody could see `/admin`, and it kept it for two
 * months, with no name, no email and no orders on it.
 *
 * Nothing was broken. That is the point: granting an administrator took
 * one write to one boolean, so a leftover test row, a restored backup or
 * a sign-in that claims a pre-existing account by phone match
 * (`resolveSupabaseUser`, case 2) all amounted to the same thing. The
 * day WhatsApp sign-in goes live, whoever actually holds 98765 43210
 * would have verified it and inherited that row.
 *
 * So the flag is no longer the decision. `ADMIN_ALLOWLIST` is, and
 * **nobody is exempt from it** — there is no owner constant and no
 * last-resort identity in the source. An account administers only if the
 * environment names it and the row carries the flag; an empty list
 * admits nobody at all, which is the first case below.
 */

/** The account this was all learned from. */
const PLACEHOLDER = { phone: "+919876543210", email: null, isStaff: true };

/** The shop's own account, approved like everybody else. */
const OWNER = {
  phone: "+918077337870",
  email: "sushilvartika8@gmail.com",
  isStaff: true,
};
const OWNER_APPROVED = ["+918077337870", "sushilvartika8@gmail.com"];

describe("one identity", () => {
  it("reads every way of writing a number as one identity", () => {
    for (const input of [
      "8077337870",
      "08077337870",
      "+918077337870",
      "+91 80773 37870",
      " 918077337870 ",
    ]) {
      assert.equal(normalizeIdentity(input), "+918077337870", input);
    }
  });

  it("treats anything with an @ as an email, and lower-cases it", () => {
    assert.equal(normalizeIdentity("  Owner@Example.COM "), "owner@example.com");
  });

  it("returns null rather than throwing on anything that is neither", () => {
    for (const bad of ["", "   ", "12345", "not a number", "5876543210"]) {
      assert.equal(normalizeIdentity(bad), null, bad);
    }
  });

  it("collects both of an account's identities", () => {
    assert.deepEqual(
      identitiesOf({ phone: "80773 37870", email: "A@B.com" }),
      ["+918077337870", "a@b.com"],
    );
    assert.deepEqual(identitiesOf({ phone: null, email: null }), []);
  });
});

describe("an empty allowlist", () => {
  /* The whole shape of the decision, in one assertion: there is no
     identity in the code that gets in without the environment naming
     it. The log line in `approvedAdminIdentities` exists so that this
     state is diagnosed in a glance rather than in ten minutes. */
  it("admits nobody, the shop's own account included", () => {
    assert.ok(!canAccessAdmin(OWNER, []));
    assert.ok(!canAccessAdmin(PLACEHOLDER, []));
    assert.ok(!canAccessAdmin({ phone: null, email: null, isStaff: true }, []));
  });
});

describe("an approved administrator", () => {
  it("needs the flag and the approval, not either one", () => {
    assert.ok(canAccessAdmin(OWNER, OWNER_APPROVED));
    assert.ok(!canAccessAdmin({ ...OWNER, isStaff: false }, OWNER_APPROVED),
      "approval alone grants nothing");
    assert.ok(!canAccessAdmin(OWNER, ["manager@quoin.co.in"]),
      "the flag alone grants nothing");
  });

  /* Revocation stays a one-line script rather than a deploy: the flag is
     checked before the list, so clearing it is enough even while the
     identity is still approved in the environment. */
  it("is refused the moment the flag goes, approval or not", () => {
    assert.ok(!canAccessAdmin({ ...OWNER, isStaff: false }, OWNER_APPROVED));
  });

  /* A Google sign-in creates a row with an email and no phone at all, so
     an allowlist that only matched numbers would refuse the browser the
     person used Google on. */
  it("is matched by either identity, so a Google account works", () => {
    assert.ok(
      canAccessAdmin(
        { phone: null, email: "sushilvartika8@gmail.com", isStaff: true },
        OWNER_APPROVED,
      ),
    );
    assert.ok(
      canAccessAdmin({ phone: "+918077337870", email: null, isStaff: true }, [
        "+918077337870",
      ]),
    );
  });

  /* `isApprovedAdmin` answers about the identity alone, which is what
     the grant script's listing needs: a row whose flag is set but whose
     identity is not approved has to read differently from one that is
     approved and simply revoked. */
  it("is approved by identity regardless of the flag", () => {
    const identity = { phone: OWNER.phone, email: OWNER.email };
    assert.ok(isApprovedAdmin(identity, OWNER_APPROVED));
    assert.ok(!isApprovedAdmin({ phone: PLACEHOLDER.phone, email: null }, OWNER_APPROVED));
  });
});

describe("the leftover test account", () => {
  it("is not an administrator, flag and all", () => {
    assert.ok(!canAccessAdmin(PLACEHOLDER, OWNER_APPROVED));
  });

  /* The number is not approvable by accident either: it would have to be
     typed into the Vercel settings by hand, which is exactly the act
     this whole arrangement exists to require. */
  it("stays refused while the allowlist names somebody else", () => {
    assert.ok(!canAccessAdmin(PLACEHOLDER, ["+919999988888", "manager@quoin.co.in"]));
  });
});

describe("the allowlist", () => {
  it("is empty when the variable is unset", () => {
    assert.deepEqual(parseAdminAllowlist(undefined), []);
    assert.deepEqual(parseAdminAllowlist(""), []);
  });

  it("separates on commas, spaces, semicolons and newlines", () => {
    assert.deepEqual(
      parseAdminAllowlist("9999988888, manager@quoin.co.in;\n 9999977777"),
      ["+919999988888", "manager@quoin.co.in", "+919999977777"],
    );
  });

  it("is one entry per person however the number was written", () => {
    assert.deepEqual(
      parseAdminAllowlist("9999988888,+919999988888,09999988888"),
      ["+919999988888"],
    );
  });

  it("keeps every valid identity it is given, with nothing filtered", () => {
    assert.deepEqual(
      parseAdminAllowlist("8077337870, sushilvartika8@gmail.com"),
      ["+918077337870", "sushilvartika8@gmail.com"],
    );
  });

  /* A throw here would be a ZodError at boot and a storefront that
     serves nobody, over a setting that should only ever cost one person
     their admin page. Same reasoning as SHOW_SOURCE_IMAGES. */
  it("drops a malformed entry instead of failing", () => {
    assert.deepEqual(parseAdminAllowlist("not-a-number, 9999988888"), [
      "+919999988888",
    ]);
  });
});

describe("what the grant script is told", () => {
  it("says nothing about an account it would admit", () => {
    assert.equal(adminAccessRefusal(OWNER, OWNER_APPROVED), null);
  });

  it("names the environment variable and keeps the existing entries", () => {
    const refusal = adminAccessRefusal(PLACEHOLDER, ["manager@quoin.co.in"]);
    assert.ok(refusal);
    assert.match(refusal, /ADMIN_ALLOWLIST/);
    assert.match(refusal, /manager@quoin\.co\.in,\+919876543210/);
  });

  it("explains an account that has nothing to approve", () => {
    const refusal = adminAccessRefusal(
      { phone: null, email: null, isStaff: true },
      [],
    );
    assert.match(refusal ?? "", /neither a phone number nor an email/);
  });
});
