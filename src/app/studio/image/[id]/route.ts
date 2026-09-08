import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getIdeaImageSource } from "@/lib/data/studio";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  StorageError,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /studio/image/{ideaId}
 *
 * An inspiration photograph, as an image URL rather than as JSON.
 *
 * Studio needs something that can go straight into `src`, and the bucket
 * is private — nothing there is reachable without a signed URL minted by
 * this server (see `src/app/api/v1/uploads/[id]/route.ts`, which records
 * that invariant). Putting a signed URL into the feed's own JSON instead
 * would bake a five-minute expiry into a response that is cached for
 * longer than that, and every stale tile would render broken.
 *
 * So: a redirect, per image, to a URL signed the moment it is asked for.
 *
 * Not under `/api/v1` deliberately. Everything there answers with the
 * `{ data }` / `{ error }` envelope so a second client can handle errors
 * once; this answers with a 307 and an image, which is a different
 * contract, and quietly breaking the envelope in one route is how that
 * promise stops being true.
 *
 * The cache window is set *below* the signed URL's lifetime. A CDN that
 * held this redirect for longer than the URL it points at would serve a
 * cached 307 to a signature that had already expired.
 */
const CACHE_SECONDS = Math.floor(DOWNLOAD_URL_TTL_SECONDS * 0.8);

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const session = await getSession();

  /* Visibility lives in the `where` clause: someone else's private upload
     is indistinguishable from an id that was never issued. This route has
     a public URL and therefore has strangers on it. */
  const idea = await getIdeaImageSource(id, session?.userId ?? null);
  if (!idea) return new NextResponse("Not found", { status: 404 });

  /* Imagery this repo ships. Already public and already on the CDN, so
     the redirect is permanent-ish and costs nothing after the first hit. */
  if (idea.assetPath) {
    return NextResponse.redirect(new URL(idea.assetPath, _request.url), {
      status: 307,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  if (!idea.storageKey) return new NextResponse("Not found", { status: 404 });
  if (!isStorageConfigured()) {
    return new NextResponse("Not available", { status: 503 });
  }

  let url: string;
  try {
    url = await getStorageProvider().createDownloadUrl({
      key: idea.storageKey,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    if (error instanceof StorageError) {
      /* Logged with the id, never with the provider's own response text —
         the discipline `RazorpayError` and the uploads routes follow. */
      console.error("[studio] createDownloadUrl failed", {
        message: error.message,
        ideaId: id,
      });
      return new NextResponse("Not available", { status: 502 });
    }
    throw error;
  }

  return NextResponse.redirect(url, {
    status: 307,
    headers: {
      /* `private`, because the signature is scoped to one object and a
         shared cache holding it would hand it to the next person. The CDN
         is skipped and the browser still avoids re-signing on every
         scroll, which is where the cost actually is. */
      "Cache-Control": `private, max-age=${CACHE_SECONDS}`,
    },
  });
}
