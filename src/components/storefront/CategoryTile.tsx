import Image from "next/image";
import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { Chevron } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import type { Category } from "@/lib/types/catalog";

/**
 * A category, as one photograph.
 *
 * The picture is the card rather than something sitting inside it. Every
 * earlier arrangement — a bordered thumbnail, then a faded one, then one
 * bled to the card's edges — kept a step where the photograph's own ground
 * met the white surface, because these are shot on grey tile and concrete
 * and counter-top, and no amount of edge treatment stops a grey rectangle
 * reading as a rectangle on white. Filling the card removes the boundary
 * rather than disguising it: there is no second surface left to step
 * against.
 *
 * The cost is that the type sits on the photograph, which is why the scrim
 * is not optional and why it is espresso rather than black — a neutral
 * scrim over warm photography greys it, and the palette is warm everywhere
 * else.
 */
export function CategoryTile({
  category,
  caption,
  descriptor,
  ratio = "portrait",
  fill = false,
  priority = false,
  className,
}: {
  category: Category;
  /** The metric under the title — a price floor or a product count. */
  caption: string;
  /** One line of what the category actually holds. Optional. */
  descriptor?: string;
  ratio?: "portrait" | "landscape" | "square";
  /**
   * `true` when the tile is a grid item and the column already sets its
   * width. The default keeps the fixed width a scrolling rail needs,
   * because `.rail > *` refuses to shrink.
   */
  fill?: boolean;
  /** Set on the tiles above the fold so they are not lazy-loaded. */
  priority?: boolean;
  className?: string;
}) {
  const photo = CATEGORY_PHOTOS[category.slug];

  return (
    <Link
      href={`/c/${category.slug}`}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden rounded-card",
        ratio === "portrait" && "aspect-4/5",
        ratio === "landscape" && "aspect-3/2",
        ratio === "square" && "aspect-square",
        fill ? "w-full" : "w-44 shrink-0 lg:w-auto",
        className,
      )}
    >
      {photo ? (
        <Image
          src={photo}
          /* Decorative: the heading below is inside this same link and
             already names the category. */
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1280px) 340px, (min-width: 1024px) 280px, (min-width: 640px) 45vw, 80vw"
          className="object-cover transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
        />
      ) : (
        /* Still reachable: a category added after the shoot has no file,
           and the swatch fills its box the same way a cover-fitted
           photograph does. */
        <Swatch
          swatchKey={category.images[0] ?? "cement"}
          label=""
          className="absolute inset-0 size-full"
        />
      )}

      {/* Tall enough to cover every line of type at its longest — a scrim
          sized to the short titles leaves "Home appliances & security"
          sitting half on bare photograph. */}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-deep via-deep/65 to-transparent" />

      <div className="relative p-4">
        <h3 className="text-body font-semibold leading-snug text-white">
          {category.title}
        </h3>
        {descriptor && (
          <p className="mt-0.5 line-clamp-1 text-micro text-white/70">
            {descriptor}
          </p>
        )}
        <span className="mt-1.5 flex items-center gap-1 text-micro text-white/85">
          {caption}
          <Chevron className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * What each department actually holds, in one line.
 *
 * Written rather than derived: the category names are functional
 * ("Bathware & plumbing") and say nothing about the range behind them. A
 * category with no entry simply shows its count, which is what the tile
 * did before this existed.
 */
export const CATEGORY_DESCRIPTOR: Record<string, string> = {
  "bathware-plumbing": "Sanitaryware, taps, showers and pipes",
  "cement-steel": "Structural materials by the bag and the tonne",
  "electricals-lighting": "Wiring, switchgear, fans and fittings",
  "gypsum-false-ceiling": "Boards, sections and ceiling systems",
  "hardware-locks": "Door hardware, hinges and locking",
  "home-appliances-security": "Appliances, cameras and access control",
  "kitchen-wardrobe-fittings": "Runners, hinges, baskets and organisers",
  "kitchen-sinks-faucets": "Sinks, mixers and kitchen plumbing",
  "paints-finishes": "Emulsions, enamels, primers and finishes",
  "plywood-laminates": "Sheets, laminates, veneers and edging",
  services: "Verified professionals, booked to a slot",
  "tiling-adhesives": "Tile, stone, adhesives and grout",
  "tools-safety": "Power tools, hand tools and site safety",
  waterproofing: "Membranes, coatings and admixtures",
};
