import { Star } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * A star rating.
 *
 * Renders nothing at all when there are no reviews. An empty five-star
 * row on every product is worse than no rating: it reads as zero out of
 * five, and on a catalogue that has not been reviewed yet it puts that
 * on every card in the grid.
 *
 * The stars are decorative and the number is the accessible value, rather
 * than five separate images each announcing itself.
 */
export function Rating({
  value,
  count,
  size = "sm",
  showCount = true,
  className,
}: {
  /** 0–5. Null or undefined means "not rated", and renders nothing. */
  value: number | null | undefined;
  /** Number of reviews behind the average. */
  count?: number;
  size?: "sm" | "md";
  showCount?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;

  const rounded = Math.round(value * 10) / 10;
  const star = size === "sm" ? "size-3.5" : "size-4";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={
        count
          ? `Rated ${rounded} out of 5 from ${count} reviews`
          : `Rated ${rounded} out of 5`
      }
    >
      <Star className={cn(star, "shrink-0 fill-current text-warning")} aria-hidden />
      <span
        aria-hidden
        className={cn(
          "nums font-medium text-ink",
          size === "sm" ? "text-micro" : "text-caption",
        )}
      >
        {rounded.toFixed(1)}
      </span>
      {showCount && count != null && count > 0 && (
        <span
          aria-hidden
          className={cn("nums text-faint", size === "sm" ? "text-micro" : "text-caption")}
        >
          ({count > 999 ? `${Math.floor(count / 1000)}k` : count})
        </span>
      )}
    </span>
  );
}
