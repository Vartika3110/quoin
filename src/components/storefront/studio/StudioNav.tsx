"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Heart, Layers, Plus, Sofa, Sparkle } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";

/**
 * Studio's own navigation.
 *
 * A second nav inside a site that already has one needs a reason. This is
 * it: Studio is a workspace someone stays inside for a long session,
 * moving between the feed, their saves and their rooms, and routing all
 * of that through the global header's "Projects" link would make every
 * move a trip back to the top of the page.
 *
 * Two renderings of one list, and deliberately not two lists:
 *
 *  - **A rail from `lg` up**, sticky beside the content, which is what
 *    section 27 asks for and what a wide screen has the room for.
 *  - **A scrolling chip row below `lg`**, because a 320px phone cannot
 *    give 200px to navigation. It is not a shrunken sidebar; it is the
 *    same destinations in the shape a thumb can reach.
 *
 * The global `MobileTabBar` stays exactly as it is. Studio does not get
 * to replace the app's primary navigation, and section 26's five-tab bar
 * is served by this chip row plus the tab bar that is already there.
 */
interface StudioLink {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** `/studio` matches only itself — without this, Discover stays lit on
      every page beneath it and the nav never says where you are. */
  exact?: boolean;
}

const LINKS: StudioLink[] = [
  { href: "/studio", label: "Discover", Icon: Sparkle, exact: true },
  { href: "/studio/saved", label: "Saved", Icon: Heart },
  { href: "/studio/spaces", label: "Spaces", Icon: Sofa },
  { href: "/studio/upload", label: "Add", Icon: Camera },
];

/** Studio ends where the Project Hub begins, and says so rather than
    pretending a build is one more kind of board. */
const ELSEWHERE: StudioLink[] = [
  { href: "/projects", label: "Project Hub", Icon: Layers },
];

function isCurrent(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Studio"
        className="hidden w-52 shrink-0 lg:block"
      >
        <div className="sticky top-24 flex flex-col gap-1">
          {LINKS.map(({ href, label, Icon, exact }) => (
            <RailLink
              key={href}
              href={href}
              label={label}
              Icon={Icon}
              on={isCurrent(pathname, href, exact)}
            />
          ))}

          <hr className="my-3 border-line-hair" />

          {ELSEWHERE.map(({ href, label, Icon }) => (
            <RailLink
              key={href}
              href={href}
              label={label}
              Icon={Icon}
              on={isCurrent(pathname, href)}
            />
          ))}

          <Button href="/studio/spaces?new=1" size="sm" className="mt-4 w-full">
            <Plus className="size-4" />
            New space
          </Button>
        </div>
      </nav>

      {/* Phone and tablet chip row.

          No negative margin. `-mx-5 px-5` is the trick for escaping a
          padded parent, and `StudioShell` does not pad on a phone — so
          the pair made this row 40px wider than the viewport, hanging 20px
          off each side. That put the first chip flush against the screen
          edge instead of on the gutter, and pushed the document 20px wider
          than the window. The page's own `overflow-x: clip` hid the
          resulting scrollbar on engines that implement `clip`, which is
          exactly why it survived: the bug was invisible on the machine it
          was written on and a sideways drag everywhere else. */}
      <nav
        aria-label="Studio"
        className="no-scrollbar flex items-center gap-2 overflow-x-auto px-5 pb-1 scroll-pl-5 lg:hidden"
      >
        {[...LINKS, ...ELSEWHERE].map(({ href, label, Icon, exact }) => {
          const on = isCurrent(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-body-sm font-medium transition-colors",
                on
                  ? "border-accent-edge bg-accent-wash text-accent"
                  : "border-line-soft bg-surface text-muted hover:bg-hover",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function RailLink({
  href,
  label,
  Icon,
  on,
}: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  on: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-body font-medium transition-colors",
        on ? "bg-accent-wash text-accent" : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
