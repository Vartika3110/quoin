import { POST as extract } from "@/app/api/v1/parcha/extract/route";

/**
 * POST /api/parse-parcha
 *
 * An alias. The implementation — multipart handling, size and type
 * checks, rate limiting, the OpenAI call and every customer-facing error
 * sentence — lives in `src/app/api/v1/parcha/extract/route.ts` and is
 * re-exported here unchanged. There is deliberately no second copy of any
 * of it: two endpoints that read a parcha would be two endpoints to keep
 * in step, and the one that fell behind would be the one someone was
 * using.
 *
 * Why both paths exist. `/api/v1/parcha/extract` is the canonical one: it
 * sits inside the versioned surface every other endpoint in this app
 * belongs to, and answers the shared `{ data }` / `{ error }` envelope
 * that `src/lib/http.ts` describes — which is what lets a second client
 * implement error handling once rather than per endpoint. This path is
 * the one the feature was specified against, kept working so that
 * anything already pointed at it does not break.
 *
 * The browser bundled with this repository posts to the versioned path
 * (see `readOne` in `ParchaWorkbench.tsx`). Both behave identically, and
 * both keep the API key server-side — the whole reason either exists is
 * that nothing in a browser may talk to api.openai.com.
 */

/* Declared here rather than re-exported. Next reads route segment config
   by statically analysing *this* file, so a re-exported `runtime` or
   `maxDuration` would silently not apply and this route would be built
   with the platform defaults — a 10-second cap that a multi-page PDF
   would trip every time, on the alias only. Kept in step with the
   canonical route by hand, which is why the values are commented in both
   places. */
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = extract;
