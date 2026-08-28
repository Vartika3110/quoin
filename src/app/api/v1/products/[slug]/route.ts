import { ApiError, handler, ok } from "@/lib/http";
import { getProductBySlug, getRelatedProducts } from "@/lib/data/catalog";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/products/{slug}
 *
 * Returns the product with its cross-sell, because every client that
 * renders a detail page needs both and a second round trip on a mobile
 * connection is the slower half of the page.
 */
export const GET = handler(
  async (_request, { params }: Ctx) => {
    const { slug } = await params;

    const product = await getProductBySlug(slug);
    if (!product) throw new ApiError("not_found", "No such product");

    return ok({ product, related: await getRelatedProducts(product) });
  },
);
