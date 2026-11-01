import { cookies } from "next/headers";
import { SearchProvider } from "@/components/storefront/nav/SearchContext";
import { SiteHeader } from "@/components/storefront/nav/SiteHeader";
import { SiteFooter } from "@/components/storefront/nav/SiteFooter";
import { MobileTabBar } from "@/components/storefront/nav/MobileTabBar";
import { RouteTransition } from "@/components/storefront/RouteTransition";
import { CartBar } from "@/components/storefront/nav/CartBar";
import { getCategories } from "@/lib/data/catalog";
import {
  AREA_COOKIE,
  getAreaChoice,
  listAreaChoices,
} from "@/lib/data/service-areas";

/**
 * The storefront chrome.
 *
 * A single centred column under a sticky bar, at every width — the left
 * category rail that used to sit here is gone. A permanent sidebar spends
 * 224px of every page on a list that is one click away in the header, and
 * it forced the content column into a narrower measure than the product
 * grid wanted. The categories now live in the header's own menu, where
 * they are reachable from a phone too.
 *
 * `fullBleed` exists for the pages whose first element is a photograph
 * that should touch the edges: the page then owns its own gutters. Every
 * other page gets the standard `px-5 lg:px-0` from the section
 * primitives, and the shell supplies the outer padding.
 *
 * `headerSlot` is the one hole in the chrome a page can fill — see below.
 */
export async function AppShell({
  children,
  fullBleed = false,
  showTrustPills = true,
  headerSlot,
  phoneChrome = true,
  phoneSearch = true,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
  /**
   * Off for the home page. It used to state the same four claims under
   * its hero and turned these off rather than saying them twice; that
   * row has since been taken out, so the home page now makes no trust
   * claim at all. Left off deliberately — turning it back on is a one
   * word change here, and a decision about the page, not a fix.
   */
  showTrustPills?: boolean;
  /**
   * `false` hands the whole phone screen to the page.
   *
   * The header's phone bar, the tab bar, the floating cart bar, the
   * consult bubble and the footer all stand down; the desktop bar and
   * footer are untouched, because a takeover is a phone idea — on a
   * 1440px page the site header costs nothing and removing it just
   * strands the reader.
   *
   * Studio is the only caller, and the bar is high: this is for a surface
   * that replaces the app's navigation with its own, not for a page that
   * merely wants more room. Anything else should get its space by having
   * less chrome of its own.
   */
  phoneChrome?: boolean;
  /**
   * `false` on a page that does its own searching.
   *
   * The header's field searches the *catalogue*. On a page whose content
   * is not products — the roster on `/services` — it looks like the
   * page's own search and is not: typing "plumber" there returned
   * bathroom fittings. Rather than teach one field two behaviours, the
   * page turns it off and supplies a field attached to its own list.
   */
  phoneSearch?: boolean;
  /**
   * Extra chrome for the phone header, between the area row and the
   * search field. Only the home page uses it, for the four entry cards
   * that sit above search in the design — the alternative is the header
   * inspecting the pathname, which puts one route's layout inside every
   * route's chrome.
   */
  headerSlot?: React.ReactNode;
}) {
  /* Read on the server so the first paint already shows the right area
     and the right category menu. Doing either on the client renders a
     default for everyone and corrects it after hydration. */
  const [areas, chosen, categories] = await Promise.all([
    listAreaChoices(),
    cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
    getCategories(),
  ]);

  /* Suggested search terms are real category names, taken from the same
     query the menu uses. Nothing here is an invented "popular search". */
  const suggestedTerms = categories.slice(0, 6).map((c) => c.title);

  return (
    <SearchProvider suggestedTerms={suggestedTerms}>
      <div className="flex min-h-screen flex-col bg-bg">
        <SiteHeader
          areas={areas}
          chosen={chosen}
          categories={categories}
          mobileSlot={headerSlot}
          phoneBar={phoneChrome}
          phoneSearch={phoneSearch}
        />

        {/* Clearance for the fixed tab bar is on the footer, not here —
            the footer is the last thing on the page, so padding `main`
            would leave a gap above a footer that is still cut off. */}
        {/* The desktop figure is larger than the phone's on purpose: the
            footer is desktop-only in the default shell, so this is the
            gap between the last section and a dense sitemap. On a phone
            the footer carries its own clearance for the tab bar and this
            padding only adds dead scroll. */}
        <main
          className={
            fullBleed
              ? "flex-1 pb-10 lg:pb-16"
              : "mx-auto w-full max-w-shell flex-1 pb-10 lg:px-6 lg:pb-16"
          }
        >
          <RouteTransition>{children}</RouteTransition>
        </main>

        {/* The footer is desktop-only under a takeover: it is how a web
            page ends, and a page that has given its whole phone screen to
            one surface does not want a sitemap under it. */}
        <div className={phoneChrome ? undefined : "hidden lg:block"}>
          <SiteFooter showTrustPills={showTrustPills} />
        </div>

        {/* Phone-only chrome, both fixed. The bar sits above the tab bar
            and hides itself on the screens that carry their own total.

            **The floating consult bubble is gone.** It and the header's
            Consult card were the same destination twice on one screen —
            and of the two, the card is the one that says what the offer
            is where a floating headset only says "help". The bubble also
            had to sit *over* the page to stay reachable, which on a
            product page meant a dark disc parked on top of the grid and,
            on the detail page, on the button beneath it. Nothing is lost:
            Consult is in the header on every page, in the footer, and on
            the home screen. */}
        {phoneChrome && (
          <>
            <CartBar />
            <MobileTabBar />
          </>
        )}
      </div>
    </SearchProvider>
  );
}
