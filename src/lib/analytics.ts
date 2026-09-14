/**
 * Product analytics — the event vocabulary, with no provider behind it yet.
 *
 * Events go onto `window.dataLayer` (the queue every tag manager reads) and
 * out as a `quoin:analytics` DOM event, so wiring a provider later is a
 * script tag, not a change at forty call sites. Nothing is sent anywhere by
 * this module.
 *
 * Props are primitives only, and the names below are the whole list. Never
 * pass a phone, email, name, address or free text a customer typed —
 * references, slugs, counts and paise are enough to answer every funnel
 * question these events exist for.
 */

export type AnalyticsEvent =
  | "account_viewed"
  | "order_viewed"
  | "checkout_started"
  | "payment_started"
  | "payment_success"
  | "payment_failed"
  | "project_created"
  | "order_added_to_project"
  | "service_viewed"
  | "service_booking_started"
  | "service_booked"
  | "quote_requested"
  | "document_viewed"
  | "parcha_uploaded";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (typeof window === "undefined") return;
  const payload = { event, ...props };
  try {
    (window.dataLayer ??= []).push(payload);
    window.dispatchEvent(new CustomEvent("quoin:analytics", { detail: payload }));
  } catch {
    // Analytics must never break the page it is measuring.
  }
}
