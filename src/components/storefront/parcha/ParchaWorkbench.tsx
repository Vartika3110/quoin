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
  Refresh,
  Search,
  Sparkle,
  Upload,
} from "@/components/icons";
import { parseParcha, type ParchaLine } from "@/lib/parcha";
import {
  ImagePrepareError,
  MAX_PARCHA_FILE_BYTES,
  prepareImageForUpload,
} from "@/lib/parcha-image";
import { formatPrice } from "@/lib/types/catalog";
import { useCart } from "@/lib/store/cart";
import type { Product } from "@/lib/types/catalog";
import { useProjects } from "@/lib/store/projects";

/**
 * Upload Parcha.
 *
 * A parcha is the handwritten materials list that gets passed over a
 * counter. Turning one into a priced order is the single most useful
 * thing this product can do for a contractor, and there are now two ways
 * in, which meet in the same place:
 *
 *  - **Typing or pasting the list.** Every line is parsed, matched
 *    against the real catalogue, priced from real variants, and can be
 *    added to a cart or a project.
 *  - **Attaching a photograph or a PDF.** The file is posted to
 *    `POST /api/v1/parcha/extract`, which reads it with a vision model
 *    server-side and answers with the materials as *text* — one per line,
 *    in the shape someone would have typed.
 *
 * The second path deliberately stops at the textarea rather than going
 * straight to a price. What a model read off a photograph of handwriting
 * is a claim, not a measurement, and a contractor about to spend real
 * money is entitled to see it as editable text before anything is priced
 * or added to a cart. So extraction *fills the box a typed list lives
 * in*, the customer reads it, and from there the flow is byte-identical
 * to having typed it themselves.
 *
 * Everything that can fail says so plainly and leaves the typed text
 * alone: a failed read must never cost someone the list they had already
 * written. When no reader is configured at all — no `OPENAI_API_KEY` —
 * the route says so, and the "send it to an expert" path below is still
 * there, which is what this page did before any of this existed.
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

/**
 * One attached file and what became of it.
 *
 * Status is per file rather than one flag for the whole workbench: a
 * customer can attach three pages, have two read and one fail, and needs
 * to see which one to photograph again.
 */
interface Attachment {
  id: string;
  file: File;
  status: "queued" | "reading" | "read" | "manual" | "failed";
  /** A short line under the filename — "6 items read", or why not. */
  detail: string | null;
}

const MAX_FILE_MB = MAX_PARCHA_FILE_BYTES / 1024 / 1024;
const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.csv";

/** At most six files per submission, unchanged — a parcha is a page or
    two, and a folder dropped by accident should not become six model
    calls. */
const MAX_FILES = 6;

const NETWORK_MESSAGE =
  "We could not reach Quoin to read that file. Check your connection and try again.";
const HEIC_MESSAGE =
  "This browser cannot open that iPhone photo. Try it from your phone, or save it as JPG first.";
const HUGE_PHOTO_MESSAGE =
  "That photo is too large to send even after shrinking. Try photographing one page at a time.";

export function ParchaWorkbench() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  /** The file being read right now, so the dropzone can name it. */
  const [reading, setReading] = useState<string | null>(null);
  /** "We've extracted 6 items…" — cleared as soon as anything else
      happens, so it can never describe a previous file. */
  const [extracted, setExtracted] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  /* A second input, because `capture` is an attribute of the input rather
     than of the click. One input cannot both open the gallery and open the
     camera, and toggling the attribute between clicks is a race on iOS. */
  const cameraInput = useRef<HTMLInputElement>(null);
  /* Guards against a second batch starting while one is in flight — the
     buttons are disabled during a read, but a drop is not a button. */
  const runningRef = useRef(false);
  /* Only ever incremented, so two files chosen in the same millisecond
     still get distinct React keys. */
  const nextId = useRef(0);

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

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  /**
   * Reads one attachment and appends what it found to the textarea.
   *
   * Appends rather than replaces, always. The customer may have typed
   * half the list before reaching for the camera, and the second half
   * arriving must not delete the first. It is also why nothing here
   * clears `text` on failure — see the note at the top of this file.
   *
   * Returns how many items were read, or null if this file did not
   * produce any, so the caller can report one total for the batch rather
   * than a toast per page.
   */
  const readOne = useCallback(
    async (entry: Attachment): Promise<number | null> => {
      patch(entry.id, { status: "reading", detail: null });
      setReading(entry.file.name);

      /* HEIC conversion and downscaling happen here, in the browser: it
         is the only place with a decoder for an iPhone's photo, and the
         result has to fit inside a serverless request body. See
         `src/lib/parcha-image.ts`. */
      let payload: File;
      try {
        payload = await prepareImageForUpload(entry.file);
      } catch (cause) {
        const message =
          cause instanceof ImagePrepareError && cause.reason === "too_large"
            ? HUGE_PHOTO_MESSAGE
            : HEIC_MESSAGE;
        patch(entry.id, { status: "manual", detail: message });
        setReadError(message);
        return null;
      }

      const form = new FormData();
      /* No `Content-Type` header: the browser has to set it itself so it
         can include the multipart boundary. */
      form.append("file", payload, payload.name);

      let res: Response;
      try {
        res = await fetch("/api/v1/parcha/extract", { method: "POST", body: form });
      } catch {
        patch(entry.id, { status: "failed", detail: NETWORK_MESSAGE });
        setReadError(NETWORK_MESSAGE);
        return null;
      }

      /* The error envelope carries a sentence written for a customer —
         see `MESSAGE` in the extract route — so it is shown as-is. A body
         that is not the envelope at all (a platform 413 or 504 page) has
         no such sentence, hence the fallback. */
      let body: {
        data?: { text?: string; itemCount?: number };
        error?: { message?: string };
      };
      try {
        body = await res.json();
      } catch {
        body = {};
      }

      if (!res.ok || typeof body.data?.text !== "string") {
        const message =
          body.error?.message ??
          "We could not read that file just now. Try again, or type the list below.";
        /* A file a person still has to read is not a failure of the
           upload — it is the older path this page has always had, so it
           is styled as a note rather than as an error. */
        patch(entry.id, { status: res.status === 409 ? "manual" : "failed", detail: message });
        setReadError(message);
        return null;
      }

      const found = body.data.text.trim();
      const count = body.data.itemCount ?? parseParcha(found).length;

      setText((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n${found}` : found));
      patch(entry.id, {
        status: "read",
        detail: `${count} ${count === 1 ? "item" : "items"} read`,
      });
      return count;
    },
    [patch],
  );

  /**
   * Takes newly chosen files, then reads them one after another.
   *
   * Sequential rather than parallel: six pages at once is six concurrent
   * model calls for one customer, and the second page finishing before
   * the first would interleave the lines out of order in the textarea.
   *
   * Oversized files are reported rather than dropped. Silently discarding
   * a file the customer watched themselves select is the version of this
   * that generates a support call.
   */
  const onFiles = useCallback(
    async (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;
      if (runningRef.current) return;

      const tooBig: string[] = [];
      const accepted: Attachment[] = [];

      for (const file of Array.from(incoming)) {
        if (file.size > MAX_PARCHA_FILE_BYTES) {
          tooBig.push(file.name);
          continue;
        }
        accepted.push({
          id: `f${nextId.current++}`,
          file,
          status: "queued",
          detail: null,
        });
      }

      setExtracted(null);
      setReadError(
        tooBig.length > 0
          ? `${tooBig.join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${MAX_FILE_MB}MB. Try photographing one page at a time.`
          : null,
      );

      if (accepted.length === 0) return;

      /* Read from the rendered `files` rather than from inside a
         `setFiles` updater: an updater does not run synchronously, so a
         count taken there is always the previous render's, and the queue
         built from it would be wrong on the very first drop. */
      const queue = accepted.slice(0, Math.max(0, MAX_FILES - files.length));
      if (queue.length === 0) return;
      setFiles((current) => [...current, ...queue]);

      runningRef.current = true;
      let total = 0;
      let any = false;
      try {
        for (const entry of queue) {
          const count = await readOne(entry);
          if (count != null) {
            total += count;
            any = true;
          }
        }
      } finally {
        runningRef.current = false;
        setReading(null);
      }

      /* `readError` is deliberately not cleared here. One page of three
         failing while the other two are read is both a count and an
         error, and showing only the happier of the two would hide the
         page that still needs photographing again. */
      if (any) setExtracted(total);
    },
    [files.length, readOne],
  );

  /** Re-reads a file that failed, without making the customer find it on
      their phone again — the `File` handle is still held. */
  const retry = useCallback(
    async (entry: Attachment) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setReadError(null);
      setExtracted(null);
      try {
        const count = await readOne(entry);
        if (count != null) setExtracted(count);
      } finally {
        runningRef.current = false;
        setReading(null);
      }
    },
    [readOne],
  );

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
  const needsPerson = files.some((f) => f.status === "manual");

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- input */}
      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-line-hair px-5 py-4">
          <h2 className="font-display text-title-sm font-semibold text-ink">
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
        <div className="relative">
          <textarea
            id="parcha"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={"Cement 40 bags\nSteel 250 kg\nWhite emulsion 18 ltr\nJaquar shower head"}
            className="w-full resize-y bg-surface px-5 py-4 font-mono text-body leading-relaxed text-ink outline-none placeholder:text-faint"
          />
          {/* Sits over the textarea rather than above it so the box does
              not jump the moment a file is chosen, and so the lines can be
              watched arriving in the place they will be edited. */}
          {reading && (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-5 bottom-3 flex items-center gap-2 rounded-lg border border-line-soft bg-raised/95 px-3 py-2 text-caption text-muted shadow-xs"
            >
              <Spinner className="size-3.5" />
              <span className="min-w-0 truncate">
                Reading your parcha — {reading}
              </span>
            </p>
          )}
        </div>

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

      {/* What the file actually produced, stated next to the box it
          landed in. Not a toast: the instruction is to review the list,
          and an instruction that disappears after four seconds is not
          one. */}
      {extracted != null && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent-wash px-3 py-2 text-caption text-accent"
        >
          <Sparkle className="mt-0.5 size-4 shrink-0" />
          <span>
            We&rsquo;ve extracted {extracted} {extracted === 1 ? "item" : "items"}.
            Please review before pricing.
          </span>
        </p>
      )}

      {readError && <InlineError>{readError}</InlineError>}
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
            void onFiles(e.dataTransfer.files);
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
            PDF, image, spreadsheet — up to {MAX_FILE_MB}MB each. We read the
            whole document and{" "}
            <span className="text-ink">
              put the list in the box above for you to check
            </span>{" "}
            before anything is priced.
          </p>

          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPTED}
            onChange={(e) => {
              void onFiles(e.target.files);
              /* Cleared so choosing the same file twice — after a failed
                 read — still fires `change`. */
              e.target.value = "";
            }}
            className="sr-only"
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            /* Opens the rear camera directly on a phone rather than the
               photo library — which is the whole point of "scan": the
               parcha is on the counter in front of you, not in the gallery.
               Ignored on a desktop, where it falls back to a file picker.
               The captured photo goes to the same endpoint a chosen file
               does; there is no second path for the camera. */
            capture="environment"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            className="sr-only"
          />

          <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            {/* Camera first on a phone: scanning the paper is the thing
                someone standing at a counter came here to do. */}
            <Button
              onClick={() => cameraInput.current?.click()}
              loading={reading != null}
              disabled={reading != null || files.length >= MAX_FILES}
            >
              <Camera className="size-4" />
              Scan the parcha
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={reading != null || files.length >= MAX_FILES}
            >
              <Document className="size-4" />
              Choose a file
            </Button>
          </div>

          {files.length >= MAX_FILES && (
            <p className="mt-3 text-micro text-faint">
              That is {MAX_FILES} files — remove one to add another.
            </p>
          )}
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-line-hair">
            {files.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                {entry.status === "reading" ? (
                  <Spinner className="size-4 shrink-0 text-muted" />
                ) : (
                  <Document className="size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm text-ink">
                    {entry.file.name}
                  </span>
                  {entry.detail && (
                    <span
                      className={cn(
                        "mt-0.5 block text-micro",
                        entry.status === "read"
                          ? "text-success"
                          : entry.status === "failed"
                            ? "text-danger"
                            : "text-faint",
                      )}
                    >
                      {entry.detail}
                    </span>
                  )}
                </span>
                <span className="nums shrink-0 text-micro text-faint">
                  {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {entry.status === "failed" && (
                  <button
                    type="button"
                    aria-label={`Read ${entry.file.name} again`}
                    onClick={() => void retry(entry)}
                    disabled={reading != null}
                    className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-accent disabled:opacity-40"
                  >
                    <Refresh className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${entry.file.name}`}
                  onClick={() => setFiles((c) => c.filter((f) => f.id !== entry.id))}
                  disabled={entry.status === "reading"}
                  className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-danger disabled:opacity-40"
                >
                  <Close className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The path this page has always had, kept for the files a model
            cannot read — a spreadsheet, a scan too faint to make out, or
            a deploy with no reader configured at all. */}
        {needsPerson && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-hair bg-raised px-5 py-3">
            <p className="text-micro text-muted">
              Some of these need a person. Send them with your contact details
              and we will price them by hand.
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
              <h2 className="font-display text-title font-semibold text-ink">Priced list</h2>
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
        {/* Only where it says something the line above does not. A
            matched row shows a catalogue product name, so the customer's
            own words are worth keeping in view — that is how they check
            "Ambuja Cement 50kg" really is the "Cement 40 bags" they
            asked for. An unmatched row already *is* their own words, and
            repeating them under themselves reads as a bug. */}
        {match && (
          <span className="mt-0.5 block truncate text-micro text-faint">
            You wrote: {row.raw}
          </span>
        )}
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
