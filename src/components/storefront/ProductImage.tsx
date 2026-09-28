"use client";

import NextImage from "next/image";
import { useState } from "react";
import { Swatch } from "@/components/Swatch";
import { cn } from "@/components/ui/cn";

/**
 * A product's picture.
 *
 * Falls back to `MissingProductPhoto` whenever there is no photograph, and
 * also when one fails to load — these are third-party URLs on someone
 * else's CDN, which can 404, rate-limit or be pulled at any time, and a
 * broken-image glyph in the middle of a grid looks worse than anything.
 *
 * A client component only because that recovery needs an error handler.
 */
export function ProductImage({
  photo,
  swatchKey,
  label,
  brand,
  sizes = "(min-width: 1024px) 220px, 45vw",
  className = "",
}: {
  photo?: string;
  swatchKey: string;
  label: string;
  /** Named on the stand-in, when there is one. See below for why. */
  brand?: string | null;
  /** The rendered width, so the browser fetches one tile rather than the
      original. Defaults to a thumbnail: most call sites here are cart
      rows, order lines and wishlist tiles. A grid or a gallery is bigger
      and says so. */
  sizes?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!photo || failed) {
    return (
      <MissingProductPhoto
        swatchKey={swatchKey}
        label={label}
        brand={brand}
        className={className}
      />
    );
  }

  /* Quoin's own picture: a path under `public/`, or an object in the
     public catalogue bucket. Everything else reaching here is the
     captured source photography behind `SHOW_SOURCE_IMAGES`, which lives
     on someone else's CDN. */
  const ours = photo.startsWith("/") || photo.includes("/storage/v1/object/public/");

  if (ours) {
    return (
      /* `next/image` for these, and the comment that used to sit here
         said the opposite — that optimising would copy someone else's
         files onto Quoin's infrastructure. True while every picture was
         scraped from a competitor's CDN; false now that the catalogue is
         Quoin's own art in Quoin's own bucket. The cost of the plain tag
         was a 1024px original downloaded for a 200px tile and upscaled
         on any screen denser than 1x, which is what "the pixels are
         breaking" looks like. */
      <NextImage
        src={photo}
        alt={label}
        fill
        sizes={sizes}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    /* Left where it is, deliberately: optimising a third party's
       photograph would copy it onto Quoin's infrastructure and cache it
       there, which is the one thing the `source*` quarantine exists to
       prevent. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={label}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
    />
  );
}

/**
 * The plate that stands in for a photograph nobody has taken yet.
 *
 * Two things are on it, and both are load-bearing:
 *
 *  - **The swatch ground**, deterministic per category, because a
 *    thousand identical grey rectangles down a grid reads as a page that
 *    failed to load. That was `Swatch`'s original argument and it still
 *    holds.
 *  - **The words**, because the swatch alone does not hold it. A reader
 *    looking at a tinted box with a line drawing on it cannot tell
 *    whether that is the product or the absence of one, and a catalogue
 *    that leaves them guessing is worse than one that says so. The brand
 *    is named where it is known: for a shopper scanning a grid, "Astral"
 *    with no picture is still a decision they can make, and a nameless
 *    tile is not.
 */
export function MissingProductPhoto({
  swatchKey,
  label,
  brand,
  className = "",
}: {
  swatchKey: string;
  label: string;
  brand?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <Swatch
        swatchKey={swatchKey}
        label={label}
        className="absolute inset-0 size-full"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-photo/85 px-2 py-1.5 text-center">
        {brand ? (
          <span className="line-clamp-1 text-micro font-semibold leading-none text-ink">
            {brand}
          </span>
        ) : null}
        <span className="text-micro uppercase leading-none tracking-[0.06em] text-faint">
          Photo coming soon
        </span>
      </span>
    </span>
  );
}
