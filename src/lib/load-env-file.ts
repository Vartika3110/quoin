/**
 * Loads `.env.local` then `.env` into `process.env`.
 *
 * Next.js does this for the app, but a standalone `tsx` script gets no
 * such help — it starts with a bare environment and Prisma fails on the
 * first query with "Environment variable not found: DATABASE_URL". Import
 * this first in any script meant to be run directly.
 *
 * A real environment always wins: values already set are never
 * overwritten, so CI and production are unaffected by a stray file, and
 * `DATABASE_URL=... npm run db:import` still overrides the local one.
 *
 * Deliberately not a dependency. This is thirty lines and the project
 * carries no dotenv today.
 */
import { existsSync, readFileSync } from "node:fs";

function parse(contents: string): [string, string][] {
  const out: [string, string][] = [];

  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    /* `export FOO=bar` is valid in a file people also source in a shell. */
    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;

    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();

    /* Strip one matching pair of surrounding quotes, and only a matching
       pair — a password may legitimately begin or end with one. */
    const first = value[0];
    if ((first === '"' || first === "'") && value.at(-1) === first) {
      value = value.slice(1, -1);
    }

    out.push([key, value]);
  }

  return out;
}

/** `.env.local` first: the more specific file wins on conflicts. */
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;

  for (const [key, value] of parse(readFileSync(file, "utf8"))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
