import { env } from "@/lib/env";
import type { PinVideo } from "@/lib/types/studio";

/**
 * Where Studio's clips are played from.
 *
 * `src/lib/storage/index.ts` is the model for this file, and the split is
 * the same one: `StudioIdea.videoUid` / `videoPath` is the index, this
 * module is where the bytes actually come from, and no caller is allowed
 * to build a playback URL by hand. Two sources, and the difference is the
 * reason this module exists at all:
 *
 *  - **`videoUid` — Cloudflare Stream.** Adaptive bitrate over HLS. This
 *    is the one that matters: a sixty-second walkthrough of a kitchen is
 *    forty megabytes at a quality worth looking at, and the person it has
 *    to reach is holding a phone on a 3G cell somewhere the fibre has not
 *    arrived. A single progressive file makes that person's decision for
 *    them — they get the full-quality one or nothing, and on that cell it
 *    is nothing. A ladder lets their browser pick, second by second,
 *    which is not a thing this repo can implement and is the entire
 *    argument for taking the dependency.
 *
 *  - **`videoPath` — a file under `public/studio/`.** One progressive
 *    MP4, no ladder, no provider account, no credential. It exists so
 *    that the player is buildable and reviewable before anybody signs up
 *    to Stream, and so a clip dropped into the repo plays on a laptop
 *    with `CF_STREAM_CUSTOMER_CODE` unset. It is not what production
 *    should serve a feed from.
 *
 * **Null is the third case and it is the one every pin is in today.**
 * Studio has no clips, exactly as it has no photographs — see the long
 * note on `imageUrlFor` in `src/lib/types/studio.ts`, which this file
 * follows to the letter rather than inventing a second rule. A pin that
 * says `VIDEO` and has neither a uid nor a path renders as a still, and a
 * pin whose `videoPath` points outside `public/studio/` renders as a
 * still too: Studio plays Studio's own footage and nothing else. Borrowed
 * stock of somebody else's kitchen with a Quoin price list under it is
 * the same lie the department photographs were, moving.
 *
 * Server-only — it reads `env`. `IdeaView.video` is composed in
 * `toIdeaView` and handed to the client already resolved, so no component
 * imports this.
 */

const STUDIO_ASSET_PREFIX = "/studio/";

/** The Stream subdomain, or null when nobody has configured one. */
function customerCode(): string | null {
  return env.CF_STREAM_CUSTOMER_CODE || null;
}

/**
 * Whether a `videoUid` can be turned into something playable.
 *
 * Playback needs exactly one variable and it is not a secret — the
 * customer code appears in every manifest URL the browser fetches. The
 * API token is a different question; see `isStreamUploadConfigured`.
 */
export function isStreamConfigured(): boolean {
  return customerCode() !== null;
}

/** Whether a clip can be *sent* to Stream. Write credentials, not read. */
export function isStreamUploadConfigured(): boolean {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_STREAM_API_TOKEN);
}

/** Thrown by everything in this module that talks to Cloudflare, so a
    route catches one type — the discipline `StorageError` set. Never
    carries Cloudflare's raw response into a customer-facing message. */
export class VideoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VideoError";
  }
}

/* ---- Playback ------------------------------------------------------------ */

/**
 * The clip for a pin, ready to hand to a `<video>` element, or null.
 *
 * Exactly one of `videoUid` and `videoPath` is expected to be set. When
 * both are — which `setIdeaVideo` refuses to write and a hand-edited row
 * could still produce — the uid wins, because it is the one with the
 * bitrate ladder and the one production is meant to be serving.
 */
export function videoFor(row: {
  media: "PHOTO" | "VIDEO";
  videoUid: string | null;
  videoPath: string | null;
  durationSeconds: number | null;
}): PinVideo | null {
  if (row.media !== "VIDEO") return null;

  const durationSeconds = row.durationSeconds ?? null;

  if (row.videoUid) {
    const code = customerCode();
    /* Unconfigured is not an error and must not be a broken player: the
       pin falls back to its poster, which is a still of the room and an
       honest thing to show. */
    if (!code) return null;
    return {
      src: `https://customer-${code}.cloudflarestream.com/${row.videoUid}/manifest/video.m3u8`,
      format: "hls",
      durationSeconds,
    };
  }

  if (row.videoPath) {
    /* The same path test `imageUrlFor` applies, and for the same reason.
       A clip is only Studio's if it is Studio's. */
    if (!row.videoPath.startsWith(STUDIO_ASSET_PREFIX)) return null;
    return { src: row.videoPath, format: "mp4", durationSeconds };
  }

  return null;
}

/**
 * The still a clip shows before anybody presses play.
 *
 * Stream generates one from the footage itself, which is why a Stream pin
 * needs no `assetPath` at all. A pin with an `assetPath` under
 * `/studio/` keeps it — a frame chosen by the person who filmed the room
 * beats the one at 00:00, which is very often a doorway.
 *
 * Null falls through to `imageUrlFor` in `toIdeaView`, and from there to
 * the `MissingPhoto` tile, so a clip that cannot be played and has no
 * poster is a pin that says so.
 */
export function posterFor(row: {
  media: "PHOTO" | "VIDEO";
  assetPath: string | null;
  videoUid: string | null;
}): string | null {
  if (row.media !== "VIDEO" || !row.videoUid) return null;
  if (row.assetPath?.startsWith(STUDIO_ASSET_PREFIX)) return row.assetPath;

  const code = customerCode();
  if (!code) return null;
  return `https://customer-${code}.cloudflarestream.com/${row.videoUid}/thumbnails/thumbnail.jpg`;
}

/* ---- Upload -------------------------------------------------------------- */

/** How long an architect has to start their upload before the URL dies. */
const DIRECT_UPLOAD_TTL_SECONDS = 30 * 60;

/** Stream's own ceiling for a single direct upload, in seconds of video.
    Sixty seconds is the format; ten minutes is the room to be wrong. */
export const MAX_CLIP_SECONDS = 600;

/**
 * A one-shot URL the *browser* posts a clip to, never this server.
 *
 * Same reasoning as `StorageProvider.createUploadUrl`: Vercel caps a
 * request body around 4.5MB and a phone's clip of a finished kitchen is
 * an order of magnitude past that, so a proxy would fail on exactly the
 * files the feature exists for. Cloudflare takes the bytes, transcodes
 * the ladder, and the `uid` it returns here is what goes in
 * `StudioIdea.videoUid` once the clip is ready.
 *
 * `maxDurationSeconds` is Cloudflare's own check against the footage, not
 * ours against a number a client declared — a client that says sixty
 * seconds and sends forty minutes is rejected by the thing holding the
 * bytes.
 */
export async function createDirectUpload(input: {
  maxDurationSeconds?: number;
  /** Shown in the Cloudflare dashboard so a clip is findable by a human. */
  name: string;
}): Promise<{ uid: string; uploadUrl: string; expiresAt: Date }> {
  if (!isStreamUploadConfigured()) {
    throw new VideoError("Video uploads are not configured");
  }

  const expiresAt = new Date(Date.now() + DIRECT_UPLOAD_TTL_SECONDS * 1000);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: Math.min(
            input.maxDurationSeconds ?? MAX_CLIP_SECONDS,
            MAX_CLIP_SECONDS,
          ),
          expiry: expiresAt.toISOString(),
          meta: { name: input.name },
        }),
      },
    );
  } catch (error) {
    throw new VideoError(
      `Could not reach Cloudflare Stream: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: { uid?: string; uploadURL?: string };
  } | null;

  if (!response.ok || !body?.success || !body.result?.uid || !body.result.uploadURL) {
    throw new VideoError("Cloudflare Stream refused the upload", response.status);
  }

  return { uid: body.result.uid, uploadUrl: body.result.uploadURL, expiresAt };
}

/**
 * What Cloudflare knows about a clip once it has finished transcoding.
 *
 * Polled rather than pushed: a webhook would be a second public endpoint
 * to authenticate for a feature whose whole volume is a handful of clips
 * a month, and `ready` is the only state anything here cares about.
 * Null when Stream has never heard of the uid.
 */
export async function getClip(uid: string): Promise<{
  ready: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
} | null> {
  if (!isStreamUploadConfigured()) {
    throw new VideoError("Video uploads are not configured");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
    { headers: { authorization: `Bearer ${env.CF_STREAM_API_TOKEN}` } },
  );

  if (response.status === 404) return null;

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: {
      readyToStream?: boolean;
      duration?: number;
      input?: { width?: number; height?: number };
    };
  } | null;

  if (!response.ok || !body?.success || !body.result) {
    throw new VideoError("Cloudflare Stream would not answer", response.status);
  }

  const { readyToStream, duration, input } = body.result;
  return {
    ready: Boolean(readyToStream),
    /* Rounded to whole seconds on the way in, because that is what the
       column holds and what `atSeconds` is compared against. */
    durationSeconds: typeof duration === "number" ? Math.round(duration) : null,
    width: input?.width ?? null,
    height: input?.height ?? null,
  };
}
