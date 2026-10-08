import { endSession } from "@/lib/auth/session";
import { handler, ok } from "@/lib/http";

/**
 * POST /api/v1/auth/logout
 *
 * POST rather than GET so a prefetch, an image tag or a link in an email
 * cannot sign the customer out.
 *
 * `endSession` clears both schemes — it asks Supabase to revoke the
 * refresh token and drops the legacy cookie beside it. Clearing only one
 * would leave `getSession` answering from the other, which is a sign-out
 * button that does not sign out.
 */
export const POST = handler(async () => {
  await endSession();
  return ok({ signedOut: true });
});
