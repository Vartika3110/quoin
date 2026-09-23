import { CATEGORY_PHOTOS } from "@/lib/category-photos";
import { ImageCard } from "@/components/ui/Card";
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
 * That is `ImageCard`, and this is now a thin call to it: the scrim, the
 * radius, the serif title, the hover scale and the missing-photograph
 * fallback are the card's, shared with every other photographic card on
 * the site. What stays here is the part that is about *categories* — the
 * photo lookup, the aspect ratios the rails and grids ask for, and the
 * descriptor table at the bottom of the file.
 */
const RATIO = {
  portrait: "4 / 5",
  landscape: "3 / 2",
  square: "1 / 1",
} as const;

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
  ratio?: keyof typeof RATIO;
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
  return (
    <ImageCard
      href={`/c/${category.slug}`}
      src={CATEGORY_PHOTOS[category.slug]}
      title={category.title}
      subtitle={descriptor}
      caption={caption}
      ratio={RATIO[ratio]}
      priority={priority}
      sizes="(min-width: 1280px) 340px, (min-width: 1024px) 280px, (min-width: 640px) 45vw, 80vw"
      className={cn(fill ? "w-full" : "w-44 shrink-0 lg:w-auto", className)}
    />
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
