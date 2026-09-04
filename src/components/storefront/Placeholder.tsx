import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";

/**
 * A destination that is linked but not built.
 *
 * The storefront's navigation is designed around places that do not all
 * exist yet. Leaving those links to 404 tells a customer the app is
 * broken; saying what the page will be tells them it is unfinished, which
 * is true and much less alarming. Every one of these is a page to delete,
 * not a page to keep.
 *
 * Distinct from `EmptyState`, which means "nothing here yet" about data
 * the customer controls. These two look similar and mean opposite things.
 */
export function Placeholder({
  title,
  children,
  cta,
}: {
  title: string;
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: title }]} />
        </div>

        <SectionHead level={1} size="lg" title={title} />

        <div className="px-5 lg:px-0">
          <EmptyState title="Not built yet" action={cta}>
            {children}
          </EmptyState>
        </div>
      </div>
    </AppShell>
  );
}
