import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { WishlistGrid } from "@/components/storefront/account/WishlistGrid";

export const metadata: Metadata = { title: "Saved products — Quoin" };

export default function WishlistPage() {
  return (
    <AccountShell
      current="/account/wishlist"
      title="Saved products"
      subtitle="Everything you have shortlisted, with today's price."
    >
      <WishlistGrid />
    </AccountShell>
  );
}
