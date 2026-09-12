import Link from "next/link";
import { TAB_ICONS } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * The six-icon rail under the search bar.
 *
 * Links, not a client-side filter. An earlier version of this was a
 * `useState` tab strip over fixture data, which meant six controls that
 * changed nothing below them and six states nobody could bookmark or
 * share. Every entry here is a real destination in the catalogue.
 *
 * "All" is marked current because that is what the home page is — the
 * whole catalogue, unfiltered. It still links to `/categories`, so the
 * current tab is a way *out* rather than a dead control.
 */
const TABS = [
  { href: "/categories", label: "All", icon: "grid", current: true },
  { href: "/services", label: "Services", icon: "helmet" },
  { href: "/products", label: "Materials", icon: "bricks" },
  { href: "/pro", label: "Premium Products", icon: "crown" },
  { href: "/studio", label: "Interiors", icon: "sofa" },
  { href: "/c/electricals-lighting", label: "Lighting", icon: "lamp" },
] as const;

export function CatalogTabs() {
  return (
    <nav
      aria-label="Browse Quoin"
      className="rail items-start gap-5 px-5 scroll-pl-5"
    >
      {TABS.map(({ href, label, icon, ...rest }) => {
        const Icon = TAB_ICONS[icon];
        const on = "current" in rest && rest.current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className="flex w-[3.75rem] flex-col items-center gap-1.5"
          >
            <Icon className={cn("size-7", on ? "text-accent" : "text-ink")} />
            {/* Two lines of headroom for "Premium Products"; the rest sit
                on one and the rail stays a single height either way. */}
            <span
              className={cn(
                "text-center text-micro leading-tight",
                on ? "font-semibold text-accent" : "text-muted",
              )}
            >
              {label}
            </span>
            {/* Always present, transparent when off — an underline that
                appears only on the active tab shifts the whole rail by
                two pixels when it moves. */}
            <span
              className={cn(
                "h-0.5 w-8 rounded-full transition-colors",
                on ? "bg-accent" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
