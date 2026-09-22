import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Headset } from "@/components/icons";
import { requireStaffPage } from "@/lib/auth/staff";
import { one } from "@/lib/search-params";
import {
  SUPPORT_STATUS_LABEL,
  listSupportRequestsForStaff,
  parseSupportStatusFilter,
} from "@/lib/data/support";
import { SupportStatusFilterForm } from "./SupportStatusFilterForm";
import { SupportRequestRow } from "./SupportRequestRow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support — Quoin",
  robots: { index: false, follow: false },
};

/**
 * The support queue, staff only.
 *
 * Same shape as `/admin/orders`: a plain `?status=`/`?page=` filter and a
 * list, each row expanding in place rather than opening a second page —
 * a support message is a paragraph or two, not a document worth its own
 * URL.
 */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireStaffPage();

  const sp = await searchParams;
  const status = parseSupportStatusFilter(one(sp.status));
  const page = Number(one(sp.page)) || undefined;

  const { items, total, totalPages, page: currentPage } = await listSupportRequestsForStaff({
    status,
    page,
  });

  const filterQuery = status ? `status=${status}&` : "";

  return (
    <AdminShell
      current="/admin/support"
      title="Support"
      subtitle={`${total} request${total === 1 ? "" : "s"}${status ? ` — ${SUPPORT_STATUS_LABEL[status]}` : ""}.`}
    >
      <SupportStatusFilterForm status={status} />

      {items.length === 0 ? (
        <EmptyState
          icon={<Headset className="size-6" />}
          title={status ? "No request matches this filter." : "No support requests yet."}
          className="mt-6"
        />
      ) : (
        <div className="mt-6 space-y-2">
          {items.map((request) => (
            <SupportRequestRow key={request.reference} request={request} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3">
          {currentPage > 1 ? (
            <Button href={`/admin/support?${filterQuery}page=${currentPage - 1}`} variant="outline" size="sm">
              Previous
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="nums text-caption text-muted">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Button href={`/admin/support?${filterQuery}page=${currentPage + 1}`} variant="outline" size="sm">
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
