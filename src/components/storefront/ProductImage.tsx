"use client";

import { useState } from "react";
import { Swatch } from "@/components/Swatch";

/**
 * A product's picture.
 *
 * Falls back to the generated swatch whenever there is no photograph, and
 * also when one fails to load — these are third-party URLs on someone
 * else's CDN, which can 404, rate-limit or be pulled at any time, and a
 * broken-image glyph in the middle of a grid looks worse than a swatch.
 *
 * A client component only because that recovery needs an error handler.
 */
export function ProductImage({
  photo,
  swatchKey,
  label,
  className = "",
}: {
  photo?: string;
  swatchKey: string;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!photo || failed) {
    return <Swatch swatchKey={swatchKey} label={label} className={className} />;
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
