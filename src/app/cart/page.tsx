import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { CartView } from "@/components/storefront/cart/CartView";
import { SectionHead } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Cart — Quoin" };

export default function CartPage() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          level={1}
          size="lg"
          title="Your cart"
          subtitle="Grouped by how each item reaches you — nothing shares a delivery date it cannot keep."
        />

        <div className="px-5 lg:px-0">
          <CartView />
        </div>
      </div>
    </AppShell>
  );
}
