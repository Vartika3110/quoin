import Link from "next/link";
import { cookies } from "next/headers";
import { LocationPicker } from "@/components/storefront/LocationPicker";
import {
  DesktopNavList,
  MobileBottomNav,
} from "@/components/storefront/NavLinks";
import {
  AREA_COOKIE,
  getAreaChoice,
  listAreaChoices,
  type AreaChoice,
} from "@/lib/data/service-areas";
import {
  Cart,
  Chevron,
  Clock,
  Mic,
  Search,
  User,
  Wallet,
} from "@/components/icons";

/**
 * The storefront chrome.
 *
 * Two genuinely different layouts, not one stretched:
 *  - under `lg` the reference app shell (stacked header, fixed bottom nav)
 *  - at `lg` and up a persistent top bar plus a left category rail, with
 *    the bottom nav gone entirely — a fixed 5-item tab bar on a 1440px
 *    monitor reads as a phone app in a window.
 * Both are always in the DOM and toggled with CSS so the server renders
 * one markup tree and there is no layout flash on hydration.
 */

const CART_COUNT = 8;

export async function AppShell({ children }: { children: React.ReactNode }) {
  /* Read on the server so the first paint already shows the right area.
     Doing this on the client would render a default for everyone and
     correct it after hydration. */
  const [areas, chosen] = await Promise.all([
    listAreaChoices(),
    cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
  ]);

  return (
    <div className="min-h-screen bg-bg">
      <MobileHeader areas={areas} chosen={chosen} />
      <DesktopTopBar areas={areas} chosen={chosen} />

      <div className="lg:mx-auto lg:flex lg:max-w-[1400px] lg:gap-8 lg:px-6">
        <DesktopSidebar />
        {/* Bottom padding clears the fixed mobile nav; removed at lg. */}
        {/* `lg:min-w-0`: as a flex item this defaults to min-width auto,
            which sizes it to its widest content and lets a horizontal rail
            push the whole page sideways instead of scrolling inside its
            own box. */}
        <main className="pb-28 lg:min-w-0 lg:flex-1 lg:pb-16 lg:pt-6">{children}</main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/* ---------------------------------------------------------------- mobile */

function MobileHeader({ areas, chosen }: { areas: AreaChoice[]; chosen: AreaChoice | null }) {
  return (
    <header className="lg:hidden">
      <div className="px-5 pt-4">
        <p className="font-display text-3xl tracking-[0.18em] text-ink">QUOIN</p>

        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* Kept on one line down to 360px — the chip qualifies the
                promise, so wrapping it away from "18 minutes" reads as an
                unrelated badge. Below that it has to wrap: on a 320px
                phone the chip and the wallet button overlap otherwise. */}
            <div className="flex flex-wrap items-center gap-2 max-[359px]:gap-y-1.5 min-[360px]:flex-nowrap">
              <span className="text-[26px] font-semibold leading-none text-ink max-[380px]:text-[22px]">
                {chosen?.etaMinutes ? `${chosen.etaMinutes} minutes` : "Pick your area"}
              </span>
              {chosen?.storeName && (
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-surface px-2 py-1 text-[10px] text-muted">
                  <Clock className="size-3" />
                  {chosen.storeName}
                </span>
              )}
            </div>
            {/* Honest scoping of the promise — marble and site visits do
                not arrive in 18 minutes, and the header must not imply it. */}
            <p className="mt-1 text-[11px] text-faint">
              {chosen
                ? "on in-stock items near you"
                : "to see delivery times where you are"}
            </p>

            <LocationPicker areas={areas} selected={chosen} className="mt-2" />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button className="flex items-center gap-1.5 rounded-xl border border-accent-edge bg-accent-wash px-2.5 py-1.5 text-[13px] text-accent">
              <Wallet className="size-4" />
              ₹0
            </button>
            <button
              aria-label="Account"
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-ink"
            >
              <User className="size-5" />
            </button>
          </div>
        </div>

        <SearchField className="mt-4" />
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- desktop */

function DesktopTopBar({ areas, chosen }: { areas: AreaChoice[]; chosen: AreaChoice | null }) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line bg-bg/90 backdrop-blur lg:block">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-4">
        <Link href="/" className="font-display text-2xl tracking-[0.18em] text-ink">
          QUOIN
        </Link>

        <div className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2">
          <LocationPicker areas={areas} selected={chosen} />
        </div>

        <SearchField className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          {chosen?.etaMinutes && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
              <Clock className="size-4 text-accent" />
              {chosen.etaMinutes} min
            </span>
          )}
          <button className="flex items-center gap-1.5 rounded-xl border border-accent-edge bg-accent-wash px-3 py-2 text-sm text-accent">
            <Wallet className="size-4" />
            ₹0
          </button>
          <button className="relative flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink hover:bg-hover">
            <Cart className="size-4" />
            Cart
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-semibold text-black">
              {CART_COUNT}
            </span>
          </button>
          <button
            aria-label="Account"
            className="grid size-10 place-items-center rounded-full border border-line text-ink hover:bg-hover"
          >
            <User className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav aria-label="Sections" className="sticky top-24 py-6">
        <DesktopNavList />

        <div className="mt-8 rounded-card border border-accent-edge bg-accent-wash p-4">
          <p className="font-display text-lg text-accent">Quoin Pro</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Trade pricing, priority dispatch and a dedicated project manager.
          </p>
          <button className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-black">
            Join Pro
            <Chevron className="size-3.5" />
          </button>
        </div>
      </nav>
    </aside>
  );
}

/* ----------------------------------------------------------------- parts */

function SearchField({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <label className="sr-only" htmlFor="q">
        Search Quoin
      </label>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 lg:rounded-xl lg:py-2.5">
        <Search className="size-5 shrink-0 text-muted" />
        <input
          id="q"
          type="search"
          placeholder={'Search for "tiles", "lights", "consultation"'}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        <span className="h-5 w-px bg-line" aria-hidden />
        <button aria-label="Search by voice" className="shrink-0 text-muted hover:text-accent">
          <Mic className="size-5" />
        </button>
      </div>
    </div>
  );
}
