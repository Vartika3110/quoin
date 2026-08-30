import Image from "next/image";
import type { NavPhoto } from "@/lib/catalogue-imagery";

/**
 * One of the curated catalogue photographs, filling its box.
 *
 * Shared by the entry tiles and the tab rail so both draw the same file
 * the same way. There is nothing to configure per image because the
 * cropping already happened: `npm run images:nav` trimmed each photograph
 * to its subject and squared it, so `object-cover` here has no background
 * left to letterbox.
 *
 * `next/image` rather than the plain tag `ProductImage` uses — the
 * objection recorded there is that optimising a third-party CDN URL copies
 * someone else's file onto Quoin's infrastructure. These are Quoin's own
 * files in `public/`, and the saving is real: a 320px source drawn into a
 * 64px circle is served at 96px instead.
 */
export function NavPhotoFrame({
  photo,
  sizes,
  className = "",
  /** Applied to the image itself, so a caller can add a hover transform. */
  imageClassName = "",
}: {
  photo: NavPhoto;
  /** The rendered box, for `next/image` to pick a source width against. */
  sizes: string;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span className={`relative block overflow-hidden bg-bg ${className}`}>
      <Image
        src={photo.src}
        /* Decorative: every call site sits beside a text label that already
           names the destination, and repeating it here would make a screen
           reader announce the same thing twice. */
        alt=""
        fill
        sizes={sizes}
        className={`object-cover ${imageClassName}`}
      />
    </span>
  );
}
