"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons";
import { Swatch } from "@/components/Swatch";
import type { HarvestSource } from "@/lib/data/harvest";
import type { UnpricedProduct } from "@/lib/data/catalog";

interface HarvestImage {
  source: string;
  file: string;
  page: number | null;
}

/**
 * Pair a catalogue photograph with a product.
 *
 * No parser can do this. Häfele puts five finish article numbers against
 * one table row and Simonswerk outlines its text as artwork, so the
 * images arrive knowing only which page they came from. A person who can
 * recognise a concealed hinge does this in seconds; a heuristic does it
 * wrongly and confidently.
 *
 * Pick a product, then click its photograph.
 */
export function ImagePairing({
  products,
  sources,
}: {
  products: UnpricedProduct[];
  sources: HarvestSource[];
}) {
  const [selected, setSelected] = useState<UnpricedProduct | null>(products[0] ?? null);
  const [source, setSource] = useState(sources[0]?.name ?? "");
  const [page, setPage] = useState(1);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  /* Loading is derived, not stored: what is on screen either belongs to
     the source and page being asked for or it does not. Setting a loading
     flag synchronously inside the effect would schedule a second render
     before the first has painted. */
  const key = `${source}:${page}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    items: HarvestImage[];
    totalPages: number;
  } | null>(null);

  const loading = loaded?.key !== key;
  const images = loaded?.key === key ? loaded.items : [];
  const totalPages = loaded?.key === key ? loaded.totalPages : 1;

  useEffect(() => {
    if (!source) return;
    let cancelled = false;

    fetch(`/api/v1/admin/harvest?source=${encodeURIComponent(source)}&page=${page}`)
      .then((r) => r.json())
      .then((body) => {
        /* A slow response for a source the user has already navigated
           away from must not overwrite the one they are looking at. */
        if (cancelled) return;
        setLoaded({
          key: `${source}:${page}`,
          items: body?.data?.items ?? [],
          totalPages: body?.data?.totalPages ?? 1,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load images");
      });

    return () => {
      cancelled = true;
    };
  }, [source, page]);

  async function assign(image: HarvestImage) {
    if (!selected) return;
    setError(null);

    const res = await fetch(
      `/api/v1/admin/products/${encodeURIComponent(selected.sku)}/image`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: image.source, file: image.file }),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not attach that image");
      return;
    }

    const body = await res.json();
    setAssigned((a) => ({ ...a, [selected.sku]: body.data.image }));

    /* Move to the next product still missing one, so pairing a run of
       them does not mean reaching for the list after every click. */
    const remaining = products.filter((p) => p.sku !== selected.sku && !assigned[p.sku]);
    setSelected(remaining[0] ?? null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <section>
        <h2 className="text-sm font-medium text-ink">Products without a photograph</h2>
        <ul className="mt-3 space-y-1.5">
          {products.map((p) => {
            const done = assigned[p.sku];
            const active = selected?.sku === p.sku;
            return (
              <li key={p.id}>
                <button
                  onClick={() => setSelected(p)}
                  className={`flex w-full items-center gap-3 rounded-tile border p-2 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent-wash"
                      : done
                        ? "border-success/40 bg-success/5"
                        : "border-line-soft bg-surface hover:border-line"
                  }`}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                    {done ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={done} alt="" className="size-full object-contain" />
                    ) : (
                      <Swatch swatchKey={p.image} label="" className="size-full" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink">{p.title}</span>
                    <span className="block truncate text-[10px] text-muted">{p.sku}</span>
                  </span>
                  {done && <Check className="size-4 shrink-0 text-success" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((s) => (
            <button
              key={s.name}
              onClick={() => {
                setSource(s.name);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                source === s.name
                  ? "bg-accent-wash text-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {s.name} ({s.count})
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted">
          {selected ? (
            <>
              Click a photograph to attach it to{" "}
              <span className="text-ink">{selected.title}</span>
            </>
          ) : (
            "Every product in this list has a photograph now."
          )}
        </p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-tile bg-raised" />
              ))
            : images.map((img) => (
                <button
                  key={`${img.source}/${img.file}`}
                  onClick={() => assign(img)}
                  disabled={!selected}
                  title={img.page ? `page ${img.page}` : undefined}
                  className="aspect-square overflow-hidden rounded-tile border border-line-soft bg-surface transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/admin/harvest/${encodeURIComponent(img.source)}/${encodeURIComponent(img.file)}`}
                    alt={`Page ${img.page ?? "?"}`}
                    loading="lazy"
                    className="size-full object-contain"
                  />
                </button>
              ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-accent disabled:text-faint"
            >
              Previous
            </button>
            <span className="text-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-accent disabled:text-faint"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
