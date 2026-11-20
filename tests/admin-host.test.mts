import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { hostVerdict, isAdminPath, normalizeHost, isDevelopmentHost } =
  await import("@/lib/auth/admin-host");

/**
 * Two addresses, one deployment.
 *
 * The console and the storefront are the same Next application. What
 * separates them is this function, so it is worth being exhaustive about
 * it: every case below is a request that either reaches an internal page
 * or does not, and the default for anything unrecognised has to be the
 * storefront rather than the console.
 *
 * `inProduction` is the second argument that matters. `npm run dev`
 * serves one origin on `localhost:3000` and there is no second hostname
 * to give the tools, so the split is relaxed there — and only there.
 */

const ADMIN = "admin.quoin.co.in";
const APP = "quoin.co.in";

/** The deployed shape: split on, production. */
function verdict(host: string | null, pathname: string) {
  return hostVerdict({ host, pathname, adminHost: ADMIN, inProduction: true })
    .kind;
}

describe("a hostname, comparable", () => {
  it("drops the scheme, the path and the port", () => {
    for (const raw of [
      "admin.quoin.co.in",
      "ADMIN.Quoin.co.in",
      "  admin.quoin.co.in  ",
      "https://admin.quoin.co.in",
      "https://admin.quoin.co.in/",
      "admin.quoin.co.in:443",
    ]) {
      assert.equal(normalizeHost(raw), ADMIN, raw);
    }
  });

  it("keeps a bracketed IPv6 host whole", () => {
    assert.equal(normalizeHost("[::1]:3000"), "[::1]");
  });

  it("is null for nothing at all", () => {
    assert.equal(normalizeHost(undefined), null);
    assert.equal(normalizeHost("   "), null);
  });
});

describe("which paths are internal", () => {
  it("covers the console and its API, exactly", () => {
    assert.ok(isAdminPath("/admin"));
    assert.ok(isAdminPath("/admin/orders/QN-1234"));
    assert.ok(isAdminPath("/api/v1/admin/products"));
    assert.ok(!isAdminPath("/administrators"));
    assert.ok(!isAdminPath("/adminish"));
    assert.ok(!isAdminPath("/"));
    /* A customer calls these two, on the public host, and they are
       `requireStaff`-guarded for their *other* methods — so they must
       never be treated as internal paths. */
    assert.ok(!isAdminPath("/api/v1/consultations"));
    assert.ok(!isAdminPath("/api/v1/parcha/submissions"));
  });
});

describe("the public storefront", () => {
  it("serves the storefront", () => {
    assert.equal(verdict(APP, "/"), "serve");
    assert.equal(verdict(APP, "/products/basin-mixer"), "serve");
    assert.equal(verdict(APP, "/signin"), "serve");
    assert.equal(verdict(APP, "/vendor/orders/some-token"), "serve");
  });

  it("answers 404 for the console", () => {
    assert.equal(verdict(APP, "/admin"), "not_found");
    assert.equal(verdict(APP, "/admin/pricing"), "not_found");
    assert.equal(verdict(APP, "/api/v1/admin/products"), "not_found");
  });

  /* Not a redirect, deliberately: a 307 to the admin host would tell
     every scanner walking the public domain where the console moved to. */
  it("does not say where it went", () => {
    assert.notEqual(verdict(APP, "/admin"), "belongs_to_app");
  });
});

describe("the admin host", () => {
  it("serves the console", () => {
    assert.equal(verdict(ADMIN, "/admin"), "serve");
    assert.equal(verdict(ADMIN, "/admin/orders"), "serve");
    assert.equal(verdict(ADMIN, "/api/v1/admin/products"), "serve");
  });

  /* The session cookie is host-only, so a session established on the
     storefront is not sent here. Without `/signin` on this host the
     console is a page nobody can get a cookie for. */
  it("serves sign-in, because the cookie does not travel", () => {
    assert.equal(verdict(ADMIN, "/signin"), "serve");
    assert.equal(verdict(ADMIN, "/signin/otp"), "serve");
  });

  it("serves the platform's own paths and robots.txt", () => {
    assert.equal(verdict(ADMIN, "/_vercel/insights/script.js"), "serve");
    assert.equal(verdict(ADMIN, "/robots.txt"), "serve");
  });

  it("sends the storefront back where it belongs", () => {
    assert.equal(verdict(ADMIN, "/"), "belongs_to_app");
    assert.equal(verdict(ADMIN, "/products/basin-mixer"), "belongs_to_app");
    assert.equal(verdict(ADMIN, "/checkout"), "belongs_to_app");
  });
});

describe("anything else pointed at this deployment", () => {
  /* Unknown must mean less access, never more: a preview URL, a stray
     CNAME or a spoofed Host header is treated as the storefront. */
  it("is treated as the storefront, not as the console", () => {
    assert.equal(verdict("quoin-git-main-quoin.vercel.app", "/admin"), "not_found");
    assert.equal(verdict("quoin-git-main-quoin.vercel.app", "/"), "serve");
    assert.equal(verdict(null, "/admin"), "not_found");
    assert.equal(verdict("", "/admin"), "not_found");
  });
});

describe("the development exemption", () => {
  it("serves everything on a local host, outside production", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "quoin.localhost:3000"]) {
      assert.equal(
        hostVerdict({ host, pathname: "/admin", adminHost: ADMIN, inProduction: false }).kind,
        "serve",
        host,
      );
    }
    assert.ok(isDevelopmentHost("localhost"));
  });

  /* The one that would matter if the exemption were ever reachable in
     production: `Host: localhost` must not be a way in. */
  it("is not reachable in production", () => {
    assert.equal(
      hostVerdict({ host: "localhost", pathname: "/admin", adminHost: ADMIN, inProduction: true }).kind,
      "not_found",
    );
  });

  it("serves everything when no admin host is configured", () => {
    for (const host of [APP, ADMIN, "localhost:3000"]) {
      assert.equal(
        hostVerdict({ host, pathname: "/admin", adminHost: null, inProduction: true }).kind,
        "serve",
        host,
      );
      assert.equal(
        hostVerdict({ host, pathname: "/", adminHost: "   ", inProduction: true }).kind,
        "serve",
        host,
      );
    }
  });
});
