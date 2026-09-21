import { cookies } from "next/headers";
import { SearchProvider } from "@/components/storefront/nav/SearchContext";
import { SiteHeader } from "@/components/storefront/nav/SiteHeader";
import { SiteFooter } from "@/components/storefront/nav/SiteFooter";
import { MobileTabBar } from "@/components/storefront/nav/MobileTabBar";
import { RouteTransition } from "@/components/storefront/RouteTransition";
import { CartBar } from "@/components/storefront/nav/CartBar";
import { ConsultBubble } from "@/components/storefront/nav/ConsultBubble";
import { getCategories } from "@/lib/data/catalog";
import { getSession } from "@/lib/auth/session";
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
  headerSlot,
  phoneChrome = true,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
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
  const [areas, chosen, categories, session] = await Promise.all([
    listAreaChoices(),
    cookies().then((c) => getAreaChoice(c.get(AREA_COOKIE)?.value)),
    getCategories(),
    getSession(),
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
          /* Read here rather than left for the header's own client code to
             discover: the header is a client component with no request of
             its own, and a client-side "am I signed in" check would render
             the bell a moment after everything else, flashing it in. */
          signedIn={session !== null}
        />

        {/* Clearance for the fixed tab bar is on the footer, not here —
            the footer is the last thing on the page, so padding `main`
            would leave a gap above a footer that is still cut off. */}
        <main
          className={
            fullBleed
              ? "flex-1 pb-10"
              : "mx-auto w-full max-w-shell flex-1 pb-10 lg:px-6"
          }
        >
          <RouteTransition>{children}</RouteTransition>
        </main>

        {/* The footer is desktop-only under a takeover: it is how a web
            page ends, and a page that has given its whole phone screen to
            one surface does not want a sitemap under it. */}
        <div className={phoneChrome ? undefined : "hidden lg:block"}>
          <SiteFooter />
        </div>

        {/* Phone-only chrome, all three fixed. The bar sits above the tab
            bar and hides itself on the screens that carry their own
            total; the bubble sits above whichever of them is on screen. */}
        {phoneChrome && (
          <>
            <CartBar />
            <ConsultBubble />
            <MobileTabBar />
          </>
        )}
      </div>
    </SearchProvider>
  );
}
