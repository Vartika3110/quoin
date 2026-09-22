import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Document } from "@/components/icons";
import { plural } from "@/lib/account/greeting";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";

export function DocumentsCard({ count }: { count: number }) {
  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Document className="size-4.5" />} title="Documents" />

      {count === 0 ? (
        <p className="mt-3 flex-1 text-body-sm leading-relaxed text-muted">
          Your invoices, quotations and project files will appear here.
        </p>
      ) : (
        <>
          <p className="nums mt-3 text-title-sm font-semibold text-ink">
            {count} {plural(count, "Document", "Documents")}
          </p>
          <p className="mt-1 flex-1 text-caption text-muted">
            Invoices, quotations, project documents and parcha files
          </p>
        </>
      )}

      <Button href="/account/documents" variant="outline" size="sm" className="mt-4 self-start">
        View Documents
      </Button>
    </Card>
  );
}
