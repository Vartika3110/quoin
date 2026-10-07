import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { WishlistGrid } from "@/components/storefront/account/WishlistGrid";

export const metadata: Metadata = { title: "Your wishlist — Quoin" };

export default function WishlistPage() {
  return (
    <AccountShell
      current="/account/wishlist"
      /* "Your wishlist", not "Saved products". The control that fills
         this page is a heart, in the header and on every tile, and a
         heart means wishlist everywhere a customer has met one. The page
         it leads to should use the reader's word rather than the
         database's. */
      title="Your wishlist"
      subtitle="Everything you have hearted, with today's price."
    >
      <WishlistGrid />
    </AccountShell>
  );
}
