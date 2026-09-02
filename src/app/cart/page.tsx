import type { Metadata } from "next";
import { Placeholder } from "@/components/storefront/Placeholder";

export const metadata: Metadata = { title: "Cart — Quoin" };

export default function CartPage() {
  return (
    <Placeholder title="Cart" cta={{ href: "/products", label: "Browse the catalogue" }}>
      Checkout is not open yet. When it is, the cart will split by how each
      item is fulfilled — instant, scheduled, made to order and bookable
      cannot travel together, and pretending otherwise makes the delivery
      promise a guess.
    </Placeholder>
  );
}
