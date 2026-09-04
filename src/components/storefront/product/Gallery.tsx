"use client";

import { useState } from "react";
import { ProductImage } from "@/components/storefront/ProductImage";
import { cn } from "@/components/ui/cn";
import type { Product } from "@/lib/types/catalog";

/**
 * The product gallery.
 *
 * Built for the number of pictures Quoin actually has, which is one for
 * most rows and none for some. A carousel with dots under a single
 * photograph is the clearest possible signal that a page was designed
 * against a mock-up rather than the data: it promises more images and
 * then swipes to nothing.
 *
 * So: one frame, and the thumbnail rail appears only when there is a
 * second picture to put in it. The frame supports click-to-zoom, which is
 * the one interaction that matters for tile, stone and finishes — the
 * decision is about texture and a 400px square cannot show it.
 */
export function Gallery({ product }: { product: Product }) {
  /* `photo` is a single URL on the domain type today. The array is here so
     that a `photos: string[]` on the product does not change this
     component's shape — only what is passed in. */
  const photos = product.photo ? [product.photo] : [];
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const active = photos[index];

  return (
    <div className="lg:sticky lg:top-24">
      <div
        className={cn(
          "relative aspect-square overflow-hidden bg-photo lg:rounded-card lg:border lg:border-photo-edge",
          photos.length > 0 && "cursor-zoom-in",
          zoomed && "cursor-zoom-out",
        )}
        onClick={() => photos.length > 0 && setZoomed((z) => !z)}
        role={photos.length > 0 ? "button" : undefined}
        tabIndex={photos.length > 0 ? 0 : undefined}
        onKeyDown={(e) => {
          if (photos.length === 0) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setZoomed((z) => !z);
          }
        }}
        aria-label={photos.length > 0 ? "Zoom the product photograph" : undefined}
      >
        <ProductImage
          photo={active}
          swatchKey={product.image}
          label={product.title}
          className={cn(
            "size-full transition-transform duration-500 ease-out-quart",
            zoomed && "scale-[1.8]",
          )}
        />

        {product.photoIsIllustration && (
          /* Says what the picture is. A generated image of a real SKU
             shown without this is a claim about goods the customer will
             receive that nobody has photographed. */
          <p className="absolute inset-x-0 bottom-0 bg-deep/75 px-4 py-2 text-center text-micro text-white backdrop-blur-sm">
            Illustration only — the product you receive may differ in
            appearance.
          </p>
        )}
      </div>

      {photos.length > 1 && (
        <div className="rail mt-3 gap-2 px-5 scroll-pl-5 lg:px-0 lg:scroll-pl-0">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-lg border bg-photo transition-colors",
                i === index ? "border-accent" : "border-photo-edge hover:border-line",
              )}
            >
              <ProductImage
                photo={photo}
                swatchKey={product.image}
                label=""
                className="size-full"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
