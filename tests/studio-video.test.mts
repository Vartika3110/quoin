import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time and `@/lib/video` reads it. Same two
   lines as every other suite — see tests/unit.test.mts for why order
   matters, and `??=` so one process running the whole glob never fights
   over who sets them.

   The Stream customer code is set here rather than left unset, because
   almost every case below is about what a *configured* deployment does.
   The unconfigured case gets its own describe block, which restores it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";
process.env.CF_STREAM_CUSTOMER_CODE ??= "abc123";

const { activeAt, formatClock } = await import("@/lib/types/studio");
const { videoFor, posterFor } = await import("@/lib/video");

/* The unconfigured deployment is tested in
   tests/studio-video-unconfigured.test.mts, not here. `env` is parsed
   once at import and held, which is correct — a deployment's
   configuration does not change under a running server — and it means a
   test cannot unset a variable after the module has loaded. A second
   file, which the runner gives its own process, is the only honest way
   to test the other branch. */

/* Only the fields these functions read. Written out per-test rather than
   built by a helper, so a test that turns on `media` reads as a row that
   is a video rather than as an override of a default. */
type Row = Parameters<typeof videoFor>[0];

describe("videoFor", () => {
  it("is null on a photograph, whatever else the row carries", () => {
    // A row that still has a uid from a clip that was cleared is the
    // realistic version of this: `media` is what decides, not the
    // presence of bytes somewhere.
    const row: Row = {
      media: "PHOTO",
      videoUid: "left-over-uid",
      videoPath: "/studio/left-over.mp4",
      durationSeconds: 60,
    };
    assert.equal(videoFor(row), null);
  });

  it("builds an HLS manifest URL from a Stream uid", () => {
    const video = videoFor({
      media: "VIDEO",
      videoUid: "deadbeef",
      videoPath: null,
      durationSeconds: 62,
    });
    assert.deepEqual(video, {
      src: "https://customer-abc123.cloudflarestream.com/deadbeef/manifest/video.m3u8",
      format: "hls",
      durationSeconds: 62,
    });
  });

  it("serves a shipped clip as a progressive mp4", () => {
    const video = videoFor({
      media: "VIDEO",
      videoUid: null,
      videoPath: "/studio/kitchen-dwarka.mp4",
      durationSeconds: null,
    });
    assert.deepEqual(video, {
      src: "/studio/kitchen-dwarka.mp4",
      format: "mp4",
      durationSeconds: null,
    });
  });

  it("refuses a clip that is not Studio's own", () => {
    // The rule `imageUrlFor` sets: Studio plays Studio's footage. A path
    // pointing at the catalogue's photography — or anywhere else under
    // public/ — is not a room somebody filmed, and dressing a pin in one
    // is the lie the department pictures already were, moving.
    for (const path of ["/catalogue/taps.mp4", "/hero/reel.mp4", "studio/x.mp4"]) {
      assert.equal(
        videoFor({
          media: "VIDEO",
          videoUid: null,
          videoPath: path,
          durationSeconds: 30,
        }),
        null,
        `${path} should not play`,
      );
    }
  });

  it("prefers the uid when a row somehow carries both", () => {
    // `setIdeaVideo` refuses to write this; a hand-edited row can still
    // produce it, and the uid is the one with the bitrate ladder.
    const video = videoFor({
      media: "VIDEO",
      videoUid: "deadbeef",
      videoPath: "/studio/kitchen.mp4",
      durationSeconds: 10,
    });
    assert.equal(video?.format, "hls");
  });

  it("is null for a video row with no source at all", () => {
    assert.equal(
      videoFor({
        media: "VIDEO",
        videoUid: null,
        videoPath: null,
        durationSeconds: null,
      }),
      null,
    );
  });
});

describe("posterFor", () => {
  it("derives a still from the footage when nobody chose one", () => {
    assert.equal(
      posterFor({ media: "VIDEO", assetPath: null, videoUid: "deadbeef" }),
      "https://customer-abc123.cloudflarestream.com/deadbeef/thumbnails/thumbnail.jpg",
    );
  });

  it("prefers a chosen still under /studio/", () => {
    // The frame at 00:00 is very often a doorway.
    assert.equal(
      posterFor({
        media: "VIDEO",
        assetPath: "/studio/kitchen-dwarka.jpg",
        videoUid: "deadbeef",
      }),
      "/studio/kitchen-dwarka.jpg",
    );
  });

  it("ignores a chosen still that is not Studio's own", () => {
    // Falls through to Stream's own frame rather than borrowing the
    // catalogue's photography — same rule as everywhere else.
    assert.equal(
      posterFor({
        media: "VIDEO",
        assetPath: "/catalogue/taps.webp",
        videoUid: "deadbeef",
      }),
      "https://customer-abc123.cloudflarestream.com/deadbeef/thumbnails/thumbnail.jpg",
    );
  });

  it("is null on a photograph, so `imageUrlFor` decides", () => {
    assert.equal(
      posterFor({ media: "PHOTO", assetPath: "/studio/room.jpg", videoUid: null }),
      null,
    );
  });
});

describe("activeAt", () => {
  /* Three cued lines and one that is never framed — the cement under the
     floor, which is priced and listed and has no moment. */
  const lines = [
    { number: 1, atSeconds: 4 },
    { number: 2, atSeconds: 11 },
    { number: 3, atSeconds: 23 },
    { number: 4, atSeconds: null },
  ];

  it("says nothing before the first cue", () => {
    // A viewer three seconds into an establishing shot is not being
    // shown a tap. Null, not line 1.
    assert.equal(activeAt(lines, 0), null);
    assert.equal(activeAt(lines, 3), null);
  });

  it("takes effect on its own second", () => {
    assert.equal(activeAt(lines, 4), 1);
  });

  it("holds a line until the next cue, however long that is", () => {
    // Four seconds for line 1, twelve for line 2. Neither is a window
    // this function chose; both are what the author gave them.
    assert.equal(activeAt(lines, 10), 1);
    assert.equal(activeAt(lines, 11), 2);
    assert.equal(activeAt(lines, 22), 2);
  });

  it("holds the last cue to the end of the clip", () => {
    assert.equal(activeAt(lines, 23), 3);
    assert.equal(activeAt(lines, 600), 3);
  });

  it("never returns a line the clip does not frame", () => {
    for (let t = 0; t < 60; t += 1) {
      assert.notEqual(activeAt(lines, t), 4);
    }
  });

  it("gives a tie to the later line", () => {
    // A tap and its spout cued to the same second. The later one in the
    // list wins, which is the order the list itself reads in.
    const tied = [
      { number: 1, atSeconds: 5 },
      { number: 2, atSeconds: 5 },
    ];
    assert.equal(activeAt(tied, 5), 2);
  });

  it("is null when nothing is cued at all", () => {
    // Every photograph, and every clip nobody has cued yet.
    assert.equal(activeAt([{ number: 1, atSeconds: null }], 30), null);
    assert.equal(activeAt([], 0), null);
  });
});

describe("formatClock", () => {
  it("writes seconds as a clock", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(9), "0:09");
    assert.equal(formatClock(60), "1:00");
    assert.equal(formatClock(94), "1:34");
    assert.equal(formatClock(599), "9:59");
  });

  it("floors a fractional second rather than rounding up past it", () => {
    // `currentTime` is a float. 59.8s must not read as 1:00 while the
    // clip is still on the line cued at 59.
    assert.equal(formatClock(59.8), "0:59");
  });

  it("does not go negative", () => {
    assert.equal(formatClock(-1), "0:00");
  });
});
