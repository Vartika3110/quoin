import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/http";
import { PRODUCT_SLUG_MAX_LENGTH } from "@/lib/types/catalog";
import { getProductStock } from "@/lib/data/product-stock";

const Body = z.object({
  slugs: z.array(z.string().min(1).max(PRODUCT_SLUG_MAX_LENGTH)).max(200),
});

/**
 * POST /api/v1/stock/products
 *
 * Stock state for a list of products, by slug — what the saved-products
 * page asks so it can mark the ones that sold out since they were saved.
 * See `src/lib/data/product-stock.ts` for the rule.
 *
 * Public, like `/checkout/quote`: stock is not personal. A POST rather
 * than a GET only because forty long product slugs do not fit a URL.
 */
export const POST = handler(async (request) => {
  const { slugs } = await parseBody(request, Body);
  return ok({ stock: await getProductStock([...new Set(slugs)]) });
});
