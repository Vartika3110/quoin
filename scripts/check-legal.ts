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

  if (outstanding.length === 0) {
    console.log(`[legal] ${files.length} pages checked. Nothing outstanding.`);
    return;
  }

  const byPage = new Map<string, string[]>();
  for (const { page, item } of outstanding) {
    byPage.set(page, [...(byPage.get(page) ?? []), item]);
  }

  console.error(
    `[legal] ${outstanding.length} placeholders are still live across ${byPage.size} pages.\n`,
  );
  for (const [page, items] of [...byPage].sort()) {
    console.error(`  /${page}`);
    for (const item of items) console.error(`      ${item}`);
  }
  console.error(
    "\n[legal] These render to customers as [LEGAL TO CONFIRM] and block" +
      "\n        payment-gateway activation. Fill them in src/app/(legal).",
  );
  process.exitCode = 1;
}

/* `void main()` rather than top-level `await`: these scripts run through
   `tsx`, which transpiles to CJS, where top-level await is not available.
   The other scripts in this directory do the same. */
void main();
