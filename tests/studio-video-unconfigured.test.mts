import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* A whole file for one branch, because `env` is parsed once at import and
   held — which is right: a deployment's configuration does not change
   under a running server. That also means `delete process.env.X` after
   the import does nothing, so the only honest way to exercise the
   unconfigured branch is a process that never had the variable set. The
   test runner gives each file its own, which is what this file is for.

   Deleted rather than merely not set, so this passes on a developer
   machine whose .env.local has a real customer code in it. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";
delete process.env.CF_STREAM_CUSTOMER_CODE;
delete process.env.CF_ACCOUNT_ID;
delete process.env.CF_STREAM_API_TOKEN;

const { videoFor, posterFor, isStreamConfigured, isStreamUploadConfigured } =
  await import("@/lib/video");

describe("with Cloudflare Stream unconfigured", () => {
  it("reports itself unconfigured on both sides", () => {
    assert.equal(isStreamConfigured(), false);
    assert.equal(isStreamUploadConfigured(), false);
  });

  it("degrades a Stream clip to no player rather than a broken one", () => {
    // The one thing that must not happen is a <video> pointed at
    // "https://customer-undefined.cloudflarestream.com/...", which is a
    // request that fails slowly and renders as a black box.
    assert.equal(
      videoFor({
        media: "VIDEO",
        videoUid: "deadbeef",
        videoPath: null,
        durationSeconds: 60,
      }),
      null,
    );
    assert.equal(
      posterFor({ media: "VIDEO", assetPath: null, videoUid: "deadbeef" }),
      null,
    );
  });

  it("still shows a chosen poster, so the pin is a room and not a gap", () => {
    assert.equal(
      posterFor({
        media: "VIDEO",
        assetPath: "/studio/kitchen-dwarka.jpg",
        videoUid: "deadbeef",
      }),
      "/studio/kitchen-dwarka.jpg",
    );
  });

  it("plays a clip this repo ships, which needs no account at all", () => {
    assert.equal(
      videoFor({
        media: "VIDEO",
        videoUid: null,
        videoPath: "/studio/kitchen.mp4",
        durationSeconds: 8,
      })?.src,
      "/studio/kitchen.mp4",
    );
  });
});
