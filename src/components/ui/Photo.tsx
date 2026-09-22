"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * A photograph, in a box that was the right shape before the bytes
 * arrived.
 *
 * Four rules, and they are the same four everywhere a photograph appears
 * in the storefront — which is the whole reason this exists rather than
 * each card reaching for `next/image` and remembering three of them:
 *
 *  - **The box is reserved.** `ratio` sets an `aspect-ratio` on the
 *    wrapper, so nothing below a photograph moves when it loads. A grid
 *    that re-flows as images land is the single most expensive thing a
 *    catalogue page can do to a reader.
 *  - **Something is painted meanwhile.** A stored `blurDataURL` is a
 *    ~16px thumbnail inlined into the markup and blurred up; where there
 *    is none, the skeleton ground stands in. Neither survives the load —
 *    a permanent blur is a design that never finished.
 *  - **A miss is not a broken glyph.** No `src`, or a `src` that fails,
 *    renders `MissingPhoto` rather than the browser's torn-page icon.
 *  - **The browser picks the source.** `sizes` is required, because
 *    without it every tile downloads the original.
 *
 * `unoptimized` is passed through for the sources Quoin does not own —
 * a signed URL that expires, or a third-party CDN — where the optimiser
 * would cache a derivative keyed by a URL that is about to stop working.
 */
export function Photo({
  src,
  alt,
  ratio,
  sizes,
  label,
  blurDataURL,
  priority = false,
  unoptimized = false,
  className,
  imageClassName,
}: {
  src: string | null | undefined;
  /** Empty when the photograph is decorative and a heading names it. */
  alt: string;
  /** `w / h`, e.g. `4 / 5`. Sets the reserved box. */
  ratio: string;
  sizes: string;
  /** What `MissingPhoto` says when there is nothing to show — a brand,
      a product name. */
  label?: string;
  blurDataURL?: string | null;
  priority?: boolean;
  unoptimized?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <MissingPhoto label={label} ratio={ratio} className={className} />;
  }

  return (
    <div
      className={cn("relative overflow-hidden bg-skeleton", className)}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={unoptimized}
        decoding="async"
        onError={() => setFailed(true)}
        {...(blurDataURL ? { placeholder: "blur" as const, blurDataURL } : {})}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}

/**
 * The tile that stands in for a photograph nobody has taken yet.
 *
 * Deliberately not a white box and not a grey one: a white rectangle on
 * the cream ground reads as a card that failed to render, and a grey one
 * reads as an error. This is the page's own sunk tone with the brand or
 * product name set into it, so a grid of products the photographer has
 * not reached yet still reads as a catalogue.
 *
 * It says "Photo coming soon" in words, because the alternative — a
 * neutral texture with no explanation — is indistinguishable from a bug,
 * and a reader who cannot tell the difference assumes the worst.
 */
export function MissingPhoto({
  label,
  ratio,
  className,
}: {
  label?: string;
  ratio: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 overflow-hidden bg-sunk px-3 text-center",
        className,
      )}
      style={{ aspectRatio: ratio }}
      role="img"
      aria-label={label ? `${label} — photo coming soon` : "Photo coming soon"}
    >
      {label ? (
        <span className="line-clamp-2 text-caption font-medium leading-snug text-muted">
          {label}
        </span>
      ) : null}
      <span className="text-micro uppercase tracking-[0.08em] text-faint">
        Photo coming soon
      </span>
    </div>
  );
}
