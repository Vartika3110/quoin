"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * An inspiration photograph.
 *
 * Three things this has to get right, and one it deliberately does not do:
 *
 *  - **The box is reserved before the bytes arrive.** `width`/`height` are
 *    stored on the idea (see `StudioIdea` in the schema) precisely so the
 *    tile can be the right shape immediately. Without that a masonry
 *    column re-measures on every image load and the whole grid walks down
 *    the page while someone is reading it.
 *  - **Something is painted in the meantime.** The stored `blurDataUrl` is
 *    a ~16px thumbnail inlined into the markup, so a slow connection sees
 *    the photograph's own colour resolving rather than a grey rectangle.
 *    Where there is none, the skeleton ground stands in.
 *  - **A broken image is not a broken glyph.** These point at a redirect
 *    to a signed URL, which can 404 if the object was reaped, and a
 *    browser's own broken-image icon in the middle of a grid looks worse
 *    than anything. Same recovery `ProductImage` already does.
 *
 * What it does not do is optimise. `next/image`'s optimiser fetches the
 * `src` server-side, and for an upload that `src` is a 307 to a
 * short-lived signed URL — so the optimiser would cache a derivative
 * keyed by a URL that expires, and the cache would be useless within
 * minutes. `sizes` still does the real work: the browser picks a source
 * from `srcSet`, and `unoptimized` only means Quoin is not re-encoding
 * bytes it did not create. Shipped assets under `public/` are already
 * `.webp` at sensible dimensions.
 */
export function IdeaImage({
  src,
  alt,
  width,
  height,
  blurDataUrl,
  sizes,
  className,
  preload = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurDataUrl?: string | null;
  /** How wide this will actually render, so the browser can pick a source
      rather than downloading a 4000px original for a 300px tile. */
  sizes: string;
  className?: string;
  /** `preload`, not `priority` — the latter is deprecated in Next 16.
      True for the handful of tiles above the fold, and no more: preloading
      a whole feed is the same as not preloading any of it. */
  preload?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-sunk text-caption text-faint",
          className,
        )}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${alt} — image unavailable`}
      >
        <span className="px-3 text-center">Image unavailable</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      preload={preload}
      loading={preload ? "eager" : "lazy"}
      decoding="async"
      unoptimized
      onError={() => setFailed(true)}
      {...(blurDataUrl
        ? { placeholder: "blur" as const, blurDataURL: blurDataUrl }
        : {})}
      className={cn(
        "h-auto w-full object-cover",
        /* The ground under a photograph that has not arrived. Painted on
           the element itself rather than a wrapper so it is exactly the
           reserved box and cannot peek out from behind the image. */
        !blurDataUrl && "bg-skeleton",
        className,
      )}
    />
  );
}
