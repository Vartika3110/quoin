import { db } from "@/lib/db";

/**
 * Matching a painter's materials list against the catalogue.
 *
 * `suggest()` in `search.ts` answers "what is the customer typing right
 * now" — a single `contains` lookup that must stay fast and predictable
 * for the header typeahead, and which this module does not touch. A parcha
 * line is a different problem: it is a finished phrase, not a
 * keystroke-by-keystroke prefix, and a real line almost never appears as a
 * substring of a product name. "Royal Luxury emulsion" needs "Royale
 * Shyne Luxury Emulsion" (a spelling difference and an inserted word);
 * `suggest(q, 1)`'s single `contains: q` rejects it outright, which is why
 * a real 16-line list matched 0 of 16 before this module existed.
 *
 * The fix is not to loosen `suggest()` — a looser single-token `contains`
 * is exactly how the old matcher put a sensor faucet on a painter's list
 * (it hit "water"). It is to score a line against several candidates on
 * *word* identity rather than raw substring identity, and to say "not in
 * the catalogue" when nothing scores well enough. Per invariant 8 in
 * `.claude/agents/senior-dev.md`, a wrong line on a priced materials list
 * is worse than an honest blank — everything below is built around that:
 * thresholds default to rejecting, not accepting.
 */

/**
 * Words that never help identify a product, so they are excluded from
 * scoring even though they are real words in a line. Two different kinds
 * of word end up here, for two different reasons:
 *
 *  - units and quantity words (`ltr`, `kg`, `bag`, `nos`, `inch`,
 *    `number`, `size`, `piece`, ...) describe how much or in what size,
 *    never what — "20 litres" says nothing that distinguishes a paint tin
 *    from a diesel drum.
 *  - generic trade words (`water`, `wall`, `white`, `paint`, `premium`,
 *    `super`, `set`, `kit`, `pop`) are real product words, but each one
 *    appears across a wide, unrelated slice of the catalogue — this is
 *    a general-purpose hardware-and-materials store, not a paint shop, so
 *    "water" alone is shared by taps, primers, tanks and sensor faucets.
 *    Treating them as weak means they can still tip a score when combined
 *    with a strong token (see `scoreCandidate`), but can never carry a
 *    match by themselves. This is what stops "water" from reaching a
 *    sensor faucet and "pop" (as a bare token — see `TRADE_VOCABULARY`
 *    below for the cases where a customer means "plaster of paris") from
 *    reaching a basin mixer's "Popup" waste.
 *  - ordinary English stopwords (`the`, `and`, `for`, `with`, `of`, `a`,
 *    `an`) carry no product identity in any catalogue.
 *
 * One constant, per the brief, rather than three, because the reason a
 * token should never anchor a match is the same in all three cases: it is
 * true of hundreds of unrelated rows, so a customer typing it is not
 * telling the matcher anything about which product they mean.
 */
export const WEAK_TOKENS = new Set([
  // units / quantities — describe how much, not what
  "ltr", "litre", "litres", "liter", "liters", "kg", "kgs", "bag", "bags",
  "nos", "pcs", "pc", "inch", "inchi", "inches", "number", "no", "size",
  "piece", "pieces",
  // generic trade words — real words, but shared by hundreds of rows
  "water", "wall", "white", "paint", "premium", "super", "set", "kit", "pop",
  /* size and filler words — they qualify a thing without naming one, and
     treating them as identity is how "Dhoti cloth large" reached "Shower
     Basket Large" on the single word "large". */
  "based", "large", "small", "big",
  // ordinary stopwords — carry no product identity anywhere
  "the", "and", "for", "with", "of", "a", "an",
]);

/**
 * The words a contractor actually writes, mapped to the words the
 * catalogue uses. A translation, not an addition: the mapped phrase
 * *replaces* the token it came from rather than sitting alongside it.
 *
 * That matters for `plastic`, the one entry not in the original brief.
 * The live catalogue was queried while building this module (see the
 * report) and confirmed "Premium plastic paint" only clears the bar
 * against "Apcolite Premium Emulsion" once "plastic" — trade shorthand
 * for water-based emulsion paint, as opposed to enamel — is read as
 * "emulsion". Left as an ordinary strong token instead, "plastic" is
 * additionally a real, literal word in over a dozen unrelated plumbing
 * and hardware rows ("Ashirvad ... Male Adapter Plastic Threaded", "...
 * plastic protection cap", a drill with a "plastic body"). Because the
 * mapping *replaces* rather than adds, translating it away also removes
 * those rows from the candidate query entirely — the one addition beyond
 * the brief's list both makes the required match possible and cannot by
 * itself reintroduce the "match the wrong department" failure this
 * module exists to prevent.
 *
 * Every other entry is exactly what the brief specified.
 */
export const TRADE_VOCABULARY: Record<string, string> = {
  regmal: "sandpaper", // Marathi/Hindi for sandpaper — the catalogue only ever says "sandpaper"
  patta: "putty blade", // literally "blade" — site slang for a putty/scraper blade
  lola: "roller", // Hindi slang for a paint roller
  ghodi: "ladder", // literally "mare" — site slang for a step ladder or trestle
  dhoti: "paint cloth", // the drop-cloth painters wear/use, sold as "paint cloth"
  billa: "birla", // common misspelling/mishearing of the Birla brand name
  bandal: "bundle", // "bandal" is how "bundle" is pronounced on site
  peace: "piece", // homophone typo for "piece", common in handwritten/SMS lists
  pop: "plaster of paris", // trade abbreviation; never the internet slang "pop"
  safedi: "whitewash", // Hindi for whitewash/lime wash
  jeena: "ladder", // regional slang for a ladder/stairway fixture
  putte: "putty", // common misspelling of "putty"
  plastic: "emulsion", // see the paragraph above — not in the original brief

  /* ---- Site words for structural materials.
   *
   * What a contractor writes on a parcha for the heavy end of a build,
   * mapped to the words a catalogue uses. `saria` reaches the one real
   * row today ("TMT bars (1 bundle)"); the rest reach nothing *yet*, and
   * that is deliberate — see the note under this table on why a synonym
   * for stock Quoin does not carry is still worth having. */
  saria: "tmt bars", // Hindi for steel reinforcement bar; the catalogue says "TMT bars"
  sariya: "tmt bars", // the same word, the other common spelling
  sariha: "tmt bars",
  badarpur: "coarse sand", // Delhi's name for the coarse sand quarried at Badarpur
  baadarpur: "coarse sand",
  rodi: "stone aggregate", // crushed stone; "rodi-badarpur" is one breath on a site
  roda: "stone aggregate",
  morang: "coarse sand", // river sand, also written moorang/moorum
  moorang: "coarse sand",
  moorum: "coarse sand",
  bajri: "stone aggregate", // fine gravel
  reta: "sand", // plain Hindi for sand
  gitti: "stone aggregate", // broken stone
  sariya_bundle: "tmt bars",
};

/**
 * A word here that matches nothing is not a mistake.
 *
 * `badarpur`, `rodi` and `morang` translate to sand and aggregate, and
 * this catalogue carries neither — the "Cement & Steel" department holds
 * cement, plaster, putty and primer, and the only structural steel in
 * three thousand rows is a single "TMT bars (1 bundle)". So those three
 * lines still come back unpriced.
 *
 * They are here anyway for two reasons. The translation is a fact about
 * the language and not about the stock, so it is correct whether or not
 * anything matches today; and the day sand is carried, every parcha that
 * ever said "morang" starts pricing without anybody remembering this
 * file exists. The alternative — adding them when the stock arrives — is
 * a change nobody will think to make.
 */

const STRONG_MIN_LENGTH = 3;

/** lowercase, strip punctuation, collapse whitespace, split on words. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function classify(token: string): "strong" | "weak" {
  if (/^\d+$/.test(token)) return "weak"; // bare numbers are quantities, never identity
  if (token.length < STRONG_MIN_LENGTH) return "weak";
  if (WEAK_TOKENS.has(token)) return "weak";
  return "strong";
}

export interface TokenizedLine {
  strong: string[];
  weak: string[];
}

/**
 * Reads one parcha term into strong (identity-bearing) and weak
 * (everything else) tokens.
 *
 * Trade vocabulary is applied before classification, one raw word at a
 * time, so a multi-word translation (`patta` → "putty blade") is itself
 * split and each half classified on its own merits — "putty" and "blade"
 * both end up strong, "of" inside "plaster of paris" ends up weak exactly
 * as it would if a customer had typed it directly.
 */
export function tokenize(term: string): TokenizedLine {
  const rawWords = wordsOf(term);
  const translated = rawWords.flatMap((word) =>
    wordsOf(TRADE_VOCABULARY[word] ?? word),
  );

  const strong = new Set<string>();
  const weak = new Set<string>();
  for (const token of translated) {
    (classify(token) === "strong" ? strong : weak).add(token);
  }
  return { strong: [...strong], weak: [...weak] };
}

/**
 * Whether two words identify the same thing: exact equality, or one is a
 * prefix of the other sharing at least 4 leading characters ("royal" →
 * "Royale", "putty" → "puttys" in either direction). 4 is deliberately
 * short of a full word — long enough that "pop" cannot prefix-match
 * "popup" (3 shared, rejected) or "cat" prefix-match "category", short
 * enough that a plural or a spelling variant on a 5+ letter word still
 * counts.
 */
function shareRoot(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

export interface ScoredCandidate {
  /** Which of the given strong tokens were found in the name or brand. */
  matchedTokens: string[];
  /** Coverage ratio plus small tie-break bonuses. Higher is better. */
  score: number;
}

/**
 * Scores one candidate against a line's strong tokens.
 *
 * Matching is always on whole words (`shareRoot`), never a bare
 * substring — this is what stops "pop" from matching inside "Popup" and
 * "brush" from matching inside "Brushbond": neither has a word boundary
 * at the point the old `contains` check would have accepted.
 */
export function scoreCandidate(
  tokens: string[],
  candidate: { name: string; brandName?: string | null },
  weakTokens: string[] = [],
): ScoredCandidate {
  if (tokens.length === 0) return { matchedTokens: [], score: 0 };

  const nameWords = wordsOf(candidate.name);
  const brandWords = candidate.brandName ? wordsOf(candidate.brandName) : [];

  const matchedTokens = tokens.filter(
    (token) =>
      nameWords.some((word) => shareRoot(token, word)) ||
      brandWords.some((word) => shareRoot(token, word)),
  );

  const coverage = matchedTokens.length / tokens.length;

  const brandBonus = tokens.some((token) =>
    brandWords.some((word) => shareRoot(token, word)),
  )
    ? 0.08
    : 0;

  /* Same reasoning `suggest()` documents for its own shortest-name sort:
     a customer's short phrase is more often the plain product than a
     variant loaded with extra qualifiers in its name. Deliberately a soft
     bonus that only ever breaks a coverage tie, never a sort key on its
     own — two candidates with different coverage are never reordered by
     name length. */
  const lengthBonus = 0.5 / (candidate.name.length + 20);

  /* Weak tokens (see WEAK_TOKENS) can never create a match on their own —
     that is the whole point of classifying them weak. But once a
     candidate already qualifies on strong tokens, a weak word the line
     and the candidate both share is real context, and the live-catalogue
     check this module's report is built from turned up real cases where
     ignoring that context picked the wrong product. "Premium plastic
     paint" (strong tokens, after translation: just "emulsion") ties at
     1/1 coverage against *every* emulsion in the catalogue, and without
     this bonus the length preference alone picked "Tractor Emulsion" —
     Asian Paints' budget line — silently dropping the "Premium" the
     customer wrote. "Paint brush 5 inch" (strong: just "brush") likewise
     tied against "W.C. Brush Holder", a toilet fitting, until "paint"
     (present in "Asian Paints TruCare Brush", absent from the toilet
     fitting) was counted. Weighted well below a strong-token match (0.03
     per shared word against a full 1/N coverage step) so it can only
     ever move the needle between candidates that already tied on real
     evidence — it never lets a lower-coverage candidate outrank a
     higher-coverage one. */
  const weakOverlap = weakTokens.filter(
    (token) =>
      nameWords.some((word) => shareRoot(token, word)) ||
      brandWords.some((word) => shareRoot(token, word)),
  ).length;
  const weakContextBonus = weakOverlap * 0.03;

  return { matchedTokens, score: coverage + brandBonus + weakContextBonus + lengthBonus };
}

/** Below this, a single matched token is common enough to be a coincidence. */
const DISTINCTIVE_MAX_OCCURRENCES = 40;

/**
 * Picks the best candidate for a set of strong tokens, or null when
 * nothing clears the acceptance bar.
 *
 * The bar: at least 2 strong tokens matched, which needs no further
 * evidence — two independent word hits on a short line is not a
 * coincidence. Exactly 1 matched token is accepted only when that token
 * is *distinctive*, i.e. rare enough across the candidate set that
 * matching it is still meaningful evidence rather than a word so common
 * it was bound to hit something.
 *
 * Distinctiveness is approximated by counting occurrences within the
 * candidates already fetched (`fetchCandidates` below caps that set at
 * 80) rather than issuing a second COUNT query — cheap because the data
 * is already in memory, and at a catalogue in the low thousands the
 * difference between "appears in 38 of the 60 fetched rows" and "appears
 * in 38 of every row that contains it" never changes the accept/reject
 * decision on the boundary that matters here.
 */
export function pickBestCandidate<
  T extends { name: string; brandName?: string | null },
>(tokens: string[], candidates: T[], weakTokens: string[] = []): T | null {
  if (tokens.length === 0 || candidates.length === 0) return null;

  let best: { candidate: T; result: ScoredCandidate } | null = null;
  for (const candidate of candidates) {
    const result = scoreCandidate(tokens, candidate, weakTokens);
    if (!best || result.score > best.result.score) best = { candidate, result };
  }
  if (!best || best.result.matchedTokens.length === 0) return null;

  if (best.result.matchedTokens.length >= 2) return best.candidate;

  /* One hit out of several written words is not evidence, whichever word
     it was. Two attempts to be cleverer than that both failed against the
     live catalogue: accepting any single rare word returned a *plaster
     trowel* for "POP plaster of paris" (hit "plaster", missed "paris"),
     and accepting only the line's last word — on the theory that these
     lists qualify first and name the product last — returned a *shower
     basket* for "Dhoti cloth large", because "large" happened to sit
     last. Both are hand tools and bathroom fittings billed onto a
     painter's materials list, which is the failure this threshold exists
     to prevent.
     So: a line that wrote several identifying words must match at least
     two of them. Only a line whose whole identity is one word gets to
     match on one, and even then the word has to be distinctive. The
     honest blank is the better answer — the customer can see the line was
     not priced, which a wrong product hides. */
  if (tokens.length > 1) return null;

  const soleToken = best.result.matchedTokens[0];
  const occurrences = candidates.filter(
    (c) => scoreCandidate([soleToken], c).matchedTokens.length > 0,
  ).length;
  return occurrences < DISTINCTIVE_MAX_OCCURRENCES ? best.candidate : null;
}

/**
 * Tokenizes a term and ranks it against an already-fetched candidate set.
 *
 * Pure (no DB access) so it can be unit tested directly against a fixture
 * of real catalogue names. `matchParchaTerm` below is the only thing that
 * adds a database.
 *
 * Falls back once, dropping the *leading* strong token, when the full set
 * matches nothing — "Putty blade 8 inch" still reaches "Putty Blade,
 * Stainless Steel" if a spelling variant ever cost it one of two tokens.
 * The retry reuses the same candidate list rather than re-querying: that
 * list was fetched with an `OR` across *every* strong token (see
 * `fetchCandidates`), so anything the smaller token set could match was
 * already pulled in by the larger one. At most one drop — beyond that the
 * remaining token stops being evidence of anything.
 *
 * Which end it drops from is the whole point, and the first version of
 * this function got it backwards. These lines qualify first and name the
 * product last, so the leading word is the one that can be spared:
 * dropping the trailing word instead turned "plaster of paris" into a
 * search for "plaster", which is a single-token line, sails past
 * `pickBestCandidate`'s head-token guard, and returned a *plaster
 * trowel* — undoing that guard through the back door and billing a hand
 * tool onto a list of materials.
 */
export function matchTermAgainstCandidates<
  T extends { name: string; brandName?: string | null },
>(term: string, candidates: T[]): T | null {
  const { strong, weak } = tokenize(term);
  if (strong.length === 0) return null;

  const direct = pickBestCandidate(strong, candidates, weak);
  if (direct) return direct;

  if (strong.length > 1) {
    return pickBestCandidate(strong.slice(1), candidates, weak);
  }
  return null;
}

/**
 * Mirrors the `SELLABLE` filter in `search.ts` — only rows a customer can
 * actually buy. Kept as its own copy rather than imported: `search.ts`
 * calls into this module, and importing the filter back the other way
 * would make the two files depend on each other's module-init order for
 * a three-line object. Whoever edits one should check the other.
 */
const SELLABLE = {
  isActive: true,
  category: { isActive: true },
  variants: { some: { isActive: true } },
} as const;

export interface ParchaCandidate {
  id: string;
  slug: string;
  name: string;
  sku: string;
  image: string | null;
  sourceImageUrl: string | null;
  brandName: string | null;
}

/**
 * One query per line's strong tokens, `OR`-ed together with a plain
 * `contains` — deliberately broader than the scorer needs. Recall lives
 * here (cheap, index-backed, a few dozen extra rows); precision lives in
 * `scoreCandidate`'s word-boundary matching. This is why a candidate list
 * fetched on "brush" can include "Brushbond" (a plain substring hit) and
 * still never be picked — the word-boundary check on that same list
 * throws it out again.
 */
async function fetchCandidates(strongTokens: string[]): Promise<ParchaCandidate[]> {
  if (strongTokens.length === 0) return [];

  const rows = await db.product.findMany({
    where: {
      ...SELLABLE,
      OR: strongTokens.map((token) => ({
        name: { contains: token, mode: "insensitive" as const },
      })),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      sku: true,
      image: true,
      sourceImageUrl: true,
      brand: { select: { name: true } },
    },
    /* Ordered, and a wider net than the scorer needs. Without an
       `orderBy` Postgres is free to return any 60 of the matching rows,
       and it does: the same sixteen-line list priced twice gave two
       different answers, one run finding "Royale Luxury Emulsion" and the
       next not fetching it at all. A stable order makes a priced list
       reproducible, which is the least a contractor can expect of it. */
    orderBy: { name: "asc" },
    take: 80,
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    image: row.image,
    sourceImageUrl: row.sourceImageUrl,
    brandName: row.brand?.name ?? null,
  }));
}

/**
 * Matches one parcha term against the live catalogue. A line with no
 * strong tokens is rejected before any query runs — see the module doc
 * comment on why guessing from weak tokens alone is worse than an honest
 * "not in the catalogue".
 */
export async function matchParchaTerm(term: string): Promise<ParchaCandidate | null> {
  const { strong } = tokenize(term);
  if (strong.length === 0) return null;

  const candidates = await fetchCandidates(strong);
  if (candidates.length === 0) return null;

  return matchTermAgainstCandidates(term, candidates);
}
