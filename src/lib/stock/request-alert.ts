/**
 * The browser side of "Notify me", shared by the cart and saved products
 * so both ask, and read the answer, the same way.
 */

export type StockAlertOutcome =
  | { kind: "saved" }
  | { kind: "signin" }
  | { kind: "error"; message: string };

const FALLBACK = "We could not save that. Try again.";

export async function postStockAlert(
  productSlug: string,
  variantId: string,
): Promise<StockAlertOutcome> {
  try {
    const res = await fetch("/api/v1/stock-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productSlug, variantId }),
    });
    if (res.status === 401) return { kind: "signin" };
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      return { kind: "error", message: body?.error?.message ?? FALLBACK };
    }
    return { kind: "saved" };
  } catch {
    return { kind: "error", message: FALLBACK };
  }
}

/** Variants the viewer already has an open request for. Empty when signed
    out or on any failure — the button simply shows as not yet pressed. */
export async function fetchOpenAlertVariantIds(): Promise<string[]> {
  try {
    const res = await fetch("/api/v1/stock-alerts");
    if (!res.ok) return [];
    const body = (await res.json()) as { data: { variantIds: string[] } };
    return body.data.variantIds;
  } catch {
    return [];
  }
}
