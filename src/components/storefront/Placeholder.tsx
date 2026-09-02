import Link from "next/link";
import { AppShell } from "@/components/storefront/AppShell";
import { SectionHead } from "@/components/storefront/sections";
import { Chevron } from "@/components/icons";

/**
 * A destination that is linked but not built.
 *
 * The storefront's navigation is designed around places that do not all
 * exist yet. Leaving those links to 404 tells a customer the app is
 * broken; saying what the page will be tells them it is unfinished, which
 * is true and much less alarming. Every one of these is a page to delete,
 * not a page to keep.
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
      <div className="pt-4 lg:pt-0">
        <SectionHead title={title} />
        <div className="mx-5 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center lg:mx-0">
          <p className="text-sm text-ink">Coming soon</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
            {children}
          </p>
          {cta && (
            <Link
              href={cta.href}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-bright"
            >
              {cta.label}
              <Chevron className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
