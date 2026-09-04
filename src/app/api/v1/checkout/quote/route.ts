import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/http";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { quoteCart } from "@/lib/data/checkout";

const Body = z.object({
  lines: z
    .array(
      z.object({
        productSlug: z.string().min(1).max(200),
        variantId: z.string().min(1).max(64),
        qty: z.number().int().positive().max(100_000),
      }),
    )
    .max(100),
});

/**
 * POST /api/v1/checkout/quote
 *
 * Prices a cart against the live catalogue and reports what moved.
 *
 * Open to guests: someone must be able to see what a basket costs before
 * being asked to sign in. The Pro rate is the one thing that depends on
 * identity, and it is read from the user row rather than from anything the
 * client sends — a request claiming `isPro: true` would otherwise buy
 * trade pricing.
 */
export const POST = handler(async (request) => {
  const { lines } = await parseBody(request, Body);

  const session = await getSession();
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { tier: true },
      })
    : null;

  return ok(await quoteCart(lines, user?.tier === "PRO"));
});
