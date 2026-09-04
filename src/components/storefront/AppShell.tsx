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
 */
export async function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
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
        <SiteHeader areas={areas} chosen={chosen} categories={categories} />

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

        <SiteFooter />

        {/* Phone-only chrome, both fixed. The bar sits above the tab bar
            and hides itself on the screens that carry their own total. */}
        <CartBar />
        <MobileTabBar />
      </div>
    </SearchProvider>
  );
}
