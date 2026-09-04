"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LocationPicker } from "@/components/storefront/LocationPicker";
import { ThemeToggle } from "@/components/storefront/ThemeToggle";
import { CartDrawer } from "@/components/storefront/nav/CartDrawer";
import { useSearch } from "@/components/storefront/nav/SearchContext";
import { useScrolled } from "@/components/storefront/nav/useScrolled";
import { Counter } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import {
  Cart,
  Chevron,
  ChevronDown,
  Clock,
  Heart,
  Search,
  User,
} from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useWishlist } from "@/lib/store/wishlist";
import type { AreaChoice } from "@/lib/data/service-areas";
import type { Category } from "@/lib/types/catalog";

/**
 * The storefront's chrome.
 *
 * Two genuinely different headers, not one stretched. Under `lg` the
 * wordmark, the area and the cart sit on one row with search beneath it;
 * from `lg` up it is a single bar with the primary sections inline. Both
 * are always in the DOM and swapped with CSS, so the server renders one
 * tree and nothing flashes at hydration.
 *
 * The bar compacts on scroll: at the top of the page it is transparent
 * against the page ground with no border, and once there is content
 * underneath it becomes opaque, gains a hairline and loses vertical
 * padding. That transition is the whole reason the header is a client
 * component — everything else here would render on the server.
 */

/** The primary sections, in the order the brief fixes them. */
const NAV = [
  { href: "/categories", label: "Categories", hasMenu: true },
  { href: "/projects", label: "Projects", hasMenu: false },
  { href: "/services", label: "Services", hasMenu: false },
  { href: "/deals", label: "Deals", hasMenu: false },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({
  areas,
  chosen,
  categories,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  categories: Category[];
}) {
  const scrolled = useScrolled();
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-200 ease-out-quart",
          scrolled
            ? "header-edge bg-bg/85 backdrop-blur-xl"
            : "bg-bg",
        )}
      >
        <MobileBar
          areas={areas}
          chosen={chosen}
          scrolled={scrolled}
          onOpenCart={() => setCartOpen(true)}
        />
        <DesktopBar
          areas={areas}
          chosen={chosen}
          categories={categories}
          scrolled={scrolled}
          onOpenCart={() => setCartOpen(true)}
        />
      </header>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

/* --------------------------------------------------------------- desktop */

function DesktopBar({
  areas,
  chosen,
  categories,
  scrolled,
  onOpenCart,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  categories: Category[];
  scrolled: boolean;
  onOpenCart: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "mx-auto hidden max-w-shell items-center gap-6 px-6 transition-[padding] duration-200 ease-out-quart lg:flex",
        scrolled ? "py-2.5" : "py-4",
      )}
    >
      <Link
        href="/"
        className="font-display text-title-lg tracking-[0.18em] text-ink transition-colors hover:text-accent"
      >
        QUOIN
      </Link>

      <nav aria-label="Primary" className="flex items-center gap-0.5">
        {NAV.map((item) =>
          item.hasMenu ? (
            <CategoryMenu
              key={item.href}
              label={item.label}
              href={item.href}
              categories={categories}
              current={isCurrent(pathname, item.href)}
            />
          ) : (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-body font-medium transition-colors",
                isCurrent(pathname, item.href)
                  ? "text-accent"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>

      <SearchTrigger className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        <div className="mr-1 hidden max-w-52 xl:block">
          <LocationPicker areas={areas} selected={chosen} />
        </div>

        {chosen?.etaMinutes != null && (
          <span className="mr-1 hidden items-center gap-1.5 rounded-lg border border-line-soft bg-surface px-2.5 py-1.5 text-micro text-muted xl:inline-flex">
            <Clock className="size-3.5 text-accent" />
            <span className="nums">{chosen.etaMinutes} min</span>
          </span>
        )}

        <WishlistButton />
        <CartButton onClick={onOpenCart} />
        <ThemeToggle className="size-10 border-0" />
        <Link
          href="/account"
          aria-label="Account"
          className="grid size-10 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <User className="size-5" />
        </Link>
      </div>
    </div>
  );
}

/**
 * The categories menu.
 *
 * Opens on click rather than hover. A hover menu over a fourteen-item list
 * is a trap on a trackpad — it opens crossing the row on the way to
 * something else, and it is unreachable by keyboard without extra work.
 * Click is one deliberate action, works identically for a pointer and a
 * key, and the button carries `aria-expanded` so it is announced.
 */
function CategoryMenu({
  label,
  href,
  categories,
  current,
}: {
  label: string;
  href: string;
  categories: Category[];
  current: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-1 rounded-lg px-3 py-2 text-body font-medium transition-colors",
          current || open ? "text-accent" : "text-muted hover:bg-hover hover:text-ink",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="anim-rise absolute left-0 top-full z-50 mt-2 w-[34rem] overflow-hidden rounded-card border border-line-soft bg-surface shadow-lg">
          <ul className="grid grid-cols-2 gap-x-2 p-2">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-hover"
                >
                  <span className="min-w-0 truncate text-body text-ink">
                    {c.title}
                  </span>
                  <span className="nums shrink-0 text-micro text-faint">
                    {c.productCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={href}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 border-t border-line-soft bg-raised py-3 text-caption font-medium text-accent transition-colors hover:bg-hover"
          >
            All categories
            <Chevron className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- mobile */

function MobileBar({
  areas,
  chosen,
  scrolled,
  onOpenCart,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  scrolled: boolean;
  onOpenCart: () => void;
}) {
  const { open } = useSearch();

  return (
    <div className="px-5 lg:hidden">
      <div
        className={cn(
          "flex items-center gap-2 transition-[padding] duration-200 ease-out-quart",
          scrolled ? "py-2.5" : "pb-1 pt-3",
        )}
      >
        <Link
          href="/"
          className="font-display text-title-lg tracking-[0.18em] text-ink"
        >
          QUOIN
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-1">
          <div className="min-w-0 max-w-40">
            <LocationPicker areas={areas} selected={chosen} />
          </div>

          {/* Once the search row has collapsed away, search has to still
              be reachable — so it comes back as an icon in the top row
              rather than disappearing until you scroll up. */}
          {scrolled && (
            <button
              type="button"
              onClick={open}
              aria-label="Search Quoin"
              className="anim-fade grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
            >
              <Search className="size-5" />
            </button>
          )}

          <CartButton onClick={onOpenCart} />
        </div>
      </div>

      {/* The search row collapses on scroll. `grid-rows` rather than
          `height: auto` so the transition actually animates — a height
          from `auto` does not. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out-quart",
          scrolled ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="overflow-hidden">
          <SearchTrigger className="pb-3 pt-2" />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

/**
 * Looks like a search field, behaves like a button.
 *
 * It has to look like a field because that is what people look for, and
 * it has to be a button because typing goes into the palette, not here.
 * Rendering a real `<input>` and hijacking its focus is the version that
 * breaks: mobile keyboards open behind the palette, autofill offers to
 * fill it, and the caret ends up in the wrong element.
 */
function SearchTrigger({ className }: { className?: string }) {
  const { open } = useSearch();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={open}
        className="group flex h-11 w-full items-center gap-3 rounded-lg border border-line bg-surface px-3.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-xs"
      >
        <Search className="size-4.5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-body text-faint">
          Search products, brands and services
        </span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-line-soft bg-raised px-1.5 py-0.5 font-sans text-micro text-muted lg:flex">
          <span className="text-[13px] leading-none">⌘</span>K
        </kbd>
      </button>
    </div>
  );
}

function CartButton({ onClick }: { onClick: () => void }) {
  const { count, ready } = useCart();

  return (
    <button
      type="button"
      onClick={onClick}
      /* The count is part of the label rather than only a badge: a screen
         reader announcing "Cart" alone loses the one thing the badge is
         there to say. */
      aria-label={ready && count > 0 ? `Cart, ${count} items` : "Cart"}
      className="relative grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink lg:size-10"
    >
      <Cart className="size-5" />
      {ready && count > 0 && (
        <Counter
          value={count}
          /* Keyed by the count so the pop replays on every change. */
          key={count}
          className="anim-pop absolute right-1 top-1"
        />
      )}
    </button>
  );
}

function WishlistButton() {
  const { count, ready } = useWishlist();

  return (
    <Link
      href="/account/wishlist"
      aria-label={ready && count > 0 ? `Saved products, ${count} items` : "Saved products"}
      className="relative grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink"
    >
      <Heart className="size-5" />
      {ready && count > 0 && (
        <Counter value={count} key={count} className="anim-pop absolute right-1 top-1" />
      )}
    </Link>
  );
}
