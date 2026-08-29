import { handler, ok, requireStaff } from "@/lib/http";
import { listHarvestImages, listHarvestSources } from "@/lib/data/harvest";
import { one } from "@/lib/search-params";

/**
 * GET /api/v1/admin/harvest              — catalogues with unattached images
 * GET /api/v1/admin/harvest?source=&page= — the images in one of them
 */
export const GET = handler(async (request) => {
  await requireStaff();

  const url = new URL(request.url);
  const source = one(url.searchParams.get("source") ?? undefined);

  if (!source) return ok({ sources: await listHarvestSources() });

  return ok(await listHarvestImages(source, Number(url.searchParams.get("page")) || 1));
});
