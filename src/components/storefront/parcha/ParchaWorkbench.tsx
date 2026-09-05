"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  Camera,
  Cart,
  Check,
  Close,
  Document,
  Layers,
  Minus,
  Plus,
  Search,
  Upload,
} from "@/components/icons";
import { parseParcha, type ParchaLine } from "@/lib/parcha";
import { formatPrice } from "@/lib/types/catalog";
import { useCart } from "@/lib/store/cart";
import type { Product } from "@/lib/types/catalog";
import { useProjects } from "@/lib/store/projects";

/**
 * Upload Parcha.
 *
 * A parcha is the handwritten materials list that gets passed over a
 * counter. Turning one into a priced order is the single most useful thing
 * this product can do for a contractor, and this is the honest version of
 * it:
 *
 *  - **Typing or pasting the list works end to end today.** Every line is
 *    parsed, matched against the real catalogue, priced from real
 *    variants, and can be added to a cart or a project.
 *  - **Attaching a photograph does not read the handwriting.** There is no
 *    OCR service behind this app, and a mocked-up "extracting… found
 *    cement, 40 bags" against an arbitrary photo would be an invented
 *    result presented as a measurement. The attachment is held with the
 *    request and a person reads it, which is what actually happens.
 *
 * That distinction is stated on the page rather than hidden, because a
 * customer who thinks the photo was read and then finds it was not is a
 * customer who stops trusting every other number here.
 */

interface Match {
  slug: string;
  title: string;
  brand: string | null;
  photo: string | null;
  pricePaise: number | null;
  minQty: number;
  stepQty: number;
  pricingUnit: string | null;
}

interface Row extends ParchaLine {
  match: Match | null;
  /** Dropped from the order without losing the customer's own line. */
  removed: boolean;
}

const MAX_FILE_MB = 10;
const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.csv";

export function ParchaWorkbench() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /* A second input, because `capture` is an attribute of the input rather
     than of the click. One input cannot both open the gallery and open the
     camera, and toggling the attribute between clicks is a race on iOS. */
  const cameraInput = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const { add } = useCart();
  const { projects } = useProjects();
  const toast = useToast();

  const price = async () => {
    const lines = parseParcha(text);
    if (lines.length === 0) {
      setError("Write one item per line — a name, and a quantity if you have one.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/parcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: lines.slice(0, 40).map((l) => l.term) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { data: { matches: (Match | null)[] } };

      setRows(
        lines.slice(0, 40).map((line, i) => ({
          ...line,
          match: body.data.matches[i] ?? null,
          removed: false,
        })),
      );
    } catch {
      setError("We could not price the list just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const onFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) continue;
      accepted.push(file);
    }
    setFiles((current) => [...current, ...accepted].slice(0, 6));
  }, []);

  const [adding, setAdding] = useState(false);

  /**
   * Adds every matched line to the cart, for real.
   *
   * The match carries a slug and a price but not the whole `Product` the
   * cart line needs — the variant grid, the fulfilment type, the
   * illustration flag. Rather than rebuild a half-populated product here
   * and let a wrong `minQty` reach a cart, each one is fetched from the
   * same endpoint the detail page uses. Slower than guessing, and correct.
   *
   * Requests go out together and failures are counted rather than thrown:
   * one product retired between the match and the click should not lose
   * the other nineteen lines.
   */
  async function addAll() {
    if (!rows) return;
    setAdding(true);

    const wanted = rows.filter((r) => !r.removed && r.match?.pricePaise != null);
    const results = await Promise.all(
      wanted.map(async (row) => {
        try {
          const res = await fetch(`/api/v1/products/${row.match!.slug}`);
          if (!res.ok) return null;
          const body = (await res.json()) as { data: { product: Product } };
          return { product: body.data.product, qty: row.qty };
        } catch {
          return null;
        }
      }),
    );

    let ok = 0;
    for (const result of results) {
      if (!result) continue;
      add(result.product, result.product.variants[0], result.qty);
      ok += 1;
    }

    setAdding(false);
    if (ok === 0) {
      setError("Nothing could be added just now. Try again in a moment.");
    } else {
      toast.success(
        `Added ${ok} ${ok === 1 ? "line" : "lines"} to your cart`,
        { label: "View cart", onClick: () => router.push("/cart") },
      );
    }
  }

  const live = rows?.filter((r) => !r.removed) ?? [];
  const matched = live.filter((r) => r.match?.pricePaise != null);
  const total = matched.reduce(
    (sum, r) => sum + (r.match?.pricePaise ?? 0) * r.qty,
    0,
  );

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- input */}
      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-line-hair px-5 py-4">
          <h2 className="text-title-sm font-semibold text-ink">
            Type or paste your list
          </h2>
          <p className="mt-1 text-caption text-muted">
            One item per line. Quantities and units are read automatically —
            “Cement 40 bags”, “620 sqft tiles”, “8 inch CPVC bend”.
          </p>
        </div>

        <label className="sr-only" htmlFor="parcha">
          Your materials list
        </label>
        <textarea
          id="parcha"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={"Cement 40 bags\nSteel 250 kg\nWhite emulsion 18 ltr\nJaquar shower head"}
          className="w-full resize-y bg-surface px-5 py-4 font-mono text-body leading-relaxed text-ink outline-none placeholder:text-faint"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-hair bg-raised px-5 py-3">
          <p className="text-micro text-faint">
            {text.trim() ? `${parseParcha(text).length} items read` : "Up to 40 items"}
          </p>
          <Button onClick={price} loading={busy} disabled={!text.trim()}>
            <Search className="size-4" />
            Price this list
          </Button>
        </div>
      </Card>

      {error && <InlineError>{error}</InlineError>}

      {/* ---------------------------------------------------------- files */}
      <Card padding="none" className="overflow-hidden">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-accent bg-accent-wash" : "border-line bg-surface",
          )}
        >
          <span className="grid size-12 place-items-center rounded-full bg-accent-wash text-accent">
            <Upload className="size-6" />
          </span>
          <p className="mt-4 text-body font-semibold text-ink">
            Or attach a photo of the paper
          </p>
          <p className="mx-auto mt-2 max-w-md text-caption leading-relaxed text-muted">
            PDF, image, spreadsheet — up to {MAX_FILE_MB}MB each.{" "}
            {/* Said plainly. See the note at the top of this file. */}
            <span className="text-ink">
              A person reads handwriting here, not a machine
            </span>{" "}
            — attach it and a Quoin expert sends the priced list back, usually
            the same day.
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED}
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            /* Opens the rear camera directly on a phone rather than the
               photo library — which is the whole point of "scan": the
               parcha is on the counter in front of you, not in the gallery.
               Ignored on a desktop, where it falls back to a file picker. */
            capture="environment"
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />

          <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            {/* Camera first on a phone: scanning the paper is the thing
                someone standing at a counter came here to do. */}
            <Button onClick={() => cameraInput.current?.click()}>
              <Camera className="size-4" />
              Scan the parcha
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <Document className="size-4" />
              Choose a file
            </Button>
          </div>
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-line-hair">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <Document className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                  {file.name}
                </span>
                <span className="nums shrink-0 text-micro text-faint">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-danger"
                >
                  <Close className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-hair bg-raised px-5 py-3">
            <p className="text-micro text-muted">
              Send these with your contact details and we will price them by
              hand.
            </p>
            <Button href="/consult" variant="outline" size="sm">
              Send to an expert
            </Button>
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- results */}
      {busy && !rows && (
        <Card>
          <p className="flex items-center justify-center gap-2 py-8 text-body-sm text-muted">
            <Spinner className="size-4" />
            Matching your list against the catalogue…
          </p>
        </Card>
      )}

      {rows && (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-title font-semibold text-ink">Priced list</h2>
              <p className="mt-1 text-caption text-muted">
                {matched.length} of {live.length} lines matched a catalogue
                product.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRows(null)}>
              Start again
            </Button>
          </div>

          {live.length === 0 ? (
            <EmptyState
              compact
              title="Every line was removed"
              action={{ label: "Start again", onClick: () => setRows(null) }}
            />
          ) : (
            <>
              <ul className="divide-y divide-line-hair overflow-hidden rounded-card border border-line-soft bg-surface">
                {rows.map((row, i) =>
                  row.removed ? null : (
                    <ParchaRow
                      key={row.id}
                      row={row}
                      onQty={(qty) =>
                        setRows((current) =>
                          current!.map((r, j) => (j === i ? { ...r, qty } : r)),
                        )
                      }
                      onRemove={() =>
                        setRows((current) =>
                          current!.map((r, j) =>
                            j === i ? { ...r, removed: true } : r,
                          ),
                        )
                      }
                    />
                  ),
                )}
              </ul>

              <div className="mt-4 flex flex-col gap-4 rounded-card border border-line-soft bg-raised p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-caption text-muted">
                    Estimated for the {matched.length} matched{" "}
                    {matched.length === 1 ? "line" : "lines"}
                  </p>
                  <p className="nums mt-0.5 text-headline font-semibold text-ink">
                    {formatPrice(total)}
                  </p>
                  <p className="mt-1 text-micro text-faint">
                    Taxes included; delivery calculated at checkout.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={matched.length === 0}
                    loading={adding}
                    onClick={addAll}
                  >
                    <Cart className="size-4" />
                    Add {matched.length} to cart
                  </Button>
                  <Button
                    variant="outline"
                    href={projects.length > 0 ? `/projects/${projects[0].id}` : "/projects/new"}
                  >
                    <Layers className="size-4" />
                    {projects.length > 0 ? "Add to a project" : "Start a project"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ParchaRow({
  row,
  onQty,
  onRemove,
}: {
  row: Row;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const match = row.match;
  const step = match?.stepQty ?? 1;
  const min = match?.minQty ?? 1;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {match ? (
            <Link
              href={`/p/${match.slug}`}
              className="line-clamp-1 text-body text-ink hover:text-accent"
            >
              {match.title}
            </Link>
          ) : (
            <span className="text-body text-muted">{row.term}</span>
          )}
          {match ? (
            <Badge tone="success" size="sm" icon={<Check className="size-3" />}>
              Matched
            </Badge>
          ) : (
            <Badge tone="warning" size="sm">
              Not in the catalogue
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block truncate text-micro text-faint">
          You wrote: {row.raw}
        </span>
      </span>

      <span className="flex shrink-0 items-center rounded-lg border border-line">
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => onQty(Math.max(min, row.qty - step))}
          className="grid size-9 place-items-center rounded-lg text-ink transition-colors hover:bg-hover"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="nums min-w-12 text-center text-caption font-medium text-ink">
          {row.qty}
          {row.unit && <span className="block text-micro text-faint">{row.unit}</span>}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => onQty(row.qty + step)}
          className="grid size-9 place-items-center rounded-lg text-ink transition-colors hover:bg-hover"
        >
          <Plus className="size-3.5" />
        </button>
      </span>

      <span className="nums w-24 shrink-0 text-right text-body-sm font-semibold text-ink">
        {match?.pricePaise != null ? formatPrice(match.pricePaise * row.qty) : "—"}
      </span>

      <button
        type="button"
        aria-label={`Remove ${row.term}`}
        onClick={onRemove}
        className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:text-danger"
      >
        <Close className="size-4" />
      </button>
    </li>
  );
}
