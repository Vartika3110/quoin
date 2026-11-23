/**
 * Telling the server that a page broke in front of someone.
 *
 * Called from the error boundaries, which are the only place that knows
 * a render failed: a Server Component that threw, a client component
 * that threw on hydration, or a root layout that could not be built at
 * all. None of those reaches `handler()` in `http.ts`, so none of them
 * raised an alert before this existed — the customer saw "Something went
 * wrong" and nobody else saw anything.
 *
 * Sends the **digest only**, never the message. In production Next
 * replaces the message with that hash precisely so it can be shown and
 * logged without leaking what the page was holding, and the same hash
 * appears in the server log, which makes it the one field worth sending.
 *
 * `sendBeacon` first: a customer whose page just broke very often closes
 * the tab or hits back within the second, and a normal `fetch` is
 * cancelled when they do — losing exactly the reports that matter most.
 * `keepalive` on the fallback does the same job where `sendBeacon` is
 * missing or refuses the payload.
 *
 * Every failure is swallowed. A reporter that can throw inside an error
 * boundary turns one broken page into a blank one.
 */
export function reportRenderError(
  boundary: "app" | "global",
  error: { digest?: string } | undefined,
): void {
  try {
    if (typeof window === "undefined") return;

    const body = JSON.stringify({
      boundary,
      digest: error?.digest,
      /* The path without the query: the reporter strips it again server
         side, and sending less is better than trusting either end. */
      path: window.location.pathname,
    });

    const url = "/api/v1/render-error";

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      if (sent) return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Nothing here is worth a second failure on a page that has already
       failed once. */
  }
}
