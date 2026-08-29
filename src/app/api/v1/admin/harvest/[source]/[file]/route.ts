import { ApiError, handler, requireStaff } from "@/lib/http";
import { readHarvestImage } from "@/lib/data/harvest";

type Ctx = { params: Promise<{ source: string; file: string }> };

/**
 * GET /api/v1/admin/harvest/{source}/{file}
 *
 * Serves an image that is not in `public/`, because an unattached
 * photograph is not something the storefront should hand out. Staff only,
 * and cached hard by the browser: the bytes at a given name never change,
 * and the pairing screen shows sixty of them at a time.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  await requireStaff();

  const { source, file } = await params;

  /* An unsafe segment throws out of the data layer; a missing file is a
     plain 404. Both end up here as "not found" to the caller. */
  let bytes: Buffer | null = null;
  try {
    bytes = await readHarvestImage(source, file);
  } catch {
    bytes = null;
  }
  if (!bytes) throw new ApiError("not_found", "No such image");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
});
