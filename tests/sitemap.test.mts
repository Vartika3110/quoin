import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const { fixedSitemapPages } = await import("@/lib/seo/sitemap-pages");

/**
 * What a crawler is told about this site, and the one invariant that
 * stops the list going stale.
 *
 * Six live pages — `/faq`, `/experts`, `/trending`, `/premium`,
 * `/lighting` and `/rooted` — were in neither `sitemap.ts` nor
 * `robots.ts`. Each returned 200, carried its own title and description
 * and set no `noindex`, so the only route a crawler had to any of them
 * was a footer link. `/faq` was the worst of the six: it sits in the
 * same `(legal)` group as the five pages that *were* listed, and it is
 * where a customer looking for the cancellation window lands.
 *
 * Comparing one hand-written list against another hand-written list
 * would not have caught that, because both lists would have been missing
 * the same six pages. So the test below walks `src/app` instead and
 * requires every statically routed page to have been *decided about*:
 * submitted for indexing, excluded from crawling, told not to index
 * itself, or written down here with a reason.
 */

const ORIGIN = "https://example.test";
const APP = path.join(process.cwd(), "src", "app");

/**
 * Pages deliberately left out of the sitemap, with the reason.
 *
 * Submitting a page with no content is submitting a soft 404, which is
 * the exact cost `sitemap.ts` already refuses to pay for products with
 * no sellable variant. The moment either of these has content it
 * belongs in the sitemap, and this test is what tells whoever adds that
 * content to say so.
 */
const NOT_SUBMITTED_YET: Record<string, string> = {
  "/studio/designers":
    "Live, and says \"No designers listed yet … empty on purpose\". " +
    "Reviewed 25 November 2026.",
  "/studio/watch":
    "Live, and there are no Studio videos at all — zero StudioIdea rows " +
    "carry video and CF_STREAM_CUSTOMER_CODE is unset. " +
    "Reviewed 25 November 2026.",
};

/** Route groups `(like-this)` and private folders `_like-this` are not URL segments. */
const isGroupSegment = (name: string): boolean =>
  (name.startsWith("(") && name.endsWith(")")) || name.startsWith("@");

/** A page whose body only redirects is not a page to ask a crawler to index. */
const isRedirectOnly = (source: string): boolean =>
  /\b(?:permanentRedirect|redirect)\s*\(/.test(source) &&
  !/<(?:main|section|div|article)\b/.test(source);

const declaresNoIndex = (source: string): boolean =>
  /index\s*:\s*false/.test(source);

function staticPages(): { route: string; source: string }[] {
  const found: { route: string; source: string }[] = [];

  const walk = (dir: string, segments: string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) continue;
        /* A dynamic segment's URLs come out of the database, in the same
           file this test imports. Nothing to assert statically. */
        if (entry.name.startsWith("[")) continue;
        walk(
          path.join(dir, entry.name),
          isGroupSegment(entry.name) ? segments : [...segments, entry.name],
        );
      } else if (entry.name === "page.tsx") {
        found.push({
          route: `/${segments.join("/")}`,
          source: readFileSync(path.join(dir, entry.name), "utf8"),
        });
      }
    }
  };

  walk(APP, []);
  return found;
}

/** The `disallow` entries, read out of `robots.ts` rather than restated. */
function disallowedPrefixes(): string[] {
  const source = readFileSync(path.join(APP, "robots.ts"), "utf8");
  const block = source.slice(source.indexOf("disallow: ["));
  return [...block.slice(0, block.indexOf("]")).matchAll(/"([^"]+)"/g)].map(
    (m) => m[1],
  );
}

describe("the fixed sitemap list", () => {
  const urls = fixedSitemapPages(ORIGIN).map((e) => e.url);

  it("submits the six pages a crawler could previously only guess at", () => {
    for (const route of [
      "/faq",
      "/experts",
      "/trending",
      "/premium",
      "/lighting",
      "/rooted",
    ]) {
      assert.ok(
        urls.includes(`${ORIGIN}${route}`),
        `${route} is live and indexable, so it belongs in the sitemap`,
      );
    }
  });

  it("still submits the legal pages a gateway expects to find", () => {
    /* These are in the sitemap because a payment gateway and a regulator
       both expect them to be publicly findable, which is a reason that
       outlives whoever next edits the list. */
    for (const route of [
      "/privacy",
      "/terms",
      "/refunds",
      "/contact",
      "/grievance",
    ]) {
      assert.ok(urls.includes(`${ORIGIN}${route}`), `${route} must stay listed`);
    }
  });

  it("asks for nothing per-customer to be indexed", () => {
    for (const route of ["/account", "/cart", "/checkout", "/signin", "/admin"]) {
      assert.ok(
        !urls.includes(`${ORIGIN}${route}`),
        `${route} renders a signed-out shell to a crawler`,
      );
    }
  });

  it("contradicts nothing in robots.ts", () => {
    /* A sitemap entry is a request to index and a robots rule is a
       request not to crawl. Saying both about one page is how a page
       ends up indexed with no snippet. */
    const disallowed = disallowedPrefixes();
    for (const url of urls) {
      const route = url.slice(ORIGIN.length) || "/";
      const clash = disallowed.find(
        (prefix) => route === prefix || route.startsWith(prefix),
      );
      assert.equal(
        clash,
        undefined,
        `${route} is submitted for indexing and disallowed by "${clash}"`,
      );
    }
  });

  it("lists each page once", () => {
    assert.equal(new Set(urls).size, urls.length);
  });

  it("gives every entry an absolute URL on the origin it was passed", () => {
    for (const url of urls) assert.ok(url.startsWith(`${ORIGIN}/`), url);
  });
});

describe("robots.ts", () => {
  const disallowed = disallowedPrefixes();

  it("excludes the two sign-in-gated create forms", () => {
    /* Both render nothing but "Sign in to …" to a signed-out visitor,
       which is the same empty-shell problem `/account` is listed for. */
    assert.ok(disallowed.includes("/projects/new"));
    assert.ok(disallowed.includes("/studio/upload"));
  });

  it("keeps the entries that were there for stronger reasons", () => {
    /* `/vendor` especially: a vendor's dispatch URL *is* its credential,
       so the path must not be followed, indexed or kept by anything. */
    for (const prefix of ["/admin", "/api/", "/vendor", "/cart", "/checkout"]) {
      assert.ok(disallowed.includes(prefix), `${prefix} must stay disallowed`);
    }
  });
});

describe("every statically routed page", () => {
  it("has been decided about, one way or another", () => {
    const urls = new Set(fixedSitemapPages(ORIGIN).map((e) => e.url));
    const disallowed = disallowedPrefixes();
    const undecided: string[] = [];

    for (const { route, source } of staticPages()) {
      if (urls.has(`${ORIGIN}${route}`)) continue;
      if (disallowed.some((p) => route === p || route.startsWith(p))) continue;
      if (declaresNoIndex(source)) continue;
      if (isRedirectOnly(source)) continue;
      if (route in NOT_SUBMITTED_YET) continue;
      undecided.push(route);
    }

    assert.deepEqual(
      undecided,
      [],
      `these pages are live and indexable but a crawler has no route to ` +
        `them: add each to fixedSitemapPages, disallow it in robots.ts, ` +
        `give it \`robots: { index: false }\`, or name it in ` +
        `NOT_SUBMITTED_YET with a reason`,
    );
  });

  it("finds enough pages for the walk to mean anything", () => {
    /* A broken walk returning nothing would make the assertion above
       pass silently, which is the one way this test could lie. */
    assert.ok(staticPages().length > 25);
  });
});
