import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import {
  canAccessAdmin,
  reportRefusedAdmin,
} from "@/lib/auth/admin-access";
import { hostVerdict } from "@/lib/auth/admin-host";

/**
 * The staff gate for pages, as `requireStaff` in `src/lib/http.ts` is for
 * routes.
 *
 * Every internal page repeated the same three steps — read the session,
 * load the row, `notFound()` — and a page that forgets one of them is an
 * internal tool served to the public. One function so there is one place
 * to get it right, and one place to change it when staff access stops
 * being a single boolean.
 *
 * `notFound()` rather than a redirect or a 403, matching `requireStaff`:
 * telling someone an internal tool lives at this URL is free
 * reconnaissance, and they cannot use it either way. Signed out and signed
 * in without access are deliberately indistinguishable.
 *
 * Read from the row, never from the session token. The JWT cannot be
 * revoked before it expires, so a token minted while someone had access
 * would otherwise keep working after it was taken away.
 *
 * This is a guard, not a layout concern: a `layout.tsx` does not re-run
 * for every navigation in the way a page does, so the check belongs at the
 * top of each page rather than once around them.
 */
export async function requireStaffPage() {
  /* The host half of the two locks, repeated here on purpose.
     `src/proxy.ts` already refuses an internal path on the public
     host, and this is the same refusal one layer in — a matcher is one
     regex away from quietly exempting a route, and the gate that must
     not be bypassed is the one that does not depend on it. */
  const requestHeaders = await headers();
  const onWrongHost =
    hostVerdict({
      host:
        requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
      pathname: "/admin",
      adminHost: process.env.ADMIN_HOST ?? null,
      inProduction: process.env.NODE_ENV === "production",
    }).kind !== "serve";
  if (onWrongHost) notFound();

  const session = await getSession();
  if (!session) notFound();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    /* `email` is selected for the gate itself, not for the page: a Google
       account carries no phone until checkout collects one, so the email
       is the only identity an approval can match it by. */
    select: { id: true, name: true, phone: true, email: true, isStaff: true },
  });

  if (!user) notFound();

  if (!canAccessAdmin(user)) {
    reportRefusedAdmin(user, "an internal page");
    notFound();
  }

  return user;
}
