import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

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
  const session = await getSession();
  if (!session) notFound();

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, phone: true, isStaff: true },
  });

  if (!user?.isStaff) notFound();
  return user;
}
