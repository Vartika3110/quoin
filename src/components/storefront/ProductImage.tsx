"use client";

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
  className = "",
}: {
  photo?: string;
  swatchKey: string;
  label: string;
  /** Named on the stand-in, when there is one. See below for why. */
  brand?: string | null;
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

  return (
    /* Deliberately not next/image: optimisation would copy these onto
       Quoin's own infrastructure and cache them there. A plain tag leaves
       them where they are, which is both cheaper and easier to undo. */
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
