"use client";

import { useEffect } from "react";
import { pushRecentlyViewed } from "@/lib/store/recently-viewed";
import type { Product } from "@/lib/types/catalog";

/**
 * Records that this product was looked at.
 *
 * Renders nothing. It exists because the product page is a server
 * component and writing to `localStorage` needs a client one — mounting a
 * null-returning component beside the page is cheaper than converting the
 * whole page, and it keeps the tracking in one obvious place rather than
 * buried in a layout effect somewhere.
 *
 * Keyed on the slug so navigating between two products records both; with
 * an empty dependency array React would reuse the mounted instance and
 * only the first would be recorded.
 */
export function RecordView({ product }: { product: Product }) {
  useEffect(() => {
    pushRecentlyViewed(product);
  }, [product]);

  return null;
}
