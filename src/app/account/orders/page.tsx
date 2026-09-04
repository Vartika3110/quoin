import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { Package } from "@/components/icons";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders — Quoin" };

/**
 * Orders.
 *
 * There is no `Order` table in the schema — checkout hands the basket to a
 * person today rather than persisting it — so this page has nothing real
 * to list and says so. The alternative, a grid of invented order numbers
 * and delivery dates, would be the single most misleading screen in the
 * app: every other number on this site is real, and one fabricated order
 * history makes all of them suspect.
 */
export default async function OrdersPage() {
  const session = await getSession();

  return (
    <AccountShell
      current="/account/orders"
      title="Orders"
      subtitle="Everything you have bought, and where each shipment has got to."
    >
      {!session ? (
        <SignInPrompt what="Signing in keeps every order, booking and invoice against your account." />
      ) : (
        <EmptyState
          icon={<Package className="size-6" />}
          title="Your orders will appear here"
          action={{ href: "/products", label: "Start shopping" }}
          secondaryAction={{ href: "/cart", label: "View your cart" }}
        >
          Quoin confirms orders with a person while the payments module is
          being built, so nothing is recorded here yet. Once an order is
          placed it will show its own delivery date per shipment.
        </EmptyState>
      )}
    </AccountShell>
  );
}
