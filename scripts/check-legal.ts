import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * What is still unfilled on the legal pages.
 *
 *   npx tsx scripts/check-legal.ts
 *
 * The pages under `src/app/(legal)` mark every fact that needs a real
 * answer with `<ToConfirm>` — the entity's registered name, its GSTIN,
 * the grievance officer, the return window. That component renders the
 * marker visibly, in a highlight, which is the right behaviour for a
 * draft: nobody can mistake a placeholder for a policy.
 *
 * What was missing is anything that *notices*. Those markers shipped to
 * production and sat in front of customers, and they are not only a
 * presentation problem: the Consumer Protection (E-Commerce) Rules, 2020
 * require a named grievance officer with a reachable address, and every
 * Indian payment gateway asks to see these pages before it will activate
 * an account. An unfilled refunds page is a blocked Razorpay activation.
 *
 * So this is a check, runnable by hand and cheap to wire into CI. It is
 * deliberately *not* wired into `npm run build` yet, and that is a
 * decision rather than an oversight: turning it on today would fail the
 * next deploy of a site that is otherwise working, and taking the
 * storefront down is not how this gets fixed. Once the markers are
 * filled, add it to the `build` script — at which point it stops being a
 * report and starts being the guard that keeps them filled.
 *
 * Exits non-zero when anything is outstanding, so CI can use it as-is.
 */

const LEGAL_DIR = path.join("src", "app", "(legal)");
const COMPANY_FILE = path.join("src", "lib", "company.ts");

/* The literal the component renders, matched on the source rather than
   on rendered HTML so this needs no browser and no running server. */
const MARKER = /<ToConfirm>([\s\S]*?)<\/ToConfirm>/g;

interface Outstanding {
  page: string;
  item: string;
}

async function pageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await pageFiles(full)));
    else if (entry.name === "page.tsx") out.push(full);
  }
  return out;
}

async function main() {
  const files = await pageFiles(LEGAL_DIR);
  const outstanding: Outstanding[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    /* The page's own directory name is what a person calls it ("refunds"),
       which is more useful in a report than the full path. */
    const page = path.basename(path.dirname(file));

    for (const match of source.matchAll(MARKER)) {
      outstanding.push({
        page,
        /* Collapsed, because the marker's text is JSX and may be wrapped
           across lines by the formatter. */
        item: match[1].replace(/\s+/g, " ").trim(),
      });
    }
  }

  /**
   * The second half of the check, and the reason it exists.
   *
   * The pages used to mark every unsupplied fact with `<ToConfirm>`, so
   * counting those markers counted the whole problem. They now read from
   * `src/lib/company.ts` instead, which is a better arrangement and a
   * worse thing to grep: a sampled GSTIN rendered in an ordinary
   * sentence looks exactly like a real one, and a marker count alone
   * would have reported "1 outstanding" while every registered detail on
   * the site was still placeholder text.
   *
   * So the flags in that file are part of the check. Read as source
   * rather than imported, because this script runs outside Next and the
   * module pulls in nothing it needs to evaluate.
   */
  const companySource = await readFile(COMPANY_FILE, "utf8");
  const flags = [
    { name: "COMPANY_DETAILS_ARE_SAMPLE", who: "registered name, address, GSTIN, support and grievance contacts" },
    { name: "POLICY_IS_SAMPLE", who: "refund, damage, cancellation and data-retention periods" },
  ].filter((f) => new RegExp(`export const ${f.name} = true`).test(companySource));

  if (outstanding.length === 0 && flags.length === 0) {
    console.log(`[legal] ${files.length} pages checked. Nothing outstanding.`);
    return;
  }

  if (flags.length > 0) {
    console.error("[legal] src/lib/company.ts is still carrying sample values.\n");
    for (const f of flags) {
      console.error(`  ${f.name} = true`);
      console.error(`      ${f.who}`);
    }
    console.error(
      "\n        Every legal page prints these. Replace the values and set the\n" +
        "        flag to false in the same commit.\n",
    );
  }

  if (outstanding.length > 0) {
    const byPage = new Map<string, string[]>();
    for (const { page, item } of outstanding) {
      byPage.set(page, [...(byPage.get(page) ?? []), item]);
    }

    console.error(
      `[legal] ${outstanding.length} clause${outstanding.length === 1 ? "" : "s"} still marked in the pages themselves.\n`,
    );
    for (const [page, items] of [...byPage].sort()) {
      console.error(`  /${page}`);
      for (const item of items) console.error(`      ${item}`);
    }
    console.error(
      "\n        These are not values to fill in -- they need drafting.\n",
    );
  }

  process.exitCode = 1;
}

/* `void main()` rather than top-level `await`: these scripts run through
   `tsx`, which transpiles to CJS, where top-level await is not available.
   The other scripts in this directory do the same. */
void main();
