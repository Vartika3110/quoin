"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Back, Heart, HeartFilled, Upload } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";
import { useWishlist } from "@/lib/store/wishlist";
import type { Product } from "@/lib/types/catalog";

/**
 * Back, save and share, floating on the photograph.
 *
 * All three existed already and none of them was anywhere near the top of
 * the page: back was the browser's, save was a heart beside "Buy now" two
 * screens down, and share was nothing at all. The reference design puts
 * them over the image because that is where a phone's thumb arrives —
 * before the title, before the price, before anything has been read.
 *
 * A plate under each, not a bare glyph. These sit on a photograph whose
 * ground is whatever the manufacturer shot against: a bare stroke icon is
 * legible on a white tub of putty and invisible on a dark bag of cement.
 */
export function GalleryActions({ product }: { product: Product }) {
  const router = useRouter();
  const wishlist = useWishlist();
  const toast = useToast();
  const [shared, setShared] = useState(false);

  const saved = wishlist.has(product.slug);

  async function share() {
    const url = window.location.href;

    /* `navigator.share` is the real thing on a phone — the OS sheet, with
       WhatsApp in it, which is how a site like this actually gets passed
       around. It does not exist on most desktops, and it rejects when the
       person dismisses the sheet; neither is an error worth showing. */
    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, url });
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1200);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 lg:hidden">
      <Plate
        label="Go back"
        onClick={() => router.back()}
      >
        <Back className="size-5" />
      </Plate>

      <div className="pointer-events-auto flex items-center gap-2">
        <Plate
          label={saved ? `Remove ${product.title} from your wishlist` : `Save ${product.title}`}
          onClick={() => {
            const nowSaved = wishlist.toggle(product);
            toast.toast(
              nowSaved ? "Saved to your wishlist" : "Removed from your wishlist",
            );
          }}
        >
          {saved ? (
            <HeartFilled className="size-5 text-accent" />
          ) : (
            <Heart className="size-5" />
          )}
        </Plate>

        <Plate label="Share this product" onClick={share}>
          <Upload className={cn("size-5", shared && "text-accent")} />
        </Plate>
      </div>
    </div>
  );
}

function Plate({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto grid size-10 place-items-center rounded-full border border-line-hair bg-surface/90 text-ink shadow-sm backdrop-blur-sm transition-colors active:bg-hover"
    >
      {children}
    </button>
  );
}
