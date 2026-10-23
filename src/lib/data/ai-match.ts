import { db } from "@/lib/db";
import { listProductsBySlugs, resolvePhoto } from "@/lib/data/catalog";
import { scoreCandidate, tokenize } from "@/lib/data/parcha-match";
import type { VisionGuess } from "@/lib/ai/visual-search";
import type { Product } from "@/lib/types/catalog";

/**
 * Turning what a model saw or heard into products that actually exist.
 *
 * `src/lib/ai/visual-search.ts` and `src/lib/ai/assistant.ts` both answer
 * with the same `VisionGuess` shape — a label, some keywords, maybe a
 * department. Neither of them touches the catalogue, and that is the
 * point: a model can be confidently wrong about what a thing is called,
 * and this module is the half that can only ever return rows Postgres
 * really holds.
 *
 * ## Two queries, not two per guess
 *
 * Six guesses resolved independently is twelve round trips and twelve
 * pooled connections held at once. `getTopPicks` in `catalog.ts` records
 * what that costs this deployment — "which is how the home page started
 * returning 500 in production" — so the work is arranged the other way
 * round: **one** query fetches a candidate pool for every keyword across
 * every guess, and the scoring then happens in memory, where it is free.
 * A second query hydrates only the winners.
 *
 * ## The acceptance bar, and why it is not zero
 *
 * A photograph of a tap must not come back with forty products because
 * they all contain the word "steel". `parcha-match.ts` already decided
 * this question for priced lists and the reasoning carries over
 * unchanged: a wrong product shown confidently is worse than an honest
 * blank, because the customer has no way to tell the difference. So a
 * candidate needs either **two** matched keywords, or one matched keyword
 * *and* the right department. Everything else is dropped, and a guess
 * that matches nothing is returned with an empty list and its department
 * as the way forward — "we sell this kind of thing, here is where it
 * lives" — rather than padded with near-misses.
 */

/**
 * How many rows the candidate pool holds.
 *
 * Wide enough that the right product is in it for a multi-keyword guess
 * across a 2,500-line catalogue, small enough to score in memory without
 * thinking about it. `fetchCandidates` in `parcha-match.ts` caps at 80
 * for a single line; this pool is shared across up to six guesses, so it
 * is correspondingly larger.
 */
const CANDIDATE_POOL = 600;

/** The default number of products offered per guess. */
export const MATCHES_PER_GUESS = 8;

export interface GuessMatch {
  guess: VisionGuess;
  /** Best first. Empty when nothing cleared the bar. */
  products: Product[];
  /**
   * Where to send somebody when `products` is empty — the department the
   * model classified the guess into, if it named one that has products.
   */
  department: { slug: string; name: string } | null;
}

interface Candidate {
  id: string;
  slug: string;
  name: string;
  brandName: string | null;
  brandSlug: string | null;
  /** Null is ordinary: `Product.category` is optional in the schema. */
  categorySlug: string | null;
  hasPhoto: boolean;
}

/**
 * Resolves every guess against the catalogue.
 *
 * Order within a guess is by score; order of the guesses themselves is
 * the order the model gave, which is prominence in the photograph or
 * emphasis in the sentence.
 */
export async function matchGuesses(
  guesses: VisionGuess[],
  perGuess: number = MATCHES_PER_GUESS,
): Promise<GuessMatch[]> {
  if (guesses.length === 0) return [];

  /* Every keyword from every guess, deduplicated. Two guesses about the
     same room routinely share words, and a word fetched twice is a
     second pass over the same index for nothing. */
  const keywords = [
    ...new Set(
      guesses.flatMap((g) => g.keywords.map((k) => k.toLowerCase())).filter((k) => k.length >= 2),
    ),
  ];
  if (keywords.length === 0) {
    return guesses.map((guess) => ({ guess, products: [], department: null }));
  }

  const [candidates, departments] = await Promise.all([
    fetchPool(keywords),
    /* The departments the guesses name, so an unmatched guess can still
       point somewhere. Only ones with live products: a link to an empty
       department is a link to a page that says nothing is here. */
    fetchDepartments(guesses),
  ]);

  /* Scored per guess, then every winner hydrated in a single query —
     `listProductsBySlugs` is one round trip for the whole screen. */
  const ranked = guesses.map((guess) => rank(guess, candidates, perGuess));
  const slugs = [...new Set(ranked.flat().map((c) => c.slug))];
  const hydrated = await listProductsBySlugs(slugs);
  const bySlug = new Map(hydrated.map((p) => [p.slug, p]));

  return guesses.map((guess, i) => ({
    guess,
    /* `flatMap` rather than `map`+filter: a slug that did not hydrate —
       retired between the two queries — drops out rather than becoming a
       hole in the row. */
    products: ranked[i].flatMap((c) => bySlug.get(c.slug) ?? []),
    department: guess.categorySlug ? (departments.get(guess.categorySlug) ?? null) : null,
  }));
}

/**
 * The candidate pool: anything whose name, brand or department contains
 * any of the keywords.
 *
 * `contains` here is deliberately loose — it is a *fetch*, not a match.
 * The match is `scoreCandidate`, which works on whole words and is what
 * stops "pop" matching inside "Popup". Letting the database be loose and
 * the scorer be strict is the same division `parcha-match.ts` uses.
 */
async function fetchPool(keywords: string[]): Promise<Candidate[]> {
  const rows = await db.product.findMany({
    where: {
      isActive: true,
      variants: { some: { isActive: true } },
      OR: keywords.flatMap((keyword) => [
        { name: { contains: keyword, mode: "insensitive" as const } },
        { brand: { name: { contains: keyword, mode: "insensitive" as const } } },
        { category: { name: { contains: keyword, mode: "insensitive" as const } } },
      ]),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      image: true,
      sourceImageUrl: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { slug: true } },
    },
    /* By name, not by relevance: Postgres has no relevance to offer on a
       `contains` filter, and `take` without an order is a non-deterministic
       slice — the same photograph would return different products on
       different requests. Scoring happens after this, in memory, so the
       order here only decides *which* 600 rows are considered. */
    orderBy: { name: "asc" },
    take: CANDIDATE_POOL,
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandName: row.brand?.name ?? null,
    brandSlug: row.brand?.slug ?? null,
    categorySlug: row.category?.slug ?? null,
    /* Whether there is a real picture, used as a tie-break below. The
       same gate `resolvePhoto` applies everywhere else, so a deployment
       with source imagery switched off does not quietly rank on a URL it
       will never render. */
    hasPhoto: Boolean(resolvePhoto(row)),
  }));
}

async function fetchDepartments(
  guesses: VisionGuess[],
): Promise<Map<string, { slug: string; name: string }>> {
  const slugs = [...new Set(guesses.map((g) => g.categorySlug).filter((s): s is string => !!s))];
  if (slugs.length === 0) return new Map();

  const rows = await db.category.findMany({
    where: {
      slug: { in: slugs },
      isActive: true,
      products: { some: { isActive: true, variants: { some: { isActive: true } } } },
    },
    select: { slug: true, name: true },
  });
  return new Map(rows.map((row) => [row.slug, row]));
}

/**
 * Scores the pool against one guess and returns the winners.
 *
 * The score is `scoreCandidate`'s — whole-word coverage of the keywords,
 * with its own brand and name-length tie-breaks — plus two bonuses this
 * module adds:
 *
 *  - **The department the model classified into.** Worth a lot: it is the
 *    one piece of evidence that did not come from word overlap, so it is
 *    what separates a chrome bathroom tap from a chrome kitchen tap when
 *    both share every keyword.
 *  - **Having a photograph.** Worth a little, and only as a tie-break.
 *    This whole feature is somebody comparing what they are looking at
 *    with what Quoin sells, and a brand-initial swatch cannot be compared
 *    to anything. It never outranks a better word match.
 */
function rank(guess: VisionGuess, pool: Candidate[], limit: number): Candidate[] {
  /* Through `tokenize` rather than used raw, so the trade vocabulary and
     the strong/weak split in `parcha-match.ts` apply here too — it is
     what turns "plastic paint" into "emulsion" and stops "for" and "with"
     counting as evidence. The model is asked for single distinctive
     words, so most keywords survive as strong; the ones that do not were
     never going to identify a product on their own. */
  const { strong, weak } = tokenize(guess.keywords.join(" "));
  if (strong.length === 0) return [];

  const brandTokens = guess.brand ? tokenize(guess.brand).strong : [];

  const scored: { candidate: Candidate; score: number; matched: number }[] = [];

  for (const candidate of pool) {
    const { matchedTokens, score } = scoreCandidate(
      strong,
      { name: candidate.name, brandName: candidate.brandName },
      weak,
    );
    if (matchedTokens.length === 0) continue;

    const inDepartment = guess.categorySlug != null && candidate.categorySlug === guess.categorySlug;

    /* The bar, stated once. Two independent word hits is evidence on its
       own; one hit is evidence only when the department agrees. See the
       note at the top of this file for why this is not simply "anything
       that matched at all". */
    if (matchedTokens.length < 2 && !inDepartment) continue;

    const brandMatch =
      brandTokens.length > 0 &&
      candidate.brandName != null &&
      tokenize(candidate.brandName).strong.some((word) => brandTokens.includes(word));

    scored.push({
      candidate,
      matched: matchedTokens.length,
      score:
        score +
        (inDepartment ? 0.4 : 0) +
        /* A brand the customer actually named — spoken, or legible in
           the photograph. `visual-search.ts` forbids guessing one, so
           when this fires it is a fact rather than a style inference. */
        (brandMatch ? 0.3 : 0) +
        (candidate.hasPhoto ? 0.05 : 0),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.candidate.name.length - b.candidate.name.length);
  return scored.slice(0, limit).map((s) => s.candidate);
}
