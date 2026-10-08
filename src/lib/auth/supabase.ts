import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase Auth clients.
 *
 * Three of them, and the differences matter more than the similarities:
 *
 *  - `supabaseRouteClient()` — anon key, reads and writes the session
 *    cookies. The only one that may start or end a session, so it is
 *    only ever built inside a route handler, where cookies are writable.
 *  - `supabaseReadClient()` — anon key, reads the session cookies and
 *    *discards* writes. For server components, which may not set a
 *    cookie; see the long note on `noopWrite` below.
 *  - `supabaseAdmin()` — service-role key, no cookies, no session. Used
 *    to look a Supabase account up by id when linking it to a customer.
 *
 * None of them is a data client. Catalogue, orders and customers are
 * read through Prisma exactly as before — Supabase is the thing that
 * proves a phone number belongs to whoever is holding the browser, and
 * nothing more.
 */

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

/**
 * Whether phone sign-in can work at all.
 *
 * Both halves are needed, and the single condition lives here so the
 * sign-in page, the OTP routes and `getSession` cannot drift apart and
 * disagree about whether sign-in exists — the same arrangement, and for
 * the same reason, as `isOtpDeliveryConfigured` in `sender.ts`.
 */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

/**
 * Whether phone sign-in should be offered.
 *
 * This briefly also required MSG91 to be configured, because delivery
 * ran through a Send SMS Hook in this app and the panel was offering a
 * "Send me a code" button that answered 500. Delivery has since moved to
 * a **native Supabase SMS provider**, configured in the Supabase
 * dashboard — so whether a message can actually leave is now Supabase's
 * business and is deliberately not knowable from here. Re-adding a
 * second condition would mean this app asserting something about a
 * provider it no longer talks to.
 *
 * The honest consequence: with the provider missing or out of credit,
 * the button appears and the request fails. That failure is handled
 * where it happens — `POST /api/v1/auth/otp/request` maps Supabase's
 * 422 "no provider" and `sms_send_failed` onto plain language, and the
 * panel offers Google instead. Guessing here would be worse, because the
 * guess would be wrong in both directions.
 */
export function isPhoneSignInAvailable(): boolean {
  return isSupabaseAuthConfigured();
}

function requireAuthConfig(): SupabaseAuthConfig {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Supabase Auth is not configured");
  }
  return {
    /* The same `SUPABASE_URL` the storage module reads. One project, one
       variable — see the note on `SUPABASE_ANON_KEY` in `env.ts` for why
       there is deliberately no second, `NEXT_PUBLIC_` copy of this. */
    url: env.SUPABASE_URL!,
    anonKey: env.SUPABASE_ANON_KEY!,
  };
}

/**
 * The cookie names Supabase writes a session under.
 *
 * Not a constant we choose — `@supabase/ssr` derives them from the
 * project ref and chunks a long session across `…0`, `…1`. Anything that
 * needs to know whether a Supabase session is present must ask by
 * prefix rather than by exact name.
 */
export const SUPABASE_COOKIE_PREFIX = "sb-";

/**
 * A client for a route handler: may read *and* write the session.
 *
 * `getAll`/`setAll` rather than the deprecated per-cookie accessors —
 * `@supabase/ssr` v0.6 removed `get`/`set`/`remove`, and passing them
 * silently gives you a client that can never persist a session.
 */
export async function supabaseRouteClient(): Promise<SupabaseClient> {
  const config = requireAuthConfig();
  const jar = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          jar.set(name, value, options as CookieOptions);
        }
      },
    },
  });
}

/**
 * A client for a server component or a page: reads only.
 *
 * `setAll` is a no-op on purpose, and this is the subtle part of the
 * whole integration. A Server Component cannot set a cookie — Next
 * throws if it tries — but the Supabase SDK will happily attempt it
 * whenever it decides an access token is due for refresh. Letting that
 * throw would turn a routine token refresh into a 500 on whatever page
 * the customer happened to be reading.
 *
 * Swallowing the write is safe *because* the middleware refreshes the
 * session on every navigation and writes the result there, where cookies
 * are writable. The read path never needs to persist anything; it only
 * needs to not explode. See `src/middleware.ts`.
 */
export async function supabaseReadClient(): Promise<SupabaseClient> {
  const config = requireAuthConfig();
  const jar = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: () => {
        /* Intentionally empty — see the note above. */
      },
    },
  });
}

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * Treated exactly like the storage module's use of the same key: server
 * only, never in a response body, never in a log line. It holds no
 * session and persists nothing, so it can never be mistaken for "the
 * current user" — `autoRefreshToken` and `persistSession` are off for
 * that reason rather than for performance.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role credentials are not configured");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* There was a `supabaseAuthMatchesStorage()` here, checking that the auth
   project URL and the storage project URL named the same project. It is
   gone because the drift it guarded against can no longer happen: both
   now read the one `SUPABASE_URL`. A check that can never fail is a check
   that only costs attention. */
