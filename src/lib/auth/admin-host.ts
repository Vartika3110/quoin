/**
 * Which hostname the internal tools answer on.
 *
 * The console and the storefront are one Next application and one deploy,
 * and they are now two addresses: `quoin.co.in` sells, and whatever
 * `ADMIN_HOST` names — `admin.quoin.co.in` — administers. Unset, nothing
 * here does anything and both live together exactly as before.
 *
 * **Why bother, when `/admin` is already gated?** Because a URL that
 * exists on the storefront is a URL the whole internet can rattle. Every
 * customer's browser, every crawler and every scanner that walks
 * `quoin.co.in` finds `/admin` and starts guessing; a session fixation
 * bug or an XSS on a product page is a *same-origin* problem with the
 * console when they share an origin, and is not when they do not. Moving
 * the tools to their own name means the public address has no internal
 * surface on it at all, and the internal address has no catalogue, no
 * cart and no payment modal on it.
 *
 * It is the second of two independent locks, not a replacement for the
 * first. `canAccessAdmin` (`src/lib/auth/admin-access.ts`) decides *who*;
 * this decides *where*. Neither trusts the other: the gate still runs on
 * the admin host, and this still refuses `/admin` on the storefront host
 * even for the owner.
 *
 * **Reads `process.env` directly, not `@/lib/env`.** `src/middleware.ts`
 * is the main caller and runs on the edge runtime, where importing the
 * validated `env` throws unless `DATABASE_URL` and `AUTH_SECRET` are in
 * the edge bundle — neither of which has any business being there. The
 * variable is still declared in `env.ts` so that it is documented in the
 * one place every other setting is.
 */

/** Pages that belong to the admin host and nowhere else. */
const ADMIN_PREFIXES = ["/admin", "/api/v1/admin"];

/**
 * Pages the admin host must also serve, for it to be usable at all.
 *
 * `/signin` is the one that matters and the one that is easy to miss: the
 * session cookie is host-only, so a session established on the storefront
 * is not sent to the admin host. Signing in has to be possible *there*,
 * on its own address, or the console is a 404 nobody can get a cookie
 * for. `/_vercel` is the platform's own instrumentation, and `robots.txt`
 * has to be answerable by the crawler that asks for it — every response
 * from this host also carries `X-Robots-Tag: noindex`.
 */
const ADMIN_HOST_EXTRAS = ["/signin", "/_vercel", "/robots.txt"];

/**
 * A hostname, comparable.
 *
 * Forgiving about what it is given — `ADMIN_HOST` is typed into a Vercel
 * box by a human, and `https://admin.quoin.co.in/` is what people paste.
 * The port is dropped so that `admin.quoin.co.in:443` and a local
 * `:3001` both compare as the name itself.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split("/")[0];
  /* IPv6 in a Host header is bracketed — `[::1]:3000`. */
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    return close === -1 ? value : value.slice(0, close + 1);
  }
  return value.split(":")[0] || null;
}

/** The configured admin hostname, or `null` when the split is off. */
export function configuredAdminHost(): string | null {
  return normalizeHost(process.env.ADMIN_HOST);
}

/** `/admin`, `/admin/anything`, `/api/v1/admin/anything`. Not `/administrators`. */
export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminHostExtra(pathname: string): boolean {
  return ADMIN_HOST_EXTRAS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * A development machine, where one origin serves everything.
 *
 * `npm run dev` is `localhost:3000` and there is no second hostname to
 * give the console, so enforcing the split locally would mean a 404 on
 * `/admin` on the one machine the tools are actually built on. Only
 * outside production, so that the exemption cannot be reached by sending
 * `Host: localhost` to the deployment — and on Vercel it could not be
 * anyway, because a host that is not an attached domain never routes to
 * this application.
 */
export function isDevelopmentHost(host: string | null): boolean {
  if (!host) return false;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  );
}

export type HostVerdict =
  /** This host is allowed to answer this path. */
  | { kind: "serve" }
  /** An internal path asked for on the public storefront. */
  | { kind: "not_found" }
  /** A storefront path asked for on the admin host. */
  | { kind: "belongs_to_app" }
  /** The admin host's own front door: `https://admin.example/`. */
  | { kind: "admin_root" };

/**
 * Whether this host may answer this path.
 *
 * Deliberately a pure function of its inputs, with the environment read
 * by the caller: it is the one piece of this that is worth testing
 * exhaustively, and a function that reads `process.env` itself cannot be.
 *
 * `inProduction` is passed rather than read for the same reason, and is
 * what switches off the localhost exemption above.
 */
export function hostVerdict(input: {
  host: string | null;
  pathname: string;
  adminHost: string | null;
  inProduction: boolean;
}): HostVerdict {
  const { pathname, inProduction } = input;
  const adminHost = normalizeHost(input.adminHost);
  const host = normalizeHost(input.host);

  /* The split is off. One origin, everything on it — the state this
     application shipped in, and the state every local checkout is in. */
  if (!adminHost) return { kind: "serve" };

  if (!inProduction && isDevelopmentHost(host)) return { kind: "serve" };

  if (host === adminHost) {
    /* Typing the admin hostname into a browser means "take me to the
       console", not "show me the storefront" — treating `/` like any
       other storefront path and bouncing it to the shop is technically
       consistent and practically wrong. The caller turns this into
       `/admin`, or into sign-in first when there is no session cookie
       to go on. */
    if (pathname === "/") return { kind: "admin_root" };

    return isAdminPath(pathname) || isAdminHostExtra(pathname)
      ? { kind: "serve" }
      : { kind: "belongs_to_app" };
  }

  /* The storefront, or anything else pointed at this deployment. A host
     this does not recognise is treated as the storefront rather than as
     the console: unknown must mean less access, never more. */
  return isAdminPath(pathname) ? { kind: "not_found" } : { kind: "serve" };
}

/**
 * A link into the console from a page served by the storefront.
 *
 * Relative while the split is off, and absolute once it is on — a
 * relative `/admin` on `quoin.co.in` now leads to a 404 by design, so
 * the one card that links across (the account screen's internal-tools
 * card) has to name the other host.
 *
 * Relative in development too, whatever `ADMIN_HOST` says, matching the
 * exemption in `hostVerdict`: a local link that jumps to the production
 * console is worse than no link, because it looks like it worked.
 */
export function adminUrl(path = "/admin"): string {
  const adminHost = configuredAdminHost();
  if (!adminHost) return path;
  if (process.env.NODE_ENV !== "production") return path;
  return `https://${adminHost}${path}`;
}
