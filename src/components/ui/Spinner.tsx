import { cn } from "@/components/ui/cn";

/**
 * An indeterminate spinner.
 *
 * A ring with a gap rather than a chasing dot: at 16px a dot is two
 * pixels and reads as a rendering artefact. Drawn with a border so it
 * costs no SVG and inherits `currentColor` like every icon.
 */
export function Spinner({
  className,
  label,
}: {
  className?: string;
  /** Announced to screen readers. Omit inside a control that already says it. */
  label?: string;
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "anim-spin inline-block rounded-full border-2 border-current border-t-transparent align-[-0.125em]",
        className ?? "size-4",
      )}
    />
  );
}
