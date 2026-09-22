import { Accordion } from "@/components/ui/Accordion";
import { FAQ, SUPPORT_CATEGORIES } from "@/lib/support/faq";
import type { SupportCategorySlug } from "@/lib/data/support";

/**
 * The FAQ itself.
 *
 * With no category chosen this renders all eight groups, each under its
 * own heading — the "contents page" approach `AccountShell` already takes
 * with its own sections, rather than making a visitor pick a tile before
 * they can read anything. A `?category=` narrows it to one group, which is
 * also what a deep link from an order or a booking page lands on.
 */
export function FaqSection({ category }: { category?: SupportCategorySlug }) {
  const groups = category
    ? SUPPORT_CATEGORIES.filter((c) => c.slug === category)
    : SUPPORT_CATEGORIES;

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.slug}>
          <h2 className="font-display text-title-sm font-semibold text-ink">{group.label}</h2>
          <div className="mt-3 space-y-2">
            {FAQ[group.slug].map((entry) => (
              <Accordion key={entry.q} title={entry.q}>
                <p className="text-body-sm leading-relaxed text-muted">{entry.a}</p>
              </Accordion>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
