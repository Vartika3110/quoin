import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { OrderList } from "@/components/storefront/account/OrderList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Package } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { one } from "@/lib/search-params";
import {
  getOrderForUser,
  listOrdersForUser,
  type OrderDetail,
} from "@/lib/data/order-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders — Quoin" };

/**
 * Orders.
 *
 * `Order` has existed since payments landed (see
 * docs/production-audit.md) — this page used to say otherwise and now
 * reads the real table instead.
 *
 * The list query (`listOrdersForUser`) gives the reference, status and a
 * couple of line titles for each row on this page; the full breakdown for
 * every row on the page is then read with `getOrderForUser`, the same
 * function `GET /api/v1/orders/{reference}` calls. That is more reads than
 * the summary alone would need, but it means every row's detail is on the
 * page already — the expand/collapse below is a plain `<details>`, so it
 * costs no round trip and works with JavaScript off, matching the rest of
 * this design system (see `Accordion`, `docs/design-system.md`).
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  const page = Number(one((await searchParams).page)) || 1;

  const summary = session ? await listOrdersForUser(session.userId, page) : null;

  const orders = summary
    ? (
        await Promise.all(
          summary.items.map((item) => getOrderForUser(session!.userId, item.reference)),
        )
      ).filter((order): order is OrderDetail => order !== null)
    : [];

  return (
    <AccountShell
      current="/account/orders"
      title="Orders"
      subtitle="Everything you have bought, and where each one has got to."
    >
      {!session ? (
        <SignInPrompt what="Signing in keeps every order, booking and invoice against your account." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title="Your orders will appear here"
          action={{ href: "/products", label: "Start shopping" }}
          secondaryAction={{ href: "/cart", label: "View your cart" }}
        >
          Nothing placed yet. Once an order is paid for, it shows up here
          with what was in it and where it stands.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <OrderList orders={orders} />

          {summary!.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 pt-2">
              {page > 1 ? (
                <Button href={`/account/orders?page=${page - 1}`} variant="outline" size="sm">
                  Previous
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              )}
              <span className="text-caption text-muted">
                Page {page} of {summary!.totalPages}
              </span>
              {page < summary!.totalPages ? (
                <Button href={`/account/orders?page=${page + 1}`} variant="outline" size="sm">
                  Next
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              )}
            </nav>
          )}
        </div>
      )}
    </AccountShell>
  );
}
