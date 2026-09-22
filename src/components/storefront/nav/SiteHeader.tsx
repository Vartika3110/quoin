"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LocationPicker } from "@/components/storefront/LocationPicker";
import { ThemeToggle } from "@/components/storefront/ThemeToggle";
import { CartDrawer } from "@/components/storefront/nav/CartDrawer";
import { NotificationBell } from "@/components/storefront/nav/NotificationBell";
import { useSearch } from "@/components/storefront/nav/SearchContext";
import { VoiceSearch } from "@/components/storefront/nav/VoiceSearch";
import { useScrolled } from "@/components/storefront/nav/useScrolled";
import { Counter } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import {
  Camera,
  Cart,
  Chevron,
  ChevronDown,
  Clock,
  Headset,
  Heart,
  Search,
  User,
  Wallet,
} from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useWishlist } from "@/lib/store/wishlist";
import { formatPrice } from "@/lib/types/catalog";
import type { AreaChoice } from "@/lib/data/service-areas";
import type { Category } from "@/lib/types/catalog";

/**
 * The storefront's chrome.
 *
 * Two genuinely different headers, not one stretched. Under `lg` the area
 * and the account controls sit on one row with search, and whatever the
 * page hands to `mobileSlot`, beneath them; from `lg` up it is a single
 * bar with the wordmark and the primary sections inline. Both are always
 * in the DOM and swapped with CSS, so the server renders one tree and
 * nothing flashes at hydration.
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
  { href: "/studio", label: "Studio", hasMenu: false },
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
  mobileSlot,
  signedIn,
  phoneBar = true,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  categories: Category[];
  /**
   * `false` on a page that supplies its own phone chrome — see
   * `AppShell`'s `phoneChrome`. The desktop bar still renders, so the
   * header does not vanish at a width where nothing replaces it.
   */
  phoneBar?: boolean;
  /**
   * Rendered on a phone between the area row and the search row, and
   * collapsed along with search on scroll.
   *
   * The home page's four entry cards belong there in the reference
   * design, and there is no honest way to put them there from the page
   * body — they sit *above* the search field, which is chrome. Passing
   * them in beats the alternative, which is the header sniffing the
   * pathname and reaching for a component only one route owns.
   */
  mobileSlot?: ReactNode;
  /** Whether the bell renders at all — see `AppShell`'s own note on why
      this is read on the server rather than discovered here. */
  signedIn: boolean;
}) {
  const scrolled = useScrolled();
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          /* `safe-top` is what keeps the bar out from under the iOS
             status bar once Quoin is installed — the app paints edge to
             edge under a translucent clock, so the space has to be
             reserved by whatever is at the top of the page. It resolves
             to nothing in a browser tab. */
          "safe-top sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-200 ease-out-quart",
          scrolled
            ? "header-edge bg-bg/85 backdrop-blur-xl"
            : "bg-bg",
        )}
      >
        {phoneBar && (
          <MobileBar
            areas={areas}
            chosen={chosen}
            scrolled={scrolled}
            slot={mobileSlot}
            onOpenCart={() => setCartOpen(true)}
            signedIn={signedIn}
          />
        )}
        <DesktopBar
          areas={areas}
          chosen={chosen}
          categories={categories}
          scrolled={scrolled}
          onOpenCart={() => setCartOpen(true)}
          signedIn={signedIn}
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
  signedIn,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  categories: Category[];
  scrolled: boolean;
  onOpenCart: () => void;
  signedIn: boolean;
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
        {signedIn && <NotificationBell buttonClassName="size-10 rounded-lg border-0" />}
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
  slot,
  onOpenCart,
  signedIn,
}: {
  areas: AreaChoice[];
  chosen: AreaChoice | null;
  scrolled: boolean;
  slot?: ReactNode;
  onOpenCart: () => void;
  signedIn: boolean;
}) {
  const { open } = useSearch();

  return (
    <div className="px-5 lg:hidden">
      {/* The wordmark, the area, and the controls that are about *you*
          rather than about the catalogue: the palette, the basket total
          and the account.

          The wordmark is back. It was dropped on the argument that the
          reference design gives the whole top line to the address and
          that Home has a tab at the bottom — both true, and neither is
          the job a wordmark does. On a phone, with the site's own chrome
          gone on Studio and a bottom bar that looks like an app's, the
          top-left mark is the only thing on screen that says which site
          this is, and it is the control everyone reaches for to get back
          to the front. `shrink-0` so it never compresses; the address
          beside it truncates instead, because a truncated place name is
          still legible and a squeezed wordmark is not.

          16px and 0.1em, not the desktop's 24px and 0.18em: five capitals
          with generous tracking is 80px of a 350px line, and the address
          is what pays for it. Once an area is chosen the label is one
          short word and both fit; "Choose your area" is the unset state
          and the one that truncates. */}
      <div
        className={cn(
          "flex items-center gap-1.5 transition-[padding] duration-200 ease-out-quart",
          scrolled ? "py-2" : "pb-1 pt-3",
        )}
      >
        <Link
          href="/"
          className="font-display shrink-0 text-body-lg tracking-[0.1em] text-ink transition-colors hover:text-accent"
        >
          QUOIN
        </Link>

        <LocationPicker
          areas={areas}
          selected={chosen}
          compact
          className="min-w-0 flex-1"
        />

        {/* Once the search row has collapsed away, search has to still be
            reachable — so it comes back as an icon in the top row rather
            than disappearing until you scroll up. */}
        {scrolled && (
          <button
            type="button"
            onClick={open}
            aria-label="Search Quoin"
            className="tap-target anim-fade relative grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors hover:text-accent"
          >
            <Search className="size-5" />
          </button>
        )}

        {/* 36px of artwork, 44px of target — see `.tap-target`. Three
            circles this size sit in a row a thumb has to hit while
            walking a site, and the visual size is what the design fixes,
            not the reach.

            The glyphs are `text-ink`, not `text-muted`. A 20px line icon
            is thin enough that muted against the cream ground lands near
            3:1, which is under the 4.5:1 these have to clear — and a
            header control that is hard to see is one that gets tapped by
            accident. Hover goes to the accent rather than back to ink,
            so there is still somewhere for the state to move. */}
        <ThemeToggle className="tap-target relative" />
        <CartTotalPill onClick={onOpenCart} />
        {signedIn && <NotificationBell buttonClassName="tap-target relative" />}

        <Link
          href="/account"
          aria-label="Account"
          className="tap-target relative grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors hover:text-accent"
        >
          <User className="size-5" />
        </Link>
      </div>

      {/* Everything below the area row collapses on scroll. `grid-rows`
          rather than `height: auto` so the transition actually animates —
          a height from `auto` does not. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out-quart",
          scrolled ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="overflow-hidden">
          {/* Negative margin because the slot's own content is a rail
              that has to bleed through this container's gutter. */}
          {slot && <div className="-mx-5 pt-2">{slot}</div>}

          <div className="flex items-stretch gap-2 pb-3 pt-3">
            <MobileSearchField className="min-w-0 flex-1" />
            <ConsultCard />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The phone's search field, with the two shortcuts beside it.
 *
 * Not `SearchTrigger`: that is a single button, and a button cannot
 * contain the camera and microphone buttons — nesting interactive
 * elements is invalid, and a screen reader reading "Search products,
 * brands and services, Search by photo, Search by voice, button" is the
 * result. So the field is a *row*: the button owns the part that opens
 * the palette, and the two controls are its siblings inside the same
 * bordered pill.
 *
 * The camera goes to Upload Parcha rather than to an image search Quoin
 * does not have. It is the same gesture — photograph the thing, get
 * prices — pointed at the feature that actually exists.
 */
function MobileSearchField({ className }: { className?: string }) {
  const { open } = useSearch();
  const router = useRouter();

  return (
    <div
      className={cn(
        "flex h-13 items-center rounded-full border border-line bg-surface pl-4 pr-1.5",
        className,
      )}
    >
      {/* `self-stretch`: without it this button is a flex item sized to
          its own 18px of text, so four fifths of a control that looks
          52px tall does nothing when tapped. The field is the target. */}
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left"
      >
        <Search className="size-4.5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-caption text-faint">
          Search for &ldquo;Flooring&rdquo;
        </span>
      </button>

      <Link
        href="/upload"
        aria-label="Search by photo — upload a parcha"
        className="tap-target relative grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <Camera className="size-5" />
      </Link>

      {/* Renders nothing where the Web Speech API is absent, so the
          field closes up around it rather than showing a dead button. */}
      <VoiceSearch
        className="tap-target relative size-7 rounded-full"
        onTranscript={(text) =>
          router.push(`/products?q=${encodeURIComponent(text)}`)
        }
      />
    </div>
  );
}

/** Talk to an expert. A card rather than an icon, because "Consult" is a
    service Quoin sells and not a help button. */
function ConsultCard() {
  return (
    <Link
      href="/consult"
      /* A fixed width rather than shrink-to-fit: the search field beside
         it is what has to keep a readable measure, and a card that sizes
         itself to its own two words takes that decision away from it. */
      className="flex h-13 w-[7.5rem] shrink-0 items-center gap-1.5 rounded-card border border-accent-edge bg-accent-wash px-2.5 transition-colors hover:bg-accent-wash-strong"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-accent">
        <Headset className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-accent">
          Consult
        </span>
        <span className="block whitespace-nowrap text-[9px] text-muted">
          Talk to Experts
        </span>
      </span>
    </Link>
  );
}

/**
 * The basket, as its total.
 *
 * A count tells you how many lines you added; a total tells you whether
 * you can afford the next one, which on a materials order is the question
 * people actually have. It reads ₹0 when the basket is empty rather than
 * hiding — an affordance that appears only once you have used it is one
 * nobody discovers.
 */
function CartTotalPill({ onClick }: { onClick: () => void }) {
  const { count, subtotalPaise, ready } = useCart();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        ready && count > 0
          ? `Cart, ${count} items, ${formatPrice(subtotalPaise)}`
          : "Cart, empty"
      }
      className="tap-target relative flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface pl-2.5 pr-3 text-muted transition-colors hover:text-ink"
    >
      <Wallet className="size-4.5" />
      <span className="nums text-caption font-semibold text-ink">
        {/* `ready` is false until the cart has been read out of storage.
            Rendering the real total before then flashes ₹0 over a basket
            that is not empty. */}
        {ready ? formatPrice(subtotalPaise) : formatPrice(0)}
      </span>
    </button>
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
      className="relative grid size-11 shrink-0 place-items-center rounded-lg text-ink transition-colors hover:bg-hover hover:text-accent"
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
      className="relative grid size-11 shrink-0 place-items-center rounded-lg text-ink transition-colors hover:bg-hover hover:text-accent"
    >
      <Heart className="size-5" />
      {ready && count > 0 && (
        <Counter value={count} key={count} className="anim-pop absolute right-1 top-1" />
      )}
    </Link>
  );
}
