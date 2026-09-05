import { ApiError, handler, ok, requireUser } from "@/lib/http";
import { db } from "@/lib/db";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  StorageError,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/uploads/{id}
 *
 * A short-lived signed download URL for one stored file — never the
 * bytes themselves, and never a bare bucket path, because the bucket is
 * private and nothing is ever served from a public URL.
 *
 * Visible only to the file's owner or to staff, and that check is the
 * `where` clause itself rather than a fetch-then-compare: staff read by
 * `id` alone (an internal tool is allowed to look at any customer's
 * file), everyone else by `id` *and* `userId` together, so a row that
 * belongs to someone else 404s exactly like a row that does not exist —
 * see `getOrderForUser` (src/lib/data/order-history.ts) for the same
 * reasoning applied to order references.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.storedFile.findFirst({
    where: user.isStaff ? { id } : { id, userId: user.id },
    select: { id: true, status: true, storageKey: true },
  });
  if (!file) throw new ApiError("not_found", "No such file");

  if (file.status !== "STORED") {
    throw new ApiError("conflict", "This file is not available yet.");
  }

  if (!isStorageConfigured()) {
    throw new ApiError("conflict", "Downloads are not available yet.");
  }

  let url: string;
  try {
    url = await getStorageProvider().createDownloadUrl({
      key: file.storageKey,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
  } catch (error) {
    if (error instanceof StorageError) {
      console.error("[uploads] createDownloadUrl failed", {
        message: error.message,
        fileId: file.id,
      });
      throw new ApiError("internal", "We could not prepare the download. Please try again.");
    }
    throw error;
  }

  return ok({ url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS });
});
