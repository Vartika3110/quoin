import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/auth/phone";

/**
 * Turning a verified Supabase account into a Quoin customer.
 *
 * This is the whole seam between the two systems, and it exists exactly
 * once so that the rules below cannot be re-decided, differently, by the
 * next route that needs a user.
 *
 * The contract: by the time anything here runs, Supabase has already
 * proved the customer controls that phone number. Nothing in this file
 * ever accepts a phone from a request body.
 */

export class SupabaseIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseIdentityError";
  }
}

/**
 * The phone on a Supabase account, in the form this app stores.
 *
 * Supabase keeps E.164 without the `+` (`919876543210`), which is not
 * what `User.phone` holds and not what `normalizePhone` emits. Running it
 * back through the app's own normaliser rather than just prepending `+`
 * means one definition of a valid Indian mobile number across both
 * systems — if Supabase ever hands back something that is not one, this
 * refuses it instead of writing it to the identity column.
 */
export function phoneFromSupabase(user: SupabaseAuthUser): string | null {
  if (!user.phone) return null;
  try {
    return normalizePhone(user.phone);
  } catch {
    return null;
  }
}

/**
 * Finds — or creates — the customer behind a verified Supabase account.
 *
 * Three cases, in strict order of trust:
 *
 *  1. **Already linked.** A row carries this `supabaseUserId`. That is
 *     the identity; return it. The phone is refreshed from Supabase in
 *     case the customer changed it there.
 *
 *  2. **Pre-existing account, first Supabase sign-in.** No row carries
 *     the id, but one carries this verified phone — every account made
 *     before this migration, and every Google account that later
 *     verified the same number. Claim it by writing the link.
 *
 *     This is safe *only* because the phone was verified by Supabase on
 *     this request. Matching an unverified number here would hand one
 *     person's order history to whoever typed their number.
 *
 *  3. **Nobody.** Create the customer.
 *
 * The one case that must never happen quietly is a phone that belongs to
 * a row already linked to a *different* Supabase account. That means the
 * number was recycled, or two Supabase accounts exist for one line, and
 * silently re-pointing the link would move a stranger into someone's
 * order history. It throws.
 */
export async function resolveSupabaseUser(authUser: SupabaseAuthUser): Promise<{
  userId: string;
  isNewUser: boolean;
}> {
  const supabaseUserId = authUser.id;
  const phone = phoneFromSupabase(authUser);

  const linked = await db.user.findUnique({
    where: { supabaseUserId },
    select: { id: true, phone: true },
  });

  if (linked) {
    /* Supabase is the source of truth for the verified number, so a
       change made there propagates. Guarded by `!==` rather than written
       unconditionally: this runs on every sign-in, and an unconditional
       write would be a row update per login for no reason. */
    if (phone && phone !== linked.phone) {
      await db.user.update({ where: { id: linked.id }, data: { phone } });
    }
    return { userId: linked.id, isNewUser: false };
  }

  if (phone) {
    const byPhone = await db.user.findUnique({
      where: { phone },
      select: { id: true, supabaseUserId: true },
    });

    if (byPhone) {
      if (byPhone.supabaseUserId && byPhone.supabaseUserId !== supabaseUserId) {
        /* Deliberately refuses rather than guessing. See the note above:
           every way of resolving this automatically ends with one
           customer holding another's orders. */
        throw new SupabaseIdentityError(
          "This mobile number is already linked to another account",
        );
      }

      /* `updateMany` with the null check, not `update`: two tabs
         verifying at once would both reach here, and the filter means
         the second writes nothing rather than overwriting the first. */
      const claimed = await db.user.updateMany({
        where: { id: byPhone.id, supabaseUserId: null },
        data: { supabaseUserId },
      });

      if (claimed.count === 0) {
        /* Lost the race. Whoever won wrote a link; re-read rather than
           assuming it was this request's account. */
        const now = await db.user.findUnique({
          where: { id: byPhone.id },
          select: { supabaseUserId: true },
        });
        if (now?.supabaseUserId !== supabaseUserId) {
          throw new SupabaseIdentityError(
            "This mobile number is already linked to another account",
          );
        }
      }

      return { userId: byPhone.id, isNewUser: false };
    }
  }

  const created = await db.user.create({
    data: {
      supabaseUserId,
      phone,
      /* Supabase phone sign-up carries no email. Left null rather than
         synthesised — `User.email` is unique, and a placeholder would
         collide the moment a second phone account appeared. */
      email: null,
    },
    select: { id: true },
  });

  return { userId: created.id, isNewUser: true };
}
