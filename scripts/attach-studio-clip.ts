/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

/**
 * Put a clip on a Studio pin, and cue its materials list to the footage.
 *
 *   npx tsx scripts/attach-studio-clip.ts <slug> --uid <stream-uid>
 *   npx tsx scripts/attach-studio-clip.ts <slug> --path /studio/kitchen-dwarka.mp4 \
 *       --duration 62 --size 1080x1920 --poster /studio/kitchen-dwarka.jpg
 *   npx tsx scripts/attach-studio-clip.ts <slug> --cues 1@4,2@11,3@23
 *   npx tsx scripts/attach-studio-clip.ts <slug> --clear
 *
 * A script and not a route, for the reason `setIdeaVideo` records: a clip
 * gets cued by somebody watching it with the materials list open, and
 * there is nothing an HTTP endpoint could add to that except a way to get
 * it wrong from a browser. It is also the only writer of `atSeconds`, so
 * the numbers in `--cues` are *line numbers as the pin's page shows them*
 * — not hotspot ids, which nobody has in front of them while watching.
 *
 * With `--uid`, the duration and frame size are read back from Cloudflare
 * rather than typed: they are facts about the footage, and a hand-typed
 * duration that disagrees with it puts a wrong number in the pill and
 * lets a cue past the end through the check in `setHotspotCues`.
 */
const db = new PrismaClient();

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** `"1@4,2@11"` → line 1 at four seconds, line 2 at eleven. */
function parseCues(raw: string): { line: number; atSeconds: number }[] {
  return raw.split(",").map((pair) => {
    const [line, seconds] = pair.split("@");
    const parsed = { line: Number(line), atSeconds: Number(seconds) };
    if (!Number.isInteger(parsed.line) || parsed.line < 1) {
      throw new Error(`Not a line number: "${pair}"`);
    }
    if (!Number.isInteger(parsed.atSeconds) || parsed.atSeconds < 0) {
      throw new Error(`Not a whole number of seconds: "${pair}"`);
    }
    return parsed;
  });
}

async function main() {
  const slug = process.argv[2];
  if (!slug || slug.startsWith("--")) {
    throw new Error(
      "usage: attach-studio-clip.ts <pin-slug> [--uid <id> | --path /studio/x.mp4] [--duration <s>] [--size WxH] [--poster /studio/x.jpg] [--cues 1@4,2@11] [--clear]",
    );
  }

  const idea = await db.studioIdea.findUnique({
    where: { slug },
    select: { id: true, title: true, media: true, durationSeconds: true },
  });
  if (!idea) throw new Error(`No Studio pin with slug "${slug}"`);

  if (has("clear")) {
    await db.studioIdea.update({
      where: { id: idea.id },
      data: {
        media: "PHOTO",
        videoUid: null,
        videoPath: null,
        durationSeconds: null,
      },
    });
    /* The cues go with it. A pin back to being a photograph whose lines
       still carry seconds would sort its materials list by a clock that
       is no longer anywhere — see the ordering in `assembleRoom`. */
    await db.studioHotspot.updateMany({
      where: { ideaId: idea.id },
      data: { atSeconds: null },
    });
    console.info(`${idea.title} is a photograph again.`);
    return;
  }

  const uid = flag("uid");
  const path = flag("path");

  if (uid || path) {
    if (uid && path) throw new Error("Pass --uid or --path, not both");
    if (path && !path.startsWith("/studio/")) {
      throw new Error("A shipped clip must live under /studio/");
    }

    let durationSeconds = flag("duration") ? Number(flag("duration")) : null;
    let width: number | undefined;
    let height: number | undefined;

    const size = flag("size");
    if (size) {
      const [w, h] = size.split("x").map(Number);
      if (!w || !h) throw new Error(`Not a frame size: "${size}"`);
      width = w;
      height = h;
    }

    if (uid) {
      /* Read from Cloudflare rather than trusted from the command line —
         see the note at the top. Imported lazily so that `--path`, which
         needs no account at all, does not fail for want of a token. */
      const { getClip, isStreamUploadConfigured } = await import("../src/lib/video");
      if (!isStreamUploadConfigured()) {
        throw new Error(
          "CF_ACCOUNT_ID and CF_STREAM_API_TOKEN are needed to read a clip back from Stream",
        );
      }
      const clip = await getClip(uid);
      if (!clip) throw new Error(`Cloudflare Stream has no clip ${uid}`);
      if (!clip.ready) {
        throw new Error(`Clip ${uid} is still transcoding. Try again shortly.`);
      }
      durationSeconds = clip.durationSeconds;
      width = clip.width ?? width;
      height = clip.height ?? height;
    }

    await db.studioIdea.update({
      where: { id: idea.id },
      data: {
        media: "VIDEO",
        videoUid: uid ?? null,
        videoPath: path ?? null,
        durationSeconds,
        ...(width && height ? { width, height } : {}),
        ...(flag("poster") ? { assetPath: flag("poster") } : {}),
      },
    });

    console.info(
      `${idea.title} is now a clip${durationSeconds ? ` of ${durationSeconds}s` : ""}.`,
    );
  }

  const cues = flag("cues");
  if (cues) {
    /* The same ordering the pin's page shows, so that "line 3" here and
       "3" in the dot are the same line. Read after the clip is attached,
       because attaching it is what makes the ordering time-based. */
    const hotspots = await db.studioHotspot.findMany({
      where: { ideaId: idea.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true, productSlug: true, x: true, y: true, atSeconds: true },
    });

    const placed = hotspots.filter(
      (h) => (h.x !== null && h.y !== null) || h.atSeconds !== null,
    );
    const unplaced = hotspots.filter(
      (h) => !((h.x !== null && h.y !== null) || h.atSeconds !== null),
    );
    const ordered = [...placed, ...unplaced];

    const fresh = await db.studioIdea.findUnique({
      where: { id: idea.id },
      select: { durationSeconds: true },
    });

    for (const cue of parseCues(cues)) {
      const hotspot = ordered[cue.line - 1];
      if (!hotspot) throw new Error(`This room has no line ${cue.line}`);
      if (
        fresh?.durationSeconds !== null &&
        fresh?.durationSeconds !== undefined &&
        cue.atSeconds > fresh.durationSeconds
      ) {
        throw new Error(
          `Line ${cue.line} is cued at ${cue.atSeconds}s, past the end of a ${fresh.durationSeconds}s clip`,
        );
      }

      await db.studioHotspot.update({
        where: { id: hotspot.id },
        data: { atSeconds: cue.atSeconds },
      });
      console.info(`  ${cue.line}. ${hotspot.productSlug} at ${cue.atSeconds}s`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
