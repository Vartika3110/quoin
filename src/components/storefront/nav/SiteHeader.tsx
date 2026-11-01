"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LocationPicker } from "@/components/storefront/LocationPicker";
import { ThemeToggle } from "@/components/storefront/ThemeToggle";
import { CartDrawer } from "@/components/storefront/nav/CartDrawer";
import { useSearch } from "@/components/storefront/nav/SearchContext";
import { speechIsAvailable } from "@/components/storefront/ai/AiSearchSheet";
import { useScrolled } from "@/components/storefront/nav/useScrolled";
import { Counter } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import {
  Camera,
  Cart,
  Chevron,
  ChevronDown,
  Headset,
  Heart,
  Mic,
  Search,
  User,
} from "@/components/icons";
import { useCart } from "@/lib/store/cart";
import { useHydrated } from "@/lib/store/hydrated";
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
  phoneBar = true,
  phoneSearch = true,
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
  /** `false` hides the phone search row — see `AppShell`'s `phoneSearch`. */
  phoneSearch?: boolean;
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
          <MobileBar slot={mobileSlot} showSearch={phoneSearch} />
        )}
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

        {/* The desktop's "18 min" pill went with the phone's headline
            above it. Same claim, same reason — a number that is wrong is
            not made right by a wider screen. */}

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
  slot,
  showSearch = true,
}: {
  slot?: ReactNode;
  showSearch?: boolean;
}) {
  return (
    <div className="px-5 lg:hidden">
      {/* **The utility row is gone**, at the owner's instruction: the
          area picker, the theme toggle, saved, the basket and the
          account avatar all came off this bar together, and the phone
          header is now the search field and Consult.

          What that costs, recorded because it is not obvious from here:

          - `/account` and `/account/wishlist` have no entry point on a
            phone at all. The avatar was the last one — the Account tab
            came off `MobileTabBar` in the same pass, on the reasoning
            that the header still carried it. It no longer does.
          - The basket opens only from the floating cart bar, which
            draws itself when there is something in it. An empty cart
            cannot be opened, which is mostly fine and is a change.
          - The service area cannot be changed on a phone. The cookie
            still decides what the catalogue says about delivery; there
            is simply no control for it here any more.
          - Dark mode cannot be turned on from a phone. The preference
            still follows the system and still persists.

          Each of these is one line to put back. */}

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

              **The Consult card is back beside it**, at the owner's
              instruction and as the reference draws it. It was cut on
              the argument that `ConsultBubble` already floats over every
              phone page, so the header was offering the same destination
              twice on one screen and paying 120px of the search field's
              measure for it. That argument was right about the
              duplication and wrong about which one carries the offer: a
              floating headset says "help", and this says what the help
              is. */}
          {showSearch && (
            <div className="flex items-stretch gap-2 pb-1.5 pt-2">
              <MobileSearchField className="min-w-0 flex-1" />
              <ConsultCard />
            </div>
          )}

          {/* Negative margin because the slot's own content is a rail
              that has to bleed through this container's gutter. */}
          {slot && <div className="-mx-5 pb-2">{slot}</div>}
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
 * ## Both controls now do what they look like
 *
 * The camera used to link to Upload Parcha, on the honest argument that
 * an image search did not exist and the gesture was close enough —
 * photograph the thing, get prices. It exists now: the camera opens
 * `AiSearchSheet`, which reads the photograph and answers with the
 * catalogue rows Quoin actually stocks like it. Parcha did not lose its
 * door; it has a tab of its own in `MobileTabBar`, which is where the
 * people using it were already finding it.
 *
 * The microphone used to be dictation — a transcript pasted into `?q=`,
 * which works for "Jaquar shower head" and fails for every sentence a
 * person actually says out loud. It opens the assistant instead, which
 * interprets the sentence and looks for the products *and* the trades.
 */
/**
 * Consult, beside the search field.
 *
 * Two lines rather than one, as the reference draws it: the label says
 * what the thing is and the line under it says what happens, which is
 * the difference between a button somebody presses and a button
 * somebody wonders about. Fixed-width and `shrink-0` so it cannot eat
 * the search field's measure as the screen narrows — below 340px the
 * field is the one that must survive.
 */
function ConsultCard() {
  return (
    <Link
      href="/consult"
      /* Trimmed to the pixel the reference leaves it: the search field
         beside it has to hold `Search for "Flooring"` without
         truncating, and at a 134px card it did not. */
      className="flex h-13 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface pl-1.5 pr-3 transition-colors hover:border-accent-edge"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
        <Headset className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-micro font-bold uppercase tracking-wide text-ink">
          Consult
        </span>
        <span className="block text-[0.5625rem] text-muted">Talk to experts</span>
      </span>
    </Link>
  );
}

function MobileSearchField({ className }: { className?: string }) {
  const { open, openAi } = useSearch();

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
        {/* Shorter by two words than it was. The Consult card beside
            this field takes 117px of a 375px screen, and at the width
            that leaves, "Search for "Flooring"" truncated mid-word —
            which reads as a broken field rather than as a hint. */}
        <span className="min-w-0 flex-1 truncate text-caption text-faint">
          Search &ldquo;Flooring&rdquo;
        </span>
      </button>

      <button
        type="button"
        onClick={() => openAi("photo")}
        aria-label="Search by photo"
        className="tap-target relative grid size-7 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-hover"
      >
        <Camera className="size-5" />
      </button>

      {/* Renders nothing where the Web Speech API is absent, so the field
          closes up around it rather than showing a dead button — the
          whole assistant is built on in-browser transcription, so there
          is nothing to offer Firefox here. */}
      <AssistantButton onOpen={() => openAi("voice")} />
    </div>
  );
}

/**
 * The microphone, present only where speech recognition exists.
 *
 * Feature detection is a pure read of `window`, so it can happen during
 * render — but only once the client has taken over. The server render and
 * the hydrating one both say "unsupported", which is also the right
 * answer for Firefox, so nothing flashes and nothing mismatches. Exactly
 * the rule `VoiceSearch` documents, and the reason this is five lines
 * rather than a `useEffect`.
 */
function AssistantButton({ onOpen }: { onOpen: () => void }) {
  const hydrated = useHydrated();
  if (!hydrated || !speechIsAvailable()) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Ask Quoin by voice"
      className="tap-target relative grid size-7 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-hover"
    >
      <Mic className="size-5" />
    </button>
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
