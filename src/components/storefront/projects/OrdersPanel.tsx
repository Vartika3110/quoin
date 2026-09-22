"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/ErrorState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ArrowRight, Package, Truck } from "@/components/icons";
import { track } from "@/lib/analytics";
import { formatPrice } from "@/lib/types/catalog";
import { useProjects, type Project, type ProjectOrder } from "@/lib/store/projects";
import type { OrderStatusTone } from "@/lib/data/order-history";

/**
 * The Orders tab.
 *
 * `ORDER_STATUS_LABEL`/`ORDER_STATUS_TONE` are not imported here directly —
 * that module also imports `@/lib/db`, and a value import from a "use
 * client" file would drag Prisma into the browser bundle. The project page
 * (a Server Component) reads them once and passes the two Records down as
 * plain, JSON-serialisable props — the same boundary `ProjectPage` already
 * draws around `listFeed` for the mood board.
 */
export function OrdersPanel({
  project,
  orderStatusLabel,
  orderStatusTone,
}: {
  project: Project;
  orderStatusLabel: Record<OrderStatus, string>;
  orderStatusTone: Record<OrderStatus, OrderStatusTone>;
}) {
  const { linkOrder, unlinkOrder } = useProjects();
  const [unlinkTarget, setUnlinkTarget] = useState<ProjectOrder | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  async function handleUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    setUnlinkError(null);
    try {
      await unlinkOrder(project.id, unlinkTarget.reference);
      setUnlinkTarget(null);
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : "Could not unlink that order. Please try again.");
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="space-y-4">
      {project.orders.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" />}
          title="No orders filed here yet"
          action={{ href: "/products", label: "Browse Products" }}
        >
          Orders you place and file under this project collect here, with
          the total and the delivery date each one actually has.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {project.orders.map((order) => (
            <li key={order.reference}>
              <OrderCard
                order={order}
                label={orderStatusLabel[order.status]}
                tone={orderStatusTone[order.status]}
                onUnlink={() => {
                  setUnlinkError(null);
                  setUnlinkTarget(order);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <LinkOrderCard
        projectId={project.id}
        linkedReferences={project.orders.map((o) => o.reference)}
        onLink={linkOrder}
      />

      <Modal
        open={unlinkTarget != null}
        onClose={() => {
          if (!unlinking) setUnlinkTarget(null);
        }}
        title={unlinkTarget ? `Unlink ${unlinkTarget.reference}?` : "Unlink order"}
        description={
          unlinkTarget
            ? "It stops counting toward this project's budget and lists. The order itself is untouched."
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUnlinkTarget(null)} disabled={unlinking}>
              Keep it
            </Button>
            <Button variant="danger" onClick={handleUnlink} loading={unlinking}>
              Unlink
            </Button>
          </div>
        }
      >
        {unlinkError && <InlineError>{unlinkError}</InlineError>}
      </Modal>
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatCalendarDay(day: string): string {
  return DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

function OrderCard({
  order,
  label,
  tone,
  onUnlink,
}: {
  order: ProjectOrder;
  label: string;
  tone: OrderStatusTone;
  onUnlink: () => void;
}) {
  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/account/orders/${order.reference}`}
              className="font-mono text-body-sm font-semibold text-ink hover:text-accent"
            >
              {order.reference}
            </Link>
            <Badge tone={tone} size="sm">
              {label}
            </Badge>
          </div>
          <p className="nums mt-1 text-caption text-muted">
            {DATE_FORMAT.format(new Date(order.createdAt))} · {order.itemCount}{" "}
            {order.itemCount === 1 ? "item" : "items"}
          </p>
        </div>
        <span className="nums shrink-0 text-body-sm font-semibold text-ink">
          {formatPrice(order.totalPaise)}
        </span>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-caption text-muted">
        <Truck className="size-3.5 shrink-0" />
        {order.expectedDeliveryOn
          ? `Expected ${formatCalendarDay(order.expectedDeliveryOn)}`
          : "Date confirmed on call"}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line-hair pt-3">
        <Link
          href={`/account/orders/${order.reference}`}
          className="flex items-center gap-1 text-caption font-medium text-accent"
        >
          View order
          <ArrowRight className="size-3.5" />
        </Link>
        <Button variant="ghost" size="sm" onClick={onUnlink}>
          Unlink
        </Button>
      </div>
    </Card>
  );
}

interface LinkableOrder {
  reference: string;
  status: string;
  totalPaise: number;
  createdAt: string;
}

function LinkOrderCard({
  projectId,
  linkedReferences,
  onLink,
}: {
  projectId: string;
  linkedReferences: string[];
  onLink: (id: string, reference: string) => Promise<void>;
}) {
  const [orders, setOrders] = useState<LinkableOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/orders?pageSize=50");
        const body = (await res.json().catch(() => null)) as {
          data?: { items: LinkableOrder[] };
          error?: { message?: string };
        } | null;
        if (!res.ok) throw new Error(body?.error?.message ?? "Could not load your orders.");
        if (!ignore) setOrders(body?.data?.items ?? []);
      } catch (err) {
        if (!ignore) {
          setLoadError(err instanceof Error ? err.message : "Could not load your orders.");
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const linkable = (orders ?? []).filter((o) => !linkedReferences.includes(o.reference));

  async function handleLink() {
    if (!choice) return;
    setBusy(true);
    setLinkError(null);
    try {
      await onLink(projectId, choice);
      track("order_added_to_project", { reference: choice });
      setChoice("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not link that order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg">
      <h2 className="font-display text-title-sm font-semibold text-ink">Link an existing order</h2>
      <p className="mt-1 text-caption text-muted">
        Already placed it? File it under this project so it counts toward the budget.
      </p>

      {loadError ? (
        <div className="mt-3">
          <InlineError>{loadError}</InlineError>
        </div>
      ) : orders === null ? (
        <div className="mt-3">
          <ListSkeleton rows={1} />
        </div>
      ) : linkable.length === 0 ? (
        <p className="mt-3 text-body-sm text-muted">
          {orders.length === 0
            ? "You have no orders yet."
            : "Every order on your account is already linked here."}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            aria-label="Order"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={busy}
            className="max-w-xs"
          >
            <option value="" disabled>
              Choose an order
            </option>
            {linkable.map((o) => (
              <option key={o.reference} value={o.reference}>
                {o.reference} · {formatPrice(o.totalPaise)}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={handleLink} loading={busy} disabled={!choice || busy}>
            Link order
          </Button>
        </div>
      )}
      {linkError && (
        <div className="mt-2">
          <InlineError>{linkError}</InlineError>
        </div>
      )}
    </Card>
  );
}
