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
          /* **Opaque, not frosted.** This bar used a translucent ground
             with a heavy backdrop blur once scrolled, and on a phone that
             is what reads as the top bar "lagging": the compositor has to
             re-sample and blur everything behind the header on every
             scroll frame, and mobile browsers routinely serve that sample
             a frame late — so the hero bleeding through at 15% visibly
             trailed the page it was meant to sit on. A solid ground costs
             nothing per frame and cannot trail. The `header-edge` shadow
             now does the separating, which is the job the translucency
             was doing badly. */
          "safe-top sticky top-0 z-50 bg-bg transition-[box-shadow] duration-200 ease-out-quart",
          scrolled && "header-edge",
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
      {/* **This row is what scrolls away; search is what stays.** It was
          the other way round once and then neither moved, and both were
          wrong. The promise and the address are read on arrival and then
          never again — they answer "will you come to me", which is a
          question asked once. Search is asked continuously. So the block
          that has done its job folds up, and the toolbar underneath it
          rides to the top of the screen.

          `grid-rows` rather than `height: auto`, because a height
          transition from `auto` does not animate at all. */}
      {/* Unmounted rather than collapsed. A zero-height grid row animates
          nicely and still leaves its children in the layout — they keep
          their geometry, and here the account avatar carried on painting
          over the search field underneath it. A row that is gone should be
          gone; the animation is not worth one control sitting on top of
          another. */}
      {!scrolled && (
        <div>
      <div
        className={cn(
          "flex items-center gap-1.5 transition-[padding] duration-200 ease-out-quart",
          "pb-1 pt-3",
        )}
      >
        {/* The promise first, the place under it — the reference design's
            top line, and the right order: the number is what a customer
            is deciding on, the locality is what qualifies it. Only once
            they have chosen an area, because "20 minutes" with nowhere
            attached is a slogan rather than a fact about them, and the
            picker alone is the right prompt until then.

            The figure is `ServiceArea.etaMinutes`, the operator's own
            number for that locality — not a constant written here. */}
        <div className="min-w-0 flex-1">
          {chosen?.etaMinutes != null && (
            <p className="flex items-baseline gap-1.5 leading-none">
              <span className="text-micro text-muted">Quoin in</span>
              <span className="nums font-display text-title-sm font-semibold text-ink">
                {chosen.etaMinutes} minutes
              </span>
            </p>
          )}

          <LocationPicker
            areas={areas}
            selected={chosen}
            compact
            className={cn("min-w-0", chosen?.etaMinutes != null && "-ml-1 mt-0.5")}
          />
        </div>

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

        {/* Saved, then basket. Two halves of the same habit — the things
            you are considering and the things you have chosen — so they
            sit together rather than one being in the header and the other
            three taps into the account menu. */}
        <Link
          href="/account/wishlist"
          aria-label="Saved products"
          className="tap-target relative grid size-9 shrink-0 place-items-center rounded-full text-ink transition-colors hover:text-accent"
        >
          <Heart className="size-5" />
        </Link>

        <CartPill onClick={onOpenCart} />
        {signedIn && <NotificationBell buttonClassName="tap-target relative" />}

        <Link
          href="/account"
          aria-label="Account"
          className="tap-target relative grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors hover:text-accent"
        >
          <User className="size-5" />
        </Link>
      </div>
        </div>
      )}

      {/* **Nothing collapses on scroll any more.** Search and the four
          doors used to fold away into a zero-height row, leaving only the
          address line pinned — so a reader who scrolled had to scroll back
          to the top to search, and the one control the header exists for
          was the first thing it gave up. The reference design keeps both
          on screen the whole way down, and that is the point of a sticky
          header: it is not a title bar, it is the toolbar.

          The row is affordable now because the doors are marks and labels
          rather than cards — the whole bar is about 150px, against 230
          before. */}
      <div>
        <div>
          {/* Search first, then the doors — the order the reference
              design uses, and the order the row is read in: somebody who
              knows what they want types it, and the cards are for
              somebody who does not.

              **Full width**, because the Consult card that used to sit
              beside it is gone. `ConsultBubble` floats over every phone
              page already, so the header was offering the same
              destination a second time on the same screen, and paying
              120px of the search field's measure for it. */}
          <div className="pb-2 pt-3">
            <MobileSearchField />
          </div>

          {/* Negative margin because the slot's own content is a rail
              that has to bleed through this container's gutter. */}
          {slot && <div className="-mx-5 pb-3">{slot}</div>}
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

/**
 * The basket, as a count.
 *
 * It used to read as a running total, on the argument that a total tells
 * you whether you can afford the next thing. On a catalogue where a
 * single line can be ₹2,90,000 that number gets long, and a six-figure
 * sum sitting in the header of every page reads as a bill being totted up
 * rather than a place to go. A count answers the question the header is
 * actually asked — is there anything in there — and the total is on the
 * cart itself, one tap away, where it is the point rather than an
 * interruption.
 *
 * The badge is absent at zero rather than reading "0": an empty basket
 * has nothing to report, and the icon alone is still the affordance.
 */
function CartPill({ onClick }: { onClick: () => void }) {
  const { count, ready } = useCart();
  /* `ready` is false until the cart has been read out of storage.
     Rendering the count before then flashes a badge onto an empty
     basket, or none onto a full one. */
  const showCount = ready && count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={showCount ? `Cart, ${count} items` : "Cart, empty"}
      className="tap-target relative grid size-9 shrink-0 place-items-center rounded-full text-ink transition-colors hover:text-accent"
    >
      <Cart className="size-5" />
      {showCount && (
        <span className="nums absolute -right-0.5 -top-0.5 grid min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-4 text-on-accent">
          {count > 99 ? "99+" : count}
        </span>
      )}
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
