/**
 * The legacy session cookie's name, and nothing else.
 *
 * Its own module because `src/middleware.ts` needs the name and runs on
 * the edge runtime, where importing `src/lib/auth/session.ts` would pull
 * in `@/lib/env` and the Prisma client — the former throws at import
 * without `DATABASE_URL` and `AUTH_SECRET`, neither of which belongs in
 * an edge bundle. A constant with no imports can be read from anywhere.
 *
 * `session.ts` re-exports it, so every existing importer is unaffected
 * and there is still one definition.
 */
export const SESSION_COOKIE = "quoin_session";
