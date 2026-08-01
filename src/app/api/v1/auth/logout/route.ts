import { clearSessionCookie } from "@/lib/auth/session";
import { handler, ok } from "@/lib/http";

/**
 * POST /api/v1/auth/logout
 *
 * POST rather than GET so a prefetch, an image tag or a link in an email
 * cannot sign the customer out.
 *
 * This clears the cookie only; the JWT itself stays valid until it
 * expires. That is acceptable for a storefront session and is the stated
 * tradeoff in `session.ts` — a denylist is the fix if it stops being.
 */
export const POST = handler(async () => {
  await clearSessionCookie();
  return ok({ signedOut: true });
});
