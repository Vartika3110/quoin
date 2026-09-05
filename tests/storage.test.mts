import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time. Same two lines as the other suites —
   see tests/unit.test.mts for why order matters, and `??=` so running
   every test file in one process, as `npm test`'s glob does, never fights
   over who sets it first. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  ACCEPTED_PARCHA_TYPES,
  MAX_UPLOAD_BYTES,
  buildStorageKey,
  extensionForContentType,
  isAcceptedContentType,
  isStorageConfigured,
} = await import("@/lib/storage");

describe("isAcceptedContentType", () => {
  it("accepts exactly the documented MIME allow-list", () => {
    for (const type of ACCEPTED_PARCHA_TYPES) {
      assert.equal(isAcceptedContentType(type), true);
    }
  });

  it("rejects anything not on the allow-list", () => {
    assert.equal(isAcceptedContentType("application/octet-stream"), false);
    assert.equal(isAcceptedContentType("text/html"), false);
    assert.equal(isAcceptedContentType("image/gif"), false);
    /* A double extension in the MIME string itself, not a filename — the
       allow-list check has no notion of filenames at all. */
    assert.equal(isAcceptedContentType("image/png; charset=binary"), false);
  });

  it("is exact-match, not prefix-match", () => {
    assert.equal(isAcceptedContentType("image/"), false);
    assert.equal(isAcceptedContentType("image"), false);
    assert.equal(isAcceptedContentType(""), false);
  });
});

describe("extensionForContentType", () => {
  it("maps every accepted type to a plain lowercase extension", () => {
    assert.equal(extensionForContentType("application/pdf"), "pdf");
    assert.equal(extensionForContentType("image/jpeg"), "jpg");
    assert.equal(extensionForContentType("image/png"), "png");
    assert.equal(extensionForContentType("image/webp"), "webp");
    assert.equal(extensionForContentType("image/heic"), "heic");
    assert.equal(
      extensionForContentType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      "xlsx",
    );
    assert.equal(extensionForContentType("text/csv"), "csv");
  });

  it("covers every member of the allow-list with no gaps", () => {
    for (const type of ACCEPTED_PARCHA_TYPES) {
      const ext = extensionForContentType(type);
      assert.equal(typeof ext, "string");
      assert.ok(ext.length > 0);
      assert.equal(ext, ext.toLowerCase());
    }
  });
});

describe("MAX_UPLOAD_BYTES boundaries", () => {
  it("is a positive whole number of bytes", () => {
    assert.ok(Number.isInteger(MAX_UPLOAD_BYTES));
    assert.ok(MAX_UPLOAD_BYTES > 0);
  });

  it("is large enough for a phone HEIC photo but bounded", () => {
    const fiveMb = 5 * 1024 * 1024;
    const oneGb = 1024 * 1024 * 1024;
    assert.ok(MAX_UPLOAD_BYTES >= fiveMb, "must fit an ordinary phone photo");
    assert.ok(MAX_UPLOAD_BYTES < oneGb, "must not be effectively unbounded");
  });
});

describe("buildStorageKey", () => {
  /* No parameter on buildStorageKey accepts a filename at all — this is
     the actual defence, not a sanitiser that could have a gap in it. The
     assertions below just confirm the shape stays that way: the key is
     always `<kind>/<uuid>.<ext>` and nothing else can reach it. */
  const keyPattern =
    /^[a-z_]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

  it("produces <kind>/<uuid>.<ext>, lowercasing the kind", () => {
    const key = buildStorageKey({ kind: "PARCHA", contentType: "application/pdf" });
    assert.match(key, keyPattern);
    assert.ok(key.startsWith("parcha/"));
    assert.ok(key.endsWith(".pdf"));
  });

  it("derives the extension from the validated content type, not any name", () => {
    const key = buildStorageKey({ kind: "PROJECT_DOCUMENT", contentType: "image/heic" });
    assert.match(key, keyPattern);
    assert.ok(key.startsWith("project_document/"));
    assert.ok(key.endsWith(".heic"));
  });

  it("is unique per call, so two uploads of the same kind never collide", () => {
    const a = buildStorageKey({ kind: "PARCHA", contentType: "image/jpeg" });
    const b = buildStorageKey({ kind: "PARCHA", contentType: "image/jpeg" });
    assert.notEqual(a, b);
  });

  it("has no argument a hostile originalName could reach — path traversal is impossible by construction", () => {
    /* buildStorageKey's input type has no `originalName` field: this is
       intentionally not "sanitise `../../etc/passwd`" but "there is no
       parameter for it to arrive through". The check that matters is that
       the actual output never contains traversal or separator characters
       beyond the one intentional `/` between kind and filename. */
    const key = buildStorageKey({ kind: "OTHER", contentType: "text/csv" });
    const afterKind = key.split("/").slice(1).join("/");
    assert.equal(afterKind.includes(".."), false);
    assert.equal(afterKind.includes("/"), false);
    assert.equal(key.split("/").length, 2, "exactly one separator: kind and filename");
  });

  it("a double extension in the declared content type cannot smuggle a second extension into the key", () => {
    /* "image/png" is the only way to reach the .png branch — there is no
       content type shaped like "image/png.exe" in the allow-list, and
       extensionForContentType is a fixed lookup table, not a suffix
       computed from client input. */
    const key = buildStorageKey({ kind: "PARCHA", contentType: "image/png" });
    assert.equal(key.match(/\./g)?.length, 1, "exactly one '.' — one extension, never two");
  });
});

describe("isStorageConfigured", () => {
  it("is false when the Supabase variables are unset, matching this test environment", () => {
    /* This suite intentionally never sets SUPABASE_URL / SERVICE_ROLE_KEY
       / STORAGE_BUCKET, so the app behaves the way an unconfigured deploy
       does: uploads report themselves unavailable rather than the process
       refusing to boot. See src/lib/env.ts for why that is deliberate. */
    if (
      !process.env.SUPABASE_URL &&
      !process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !process.env.SUPABASE_STORAGE_BUCKET
    ) {
      assert.equal(isStorageConfigured(), false);
    }
  });
});
