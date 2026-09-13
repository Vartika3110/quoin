/**
 * Where to send someone after they verify.
 *
 * Only same-origin paths are honoured. `?next=https://elsewhere` on a
 * sign-in page is an open redirect, and an open redirect on the one screen
 * where people expect to type a credential is a phishing primitive: the
 * link looks like Quoin, the sign-in is real, and the landing is not.
 * Protocol-relative `//host` is rejected for the same reason.
 *
 * Shared between the phone sign-in page and the Google OAuth routes —
 * both hand a customer back to wherever they started, and both would
 * reopen the same open-redirect hole if this lived in only one of them.
 */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}
