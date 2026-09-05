import Link from "next/link";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { People, Crown, Search } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { db } from "@/lib/db";
import { resolveAdminPage } from "@/lib/data/admin-metrics";
import { formatPrice } from "@/lib/types/catalog";
import { maskPhone } from "@/lib/auth/phone";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers — Quoin",
  robots: { index: false, follow: false },
};

/**
 * The customer list.
 *
 * Phones are masked here even though this is a staff-only screen — see
 * `maskPhone` (`src/lib/auth/phone.ts`). A list is scanned, not acted on;
 * the number staff actually need to dial back a customer lives one click
 * away on the detail page, where it is shown in full. Masking the row a
 * screen is more likely to be glanced at over someone's shoulder costs
 * nothing here and the detail page still has what a callback needs.
 *
 * "Total spent" is a second query (`groupBy` on `Order.userId`), not a
 * nested `orders: { where: { status: "PAID" } }` include on the page's own
 * `findMany`: that would ship every matching `Order` row's full column set
 * to the application only to `reduce` it in JS, once per customer on the
 * page. A `groupBy` scoped to this page's own ids does the sum in
 * Postgres and returns one row per customer.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const q = one(sp.q)?.trim() || "";
  const { page, pageSize, skip } = resolveAdminPage(Number(one(sp.page)) || undefined);

  const where: Prisma.UserWhereInput = {
    isStaff: false,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        phone: true,
        tier: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
  ]);

  const spendByUser = rows.length
    ? await db.order.groupBy({
        by: ["userId"],
        where: { userId: { in: rows.map((r) => r.id) }, status: "PAID" },
        _sum: { totalPaise: true },
      })
    : [];
  const spendMap = new Map(spendByUser.map((s) => [s.userId, s._sum.totalPaise ?? 0]));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const qParam = q ? `q=${encodeURIComponent(q)}&` : "";

  return (
    <AdminShell
      current="/admin/customers"
      title="Customers"
      subtitle={`${total} customer${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}.`}
    >
      <form method="get" className="max-w-sm">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or phone"
          aria-label="Search customers"
          leading={<Search className="size-4" />}
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<People className="size-6" />}
          title={q ? "No customer matches that search." : "No customers yet."}
          className="mt-6"
        >
          {q && (
            <Link href="/admin/customers" className="text-accent">
              Clear the search
            </Link>
          )}
        </EmptyState>
      ) : (
        <Card className="mt-6 overflow-hidden" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Total spent</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line-hair last:border-0 hover:bg-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${row.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {row.name ?? "Unnamed"}
                      </Link>
                      <p className="nums mt-0.5 text-caption text-muted">
                        {maskPhone(row.phone)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {row.tier === "PRO" ? (
                        <Badge tone="pro" icon={<Crown className="size-3" />}>
                          Pro
                        </Badge>
                      ) : (
                        <Badge>Standard</Badge>
                      )}
                    </td>
                    <td className="nums px-4 py-3 text-right">{row._count.orders}</td>
                    <td className="nums px-4 py-3 text-right font-medium text-ink">
                      {formatPrice(spendMap.get(row.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button href={`/admin/customers?${qParam}page=${page - 1}`} variant="outline" size="sm">
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="nums text-caption text-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button href={`/admin/customers?${qParam}page=${page + 1}`} variant="outline" size="sm">
              Next
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </nav>
      )}
    </AdminShell>
  );
}
