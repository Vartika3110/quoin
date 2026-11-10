import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { COMPANY, COMPANY_DETAILS_ARE_SAMPLE } from "../src/lib/company";

/**
 * What is still unfilled on the legal pages.
 *
 *   npx tsx scripts/check-legal.ts
 *
 * The pages under `src/app/(legal)` mark every fact that needs a real
 * answer in one of two ways, and this checks both.
 *
 * `<ToConfirm>` is a policy decision nobody has made — a return window,
 * a retention period, a response time. It renders the marker visibly, in
 * a highlight, which is the right behaviour for a draft: nobody can
 * mistake a placeholder for a policy.
 *
 * `<CompanyFact>` is a detail that lives in `src/lib/company.ts` — the
 * registered name, the GSTIN, the grievance officer. It renders the same
 * visible marker, but only while `COMPANY_DETAILS_ARE_SAMPLE` is true,
 * and the real value the moment it is false.
 *
 * Both have to be counted, and the second is why this script imports
 * that module rather than only reading page source. `CompanyFact` was
 * introduced by moving those facts out of the pages, and a check that
 * matched `<ToConfirm>` alone would have gone quiet the same day —
 * reporting nothing outstanding while three policy pages still printed
 * `[LEGAL TO CONFIRM]` to customers. A check that can be silenced by a
 * refactor is worse than no check, because somebody trusts it.
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

/* `<CompanyFact label="registered address" value={...} />`. Only the
   label is captured: it is what the page prints while the details are
   samples, and what somebody has to go and find out. The attribute may
   be wrapped onto its own line by the formatter, hence the tolerant
   whitespace. */
const COMPANY_FACT = /<CompanyFact\s[^>]*?label=(?:"([^"]*)"|\{`([^`]*)`\})/g;

/**
 * Whether a value in `company.ts` still reads as a placeholder after the
 * flag has been turned off.
 *
 * The flag is one manual switch, deliberately — see that file — so a
 * half-replaced file is a real possibility, and this is the half of it a
 * string match *can* catch. A value that is plausible but wrong is still
 * nobody's to find but a person's.
 *
 * Two patterns, because the samples come in two shapes. The text ones
 * say SAMPLE outright. The phone numbers do not: `+91 00000 00000`
 * contains nothing to match on except the run of zeros, and no real
 * Indian mobile number has five of them together — the local part is ten
 * digits starting 6-9 (see `normalizePhone`, src/lib/auth/phone.ts).
 * Without this, flipping the flag published two placeholder phone
 * numbers with the check reporting all clear, which is exactly the
 * failure it exists to catch.
 */
function isPlaceholder(value: string): boolean {
  return /sample/i.test(value) || /0{5,}/.test(value);
}

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

    /* Only outstanding while the details are samples. Once the flag is
       off these print real values, and reporting them would make the
       check permanently red. */
    if (COMPANY_DETAILS_ARE_SAMPLE) {
      for (const match of source.matchAll(COMPANY_FACT)) {
        const label = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
        outstanding.push({
          page,
          item: `${label} — from src/lib/company.ts`,
        });
      }
    }
  }

  /* The other direction: the flag is off, so the pages are printing
     these, and one of them still reads like a placeholder. Checked
     against the live object rather than the file's text, so a value
     renamed or restructured cannot slip past. */
  const stillSample = COMPANY_DETAILS_ARE_SAMPLE
    ? []
    : Object.entries({
        legalName: COMPANY.legalName,
        tradingName: COMPANY.tradingName,
        registeredAddress: COMPANY.registeredAddress,
        gstin: COMPANY.gstin,
        supportEmail: COMPANY.supportEmail,
        privacyEmail: COMPANY.privacyEmail,
        supportPhone: COMPANY.supportPhone,
        supportHours: COMPANY.supportHours,
        "grievanceOfficer.name": COMPANY.grievanceOfficer.name,
        "grievanceOfficer.email": COMPANY.grievanceOfficer.email,
        "grievanceOfficer.phone": COMPANY.grievanceOfficer.phone,
      })
        .filter(([, value]) => isPlaceholder(value))
        .map(([key]) => key);

  for (const key of stillSample) {
    outstanding.push({ page: "company details", item: `COMPANY.${key} still reads as a sample` });
  }

  if (outstanding.length === 0) {
    console.log(
      `[legal] ${files.length} pages checked, and the company details are filled in.` +
        " Nothing outstanding.",
    );
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
      "\n        payment-gateway activation." +
      "\n\n        Policy decisions live in src/app/(legal)." +
      "\n        Anything marked \"from src/lib/company.ts\" is fixed by filling that" +
      "\n        file in and setting COMPANY_DETAILS_ARE_SAMPLE to false.",
  );
  process.exitCode = 1;
}

/* `void main()` rather than top-level `await`: these scripts run through
   `tsx`, which transpiles to CJS, where top-level await is not available.
   The other scripts in this directory do the same. */
void main();
