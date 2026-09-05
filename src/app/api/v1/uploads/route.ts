import { z } from "zod";
import { StoredFileKind } from "@prisma/client";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import { db } from "@/lib/db";
import {
  ACCEPTED_PARCHA_TYPES,
  MAX_UPLOAD_BYTES,
  StorageError,
  UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  UPLOAD_RATE_LIMIT_WINDOW_MS,
  buildStorageKey,
  getStorageProvider,
  isAcceptedContentType,
  isStorageConfigured,
  storageBucketName,
} from "@/lib/storage";

const Body = z.object({
  kind: z.nativeEnum(StoredFileKind),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  /* Display only — never used to build the storage path. See the comment
     on `buildStorageKey` (src/lib/storage/index.ts) for why. */
  originalName: z.string().trim().min(1).max(255),
});

/**
 * POST /api/v1/uploads
 *
 * Step one of the signed-direct-upload flow: validates what the client
 * says it wants to send, writes a `PENDING` `StoredFile` row, and hands
 * back a short-lived URL the *browser* uploads straight to the bucket.
 * This route never sees the file's bytes — see `StorageProvider.
 * createUploadUrl` for why that has to be true on Vercel.
 *
 * Nothing here is trusted at face value. `contentType` is checked against
 * an explicit allow-list, `sizeBytes` against a hard cap, and the object
 * this URL points at gets checked again — against what actually landed in
 * the bucket, not what was declared here — by `POST .../confirm`.
 */
export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  if (!isAcceptedContentType(body.contentType)) {
    throw new ApiError("bad_request", "That file type is not supported", {
      contentType: `Accepted types: ${ACCEPTED_PARCHA_TYPES.join(", ")}`,
    });
  }

  /* An endpoint that mints signed upload URLs is an endpoint that fills a
     bucket. Counted straight off `StoredFile.createdAt` — see the comment
     on `UPLOAD_RATE_LIMIT_WINDOW_MS` — the same idiom the OTP request
     route uses against `OtpChallenge.createdAt`. */
  const windowStart = new Date(Date.now() - UPLOAD_RATE_LIMIT_WINDOW_MS);
  const recentCount = await db.storedFile.count({
    where: { userId: user.id, createdAt: { gte: windowStart } },
  });
  if (recentCount >= UPLOAD_RATE_LIMIT_MAX_REQUESTS) {
    throw new ApiError(
      "rate_limited",
      "Too many uploads requested. Please wait a few minutes and try again.",
    );
  }

  if (!isStorageConfigured()) {
    throw new ApiError("conflict", "Uploads are not available yet.");
  }

  const key = buildStorageKey({ kind: body.kind, contentType: body.contentType });

  let upload;
  try {
    upload = await getStorageProvider().createUploadUrl({
      key,
      contentType: body.contentType,
      maxBytes: MAX_UPLOAD_BYTES,
    });
  } catch (error) {
    if (error instanceof StorageError) {
      console.error("[uploads] createUploadUrl failed", { message: error.message });
      throw new ApiError("internal", "We could not start the upload. Please try again.");
    }
    throw error;
  }

  const file = await db.storedFile.create({
    data: {
      userId: user.id,
      kind: body.kind,
      status: "PENDING",
      storageKey: key,
      bucket: storageBucketName() ?? "",
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      originalName: body.originalName,
    },
    select: { id: true },
  });

  return ok({
    fileId: file.id,
    uploadUrl: upload.url,
    uploadHeaders: upload.headers ?? {},
    expiresAt: upload.expiresAt.toISOString(),
  });
});
