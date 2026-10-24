"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Photo } from "@/components/ui/Photo";
import { cn } from "@/components/ui/cn";
import { useActiveChipIntoView } from "@/components/storefront/browse/useActiveChipIntoView";
import { withParams, type BrowseParams } from "@/lib/browse-params";

/**
 * The department's shelves, down the left edge of a phone screen.
 *
 * This replaces the horizontal chip row that was here. The two carry the
 * same list and the same links, and the column wins for one reason: a
 * rail of nine chips shows three of them, so a reader who wants *Conduit
 * pipes* has to know it exists before they can swipe to it. A column
 * shows seven at a glance and the rest with a short scroll, and it stays
 * on screen while the grid moves — which is what makes "no, the other
 * shelf" a single tap rather than a scroll back to the top.
 *
 * It costs about a quarter of the width, which is why the thumbnails are
 * doing real work: at 88px the label is two short lines, and a picture of
 * what is actually on the shelf reads faster than the words do. The
 * pictures are the first photographed product inside each type, not
 * commissioned icons — see `getProductFacets`.
 *
 * Phone only. The desktop already has a filter sidebar with a Type group
 * in it, and a second column of the same options beside it would be two
 * controls for one parameter.
 */
export function TypeSidebar({
  basePath,
  params,
  types,
  allLabel,
  allPhoto,
}: {
  basePath: string;
  params: BrowseParams;
  types: { id: string; label: string; count: number; photo?: string }[];
  /** The department's own name, for the "All …" entry at the top. */
  allLabel: string;
  /**
   * The department's own photograph, for that entry. Without it the
   * first thing in the column is a "photo coming soon" placeholder,
   * which reads as a broken shelf rather than as the way back out of
   * one.
   */
  allPhoto?: string;
}) {
  const activeRef = useActiveChipIntoView<HTMLAnchorElement>(params.type);
  const navRef = useFittedToViewport<HTMLElement>();

  return (
    <nav
      ref={navRef}
      aria-label="Product types"
      /* Sticky rather than scrolling with the grid: the whole point is
         that it is still there after six rows of products. The height is
         measured rather than declared — see `useFittedToViewport`. */
      className="no-scrollbar sticky top-28 w-22 shrink-0 self-start overflow-y-auto border-r border-line-hair lg:hidden"
    >
      <Entry
        href={withParams(basePath, params, { type: undefined })}
        label={allLabel}
        photo={allPhoto}
        active={!params.type}
      />
      {types.map((type) => (
        <Entry
          key={type.id}
          ref={params.type === type.id ? activeRef : undefined}
          href={withParams(basePath, params, {
            type: params.type === type.id ? undefined : type.id,
          })}
          label={type.label}
          photo={type.photo}
          active={params.type === type.id}
        />
      ))}
    </nav>
  );
}

function Entry({
  href,
  label,
  photo,
  active,
  ref,
}: {
  href: string;
  label: string;
  photo?: string;
  active: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={ref}
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 px-1.5 py-2.5 text-center transition-colors",
        active ? "bg-accent-wash" : "active:bg-hover",
      )}
    >
      {/* A white disc behind the picture, not a cream one.
       *
       * The first version of this had a `bg-raised` tile with a border —
       * cream, `#fcf6ec`. Catalogue photography is shot on white, so a
       * white photograph on a cream plate on a cream page drew two
       * rectangles nobody asked for, and the column read as a stack of
       * little boxes in slightly different shades. Taking the plate away
       * only moved the problem: the photograph's own white then met the
       * page's cream directly, which is the same seam one layer down.
       *
       * `bg-photo` is the token for exactly this — `#ffffff` in light,
       * near-white in dark — so the picture's own ground and the disc's
       * are the same colour and the join disappears. What is left on the
       * page is a round product, which is what the reference shows.
       *
       * It cannot fix a photograph shot in a room: a dish drainer on a
       * worktop still carries its worktop. Those want cutting out at the
       * asset level, not at the component. */}
      <span className="overflow-hidden rounded-full bg-photo">
        <Photo
          src={photo}
          alt=""
          label={label}
          ratio="1 / 1"
          sizes="56px"
          className="w-14 bg-photo"
        />
      </span>
      <span
        className={cn(
          "text-micro font-medium leading-tight",
          active ? "text-accent" : "text-muted",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * Caps an element's height at the screen space actually below it.
 *
 * A CSS `max-height: calc(100dvh - 7rem)` is right only once the column
 * has stuck to its offset. Before the page is scrolled it sits wherever
 * the header, breadcrumb and department rail leave it — a hundred-odd
 * pixels lower — and a box sized for the stuck position runs off the
 * bottom of the screen by exactly that much. The shelves in the overrun
 * cannot be scrolled to, because the column is already at the end of its
 * own scroll range: they are inside the element and outside the window.
 *
 * So the figure is taken from where the column really is, and taken
 * again when that changes. `BOTTOM` is the fixed `BrowseActionBar`,
 * which is not part of the viewport as far as anything readable is
 * concerned.
 *
 * Measured in a frame of its own and written straight to the style
 * rather than to state: this runs on scroll, and a re-render per frame
 * to set one number is how a sticky sidebar makes a phone stutter.
 */
function useFittedToViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* The action bar's 52px, its gap, and the home indicator under it. */
    const BOTTOM = 72;
    let frame = 0;

    const fit = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      el.style.maxHeight = `${Math.max(240, window.innerHeight - top - BOTTOM)}px`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    fit();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return ref;
}
