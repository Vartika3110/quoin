"use client";

/* eslint-disable @next/next/no-img-element -- The whole point of this page
   is to show the extracted artwork at its true pixel count. `next/image`
   resamples, and a resampled picture cannot answer the question this page
   exists to answer: is what the PDF actually contains big enough to sell
   from? Plain <img> at natural size, never upscaled. */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";

export type PreviewRow = {
  file: string;
  source_file: string;
  src_w: number;
  src_h: number;
  web_w: number;
  web_h: number;
  bytes: number;
  regime: string;
  series: string;
  item: string;
  cat_nos: string;
  size_mm: string;
  price_inr: string;
  section: string;
  sheet: number;
  folio: number | null;
  reused: boolean;
};

/** The width a storefront grid tile is actually drawn at on a desktop —
    taken from `ProductCard`'s own `sizes` attribute, which asks for 300px
    above 1280px wide. A retina screen then wants 600 real pixels in the
    file to draw it without softening. */
const CARD_PX = 300;

type Grade = "ok" | "thin" | "poor";

/**
 * How an image would hold up in the grid.
 *
 * The threshold is not a matter of taste. A tile is drawn 300 CSS pixels
 * across and almost every phone and laptop sold in the last decade has a
 * 2x display, so 600 source pixels is the point at which the browser
 * stops inventing detail. Below 300 it is inventing more than half of
 * what the customer sees.
 */
function grade(row: PreviewRow): Grade {
  const longest = Math.max(row.web_w, row.web_h);
  if (longest >= 600) return "ok";
  if (longest >= 300) return "thin";
  return "poor";
}

const GRADE_LABEL: Record<Grade, string> = {
  ok: "Sharp at card size",
  thin: "Soft at card size",
  poor: "Too small for a card",
};

const GRADE_TONE: Record<Grade, "success" | "warning" | "danger"> = {
  ok: "success",
  thin: "warning",
  poor: "danger",
};

export function CataloguePreviewGallery({ rows }: { rows: PreviewRow[] }) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("");
  const [onlyGrade, setOnlyGrade] = useState<"" | Grade>("");
  const [scale, setScale] = useState<"card" | "actual">("card");
  const [limit, setLimit] = useState(120);

  const seriesList = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.series).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (series && r.series !== series) return false;
      if (onlyGrade && grade(r) !== onlyGrade) return false;
      if (!q) return true;
      return (
        r.series.toLowerCase().includes(q) ||
        r.item.toLowerCase().includes(q) ||
        r.cat_nos.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q) ||
        r.file.toLowerCase().includes(q)
      );
    });
  }, [rows, query, series, onlyGrade]);

  const shown = filtered.slice(0, limit);

  const counts = useMemo(() => {
    const c = { ok: 0, thin: 0, poor: 0 };
    for (const r of rows) c[grade(r)] += 1;
    return c;
  }, [rows]);

  return (
    <div className="px-5 lg:px-0">
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Tally
          label="Sharp at card size"
          sub="600px or more on the long edge"
          value={counts.ok}
          total={rows.length}
          tone="success"
          onClick={() => setOnlyGrade(onlyGrade === "ok" ? "" : "ok")}
          active={onlyGrade === "ok"}
        />
        <Tally
          label="Soft at card size"
          sub="300–599px — usable small, visibly fuzzy large"
          value={counts.thin}
          total={rows.length}
          tone="warning"
          onClick={() => setOnlyGrade(onlyGrade === "thin" ? "" : "thin")}
          active={onlyGrade === "thin"}
        />
        <Tally
          label="Too small for a card"
          sub="under 300px on the long edge"
          value={counts.poor}
          total={rows.length}
          tone="danger"
          onClick={() => setOnlyGrade(onlyGrade === "poor" ? "" : "poor")}
          active={onlyGrade === "poor"}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(120);
          }}
          placeholder="Search series, Cat. No., item…"
          className="h-10 min-w-56 flex-1 rounded-md border border-line-soft bg-surface px-3 text-body-sm text-ink placeholder:text-faint"
        />
        <select
          value={series}
          onChange={(e) => {
            setSeries(e.target.value);
            setLimit(120);
          }}
          className="h-10 rounded-md border border-line-soft bg-surface px-3 text-body-sm text-ink"
        >
          <option value="">All {seriesList.length} series</option>
          {seriesList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex h-10 overflow-hidden rounded-md border border-line-soft">
          {(
            [
              ["card", `At card size (${CARD_PX}px)`],
              ["actual", "Actual pixels (1:1)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScale(value)}
              className={cn(
                "px-3 text-body-sm transition-colors",
                scale === value
                  ? "bg-accent text-on-accent"
                  : "bg-surface text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-caption text-muted">
        {filtered.length.toLocaleString("en-IN")} of{" "}
        {rows.length.toLocaleString("en-IN")} images
        {shown.length < filtered.length
          ? ` — showing the first ${shown.length.toLocaleString("en-IN")}`
          : ""}
        .{" "}
        {scale === "card"
          ? "Each picture is drawn in a tile the exact width the storefront grid uses, so the softness you see here is the softness a customer would see."
          : "Each picture is drawn at its own pixel size, nothing stretched. The small ones are small."}
      </p>

      <div
        className={cn(
          "grid gap-5",
          scale === "card"
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))]",
        )}
      >
        {shown.map((r) => (
          <Tile key={r.file} row={r} scale={scale} />
        ))}
      </div>

      {shown.length < filtered.length ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + 240)}
            className="h-11 rounded-full border-2 border-accent px-6 text-body-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent"
          >
            Show more
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-body text-muted">
          Nothing matches that.
        </p>
      ) : null}
    </div>
  );
}

function Tile({ row, scale }: { row: PreviewRow; scale: "card" | "actual" }) {
  const g = grade(row);
  const src = `/catalogue-preview/hindware-a/${row.file}`;

  return (
    <figure className="flex flex-col">
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-card border border-photo-edge bg-photo",
          scale === "card" ? "aspect-square" : "p-3",
        )}
      >
        {scale === "card" ? (
          <img
            src={src}
            alt={[row.series, row.item, row.cat_nos]
              .filter(Boolean)
              .join(" ")
              .trim()}
            width={row.web_w}
            height={row.web_h}
            className="size-full object-contain"
            loading="lazy"
          />
        ) : (
          <img
            src={src}
            alt={[row.series, row.item, row.cat_nos]
              .filter(Boolean)
              .join(" ")
              .trim()}
            width={row.web_w}
            height={row.web_h}
            style={{ width: row.web_w, height: row.web_h, maxWidth: "100%" }}
            loading="lazy"
          />
        )}
        <span className="nums absolute right-1.5 top-1.5 rounded-sm bg-deep/70 px-1.5 py-0.5 text-micro text-on-deep">
          {row.web_w}×{row.web_h}
        </span>
      </div>

      <figcaption className="flex flex-1 flex-col gap-1 pt-2">
        <span className="truncate text-micro uppercase tracking-wide text-muted">
          {row.series || "— no series matched —"}
        </span>
        {row.item ? (
          <span className="line-clamp-2 text-body-sm leading-snug text-ink">
            {row.item}
          </span>
        ) : null}
        <span className="nums text-caption text-muted">
          {row.cat_nos || "no Cat. No."}
          {row.size_mm ? ` · ${row.size_mm}` : ""}
        </span>
        <span className="nums text-micro text-faint">
          sheet {row.sheet}
          {row.folio ? ` · page ${row.folio}` : ""} ·{" "}
          {Math.round(row.bytes / 1024)} KB
          {row.reused ? " · reused" : ""}
        </span>
        <Badge tone={GRADE_TONE[g]} size="sm" className="mt-1 w-fit">
          {GRADE_LABEL[g]}
        </Badge>
      </figcaption>
    </figure>
  );
}

function Tally({
  label,
  sub,
  value,
  total,
  tone,
  onClick,
  active,
}: {
  label: string;
  sub: string;
  value: number;
  total: number;
  tone: "success" | "warning" | "danger";
  onClick: () => void;
  active: boolean;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-card border p-4 text-left transition-colors",
        active
          ? "border-accent bg-accent-dim"
          : "border-line-soft bg-surface hover:border-accent-edge",
      )}
    >
      <span className="nums block text-title-sm font-semibold text-ink">
        {value.toLocaleString("en-IN")}
        <span className="ml-1.5 text-caption font-normal text-muted">
          {pct}%
        </span>
      </span>
      <Badge tone={tone} size="sm" className="mt-1.5">
        {label}
      </Badge>
      <span className="mt-1.5 block text-micro text-faint">{sub}</span>
    </button>
  );
}
