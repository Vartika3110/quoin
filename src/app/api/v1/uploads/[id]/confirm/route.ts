import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { db } from "@/lib/db";
import {
  MAX_UPLOAD_BYTES,
  StorageError,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/uploads/{id}/confirm
 *
 * Step two of the signed-direct-upload flow, called once the browser's
 * direct upload to the bucket has finished. Nothing the client says here
 * is trusted: the row only moves to `STORED` after `stat()` reads the
 * object back from the bucket itself and its real size and content type
 * match what `POST /api/v1/uploads` recorded. A client that declared
 * `image/png` and then sent 40MB of something else does not get to
 * decide what this row says — it gets `ABANDONED` instead.
 *
 * Scoped to the requesting customer in the `where` clause, the same way
 * `getOrderForUser` is (src/lib/data/order-history.ts): a row that exists
 * but belongs to someone else answers identically to one that does not
 * exist at all.
 */
export const POST = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.storedFile.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      status: true,
      storageKey: true,
      contentType: true,
      sizeBytes: true,
    },
  });
  if (!file) throw new ApiError("not_found", "No such upload");

  /* Idempotent: a client that retries a confirm it already got a success
     response for (a flaky connection, a duplicate tap) gets the same
     answer back rather than an error about a row no longer PENDING. */
  if (file.status === "STORED") {
    return ok({ fileId: file.id, status: "STORED" as const });
  }
  if (file.status !== "PENDING") {
    throw new ApiError("conflict", "This upload can no longer be confirmed.");
  }

  if (!isStorageConfigured()) {
    throw new ApiError("conflict", "Uploads are not available yet.");
  }

  let stat;
  try {
    stat = await getStorageProvider().stat(file.storageKey);
  } catch (error) {
    if (error instanceof StorageError) {
      console.error("[uploads] stat failed", { message: error.message, fileId: file.id });
      throw new ApiError("internal", "We could not confirm the upload. Please try again.");
    }
    throw error;
  }

  /* The size cap is enforced twice on purpose: once at request time
     against the declared size (`POST /api/v1/uploads`), and again here
     against the real one — a declared size under the cap proves nothing
     about what actually landed in the bucket. */
  const matches =
    stat !== null &&
    stat.sizeBytes === file.sizeBytes &&
    stat.contentType === file.contentType &&
    stat.sizeBytes <= MAX_UPLOAD_BYTES;

  if (!matches) {
    await db.storedFile.update({ where: { id: file.id }, data: { status: "ABANDONED" } });
    throw new ApiError(
      "conflict",
      stat === null
        ? "Nothing was uploaded for this file."
        : "The uploaded file did not match what was declared.",
    );
  }

  await db.storedFile.update({
    where: { id: file.id },
    data: { status: "STORED", confirmedAt: new Date() },
  });

  return ok({ fileId: file.id, status: "STORED" as const });
});
