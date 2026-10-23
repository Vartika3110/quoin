import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ProductCard } from "@/components/storefront/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHead } from "@/components/ui/Section";
import { Lamp } from "@/components/icons";
import { listDecorativeLighting } from "@/lib/data/lighting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lighting — Quoin",
  description:
    "Decorative interior lighting: chandeliers and jhoomar, pendant and hanging lights, lamps, wall lights and cove lighting.",
};

/**
 * Decorative lighting, pulled out of the electricals department.
 *
 * `electricals-lighting` is one department holding two unrelated
 * shopping trips — four hundred modular switches and a handful of light
 * fittings — and this page is the second one. `listDecorativeLighting`
 * carries the full reasoning, including what a name-based filter costs
 * on a catalogue with no attribute table.
 *
 * Shelves rather than one grid, because choosing a jhoomar and choosing a
 * cove strip are not the same decision and a reader scanning for one does
 * not want the other interleaved. The shelf order is the order these are
 * shopped: the statement pieces first.
 *
 * A customer who cannot find the fitting they are holding needs a way
 * through to everything, because this page is a filter over product names
 * and not a complete catalogue of lighting. That is the "All electricals"
 * link in the heading — which is where it now lives alone: the bordered
 * paragraph that used to explain it under the heading is gone at the
 * owner's instruction.
 */
export default async function LightingPage() {
  const groups = await listDecorativeLighting(18);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <SectionHead
          title="Lighting"
          subtitle="Chandeliers and jhoomar, hanging lights, lamps and wall lights — the fittings that decide how a room feels after dark."
          href="/c/electricals-lighting"
          linkLabel="All electricals"
        />

        {total === 0 ? (
          <div className="px-5 lg:px-0">
            <EmptyState
              icon={<Lamp className="size-6" />}
              title="No decorative lighting in stock yet"
              action={{ href: "/c/electricals-lighting", label: "Browse electricals" }}
              secondaryAction={{ href: "/consult", label: "Ask an expert" }}
            >
              Quoin stocks electricals and wiring, but no decorative fittings are sellable
              right now. An expert can source one — chandeliers are usually made to order.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="space-y-10">
              {groups.map((group) => (
                <section key={group.title}>
                  <SectionHead title={group.title} size="sm" level={3} />
                  {/* A rail on a phone and a grid above it, the same shape
                      every other departmental shelf on this site uses. */}
                  <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0 xl:grid-cols-5">
                    {group.items.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
