import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { LinkTabs } from "@/components/storefront/orders/LinkTabs";
import { OrderCard } from "@/components/storefront/orders/OrderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Package } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { one } from "@/lib/search-params";
import { ORDER_TABS, parseOrderTab, type OrderTab } from "@/lib/orders/status-groups";
import { countOrdersByTab, listOrdersForUser, type OrderSummaryPage } from "@/lib/data/order-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders — Quoin" };

/** Every non-"all" tab's compact "nothing here" copy — worded around what
    the tab means rather than one generic sentence repeated five times. */
const EMPTY_TAB_TITLE: Record<Exclude<OrderTab, "all">, string> = {
  processing: "No orders being processed.",
  shipped: "No orders on the way.",
  delivered: "No delivered orders yet.",
  cancelled: "No cancelled orders.",
};

function tabHref(tab: OrderTab, page?: number): string {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/account/orders?${query}` : "/account/orders";
}

/**
 * Orders.
 *
 * The list itself (`listOrdersForUser`) and the tab counts (`countOrdersByTab`)
 * are two separate reads rather than one bloated query, because a customer
 * on the "Delivered" tab still needs to see how many are "Cancelled" for
 * the strip above the list — counting only the visible page would answer
 * a different question than the one the tabs are asking.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) {
    return (
      <AccountShell
        current="/account/orders"
        title="Orders"
        subtitle="Everything you have bought, and where each one has got to."
      >
        <SignInPrompt
          what="Signing in keeps every order, booking and invoice against your account."
          next="/account/orders"
        />
      </AccountShell>
    );
  }

  const sp = await searchParams;
  const tab = parseOrderTab(one(sp.tab));
  const page = Number(one(sp.page)) || 1;

  let summary: OrderSummaryPage;
  let counts: Record<OrderTab, number>;
  try {
    [summary, counts] = await Promise.all([
      listOrdersForUser(session.userId, page, undefined, tab),
      countOrdersByTab(session.userId),
    ]);
  } catch (error) {
    console.error("[account/orders] failed to load orders", error);
    return (
      <AccountShell current="/account/orders" title="Orders">
        <LoadError title="We couldn't load your orders." />
      </AccountShell>
    );
  }

  const hasAnyOrders = counts.all > 0;

  return (
    <AccountShell
      current="/account/orders"
      title="Orders"
      subtitle="Everything you have bought, and where each one has got to."
    >
      <div className="space-y-4">
        {hasAnyOrders && (
          <LinkTabs
            label="Order status"
            items={ORDER_TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))}
            value={tab}
            hrefFor={(id) => tabHref(id)}
          />
        )}

        {!hasAnyOrders ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title="No orders yet."
            action={{ href: "/products", label: "Start Shopping" }}
          >
            Once you place an order, you&rsquo;ll be able to track everything here.
          </EmptyState>
        ) : summary.items.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" />}
            title={EMPTY_TAB_TITLE[tab as Exclude<OrderTab, "all">]}
            action={{ href: tabHref("all"), label: "View all orders" }}
            compact
          />
        ) : (
          <>
            <ul className="space-y-3">
              {summary.items.map((order) => (
                <li key={order.reference}>
                  <OrderCard order={order} />
                </li>
              ))}
            </ul>

            {summary.totalPages > 1 && (
              <nav className="flex items-center justify-center gap-3 pt-2">
                {page > 1 ? (
                  <Button href={tabHref(tab, page - 1)} variant="outline" size="sm">
                    Previous
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                <span className="text-caption text-muted">
                  Page {page} of {summary.totalPages}
                </span>
                {page < summary.totalPages ? (
                  <Button href={tabHref(tab, page + 1)} variant="outline" size="sm">
                    Next
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </AccountShell>
  );
}
