"use client";

import { useCallback, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Camera, Close, Download, Info, Sparkle, Upload } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { ImagePrepareError, isImageFile, prepareImageForUpload } from "@/lib/parcha-image";
import {
  addRoomRender,
  removeRoomRender,
  setRoomPhoto,
  useRoomPreview,
} from "@/lib/store/room-preview";

/**
 * "See it in your space" — the product page's room preview.
 *
 * A customer choosing floor tiles is being asked to commit four figures
 * to a 50mm sample held under a showroom light. This is the honest
 * version of answering that: their own photograph, the product they are
 * considering, and a rendering of the two together.
 *
 * ## What it says about itself
 *
 * Every render carries `disclaimer` from the API, on the image, in the
 * drawer, and on the download. It is an impression, not a proof, and the
 * component never implies otherwise — no "see exactly how it looks", no
 * colour-match language. The catalogue already labels its illustrated
 * products for the same reason: a render a customer mistakes for a
 * guarantee is a returned order.
 *
 * It also distinguishes the two cases a customer cannot tell apart by
 * looking: a render built from Quoin's own photograph of the product, and
 * one built from its description because the catalogue has no photograph
 * of it. `fromProductPhoto` is what separates them.
 *
 * ## Comparison is the point
 *
 * The photograph and the renders live in `src/lib/store/room-preview.ts`,
 * which survives client-side navigation. So the second tile is one tap —
 * "use the same photo" — and the renders from every product visited this
 * session sit in a strip at the bottom of the drawer to be compared
 * against each other. Nothing is persisted anywhere, in the browser or on
 * the server; see that module and the route for why.
 */

/** Mirrors `Placement` in `src/lib/ai/visualise.ts`. Duplicated rather
    than imported because that module constructs the OpenAI client, which
    reads `env` and must never be bundled for the browser. */
const PLACEMENTS = [
  { id: "floor", label: "Floor", hint: "Tiles, stone, wood, vinyl" },
  { id: "wall", label: "Wall", hint: "Wall tiles, cladding, paint" },
  { id: "ceiling", label: "Ceiling", hint: "False ceiling, ceiling lights" },
  { id: "worktop", label: "Counter", hint: "Worktops, sinks, hobs" },
  { id: "in_place", label: "In the room", hint: "Taps, lights, fittings" },
] as const;

interface RenderResponse {
  image: string;
  placement: string;
  disclaimer: string;
  fromProductPhoto: boolean;
}

export function RoomPreview({
  slug,
  title,
  defaultPlacement,
}: {
  slug: string;
  title: string;
  /** Guessed from the department — see `defaultPlacement` in
      `src/lib/ai/eligibility.ts`. The customer can change it. */
  defaultPlacement: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="md" onClick={() => setOpen(true)} className="w-full">
        <Sparkle className="size-4.5" />
        See it in your space
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="responsive"
        title="See it in your space"
        description={`Photograph the room and we will show you ${title} in it.`}
        className="lg:w-[38rem]"
      >
        {/* Unmounted when closed — `Drawer` returns null — so the work in
            progress is not held open behind a closed sheet. The renders
            themselves outlive it, in the store. */}
        <PreviewWorkbench slug={slug} title={title} defaultPlacement={defaultPlacement} />
      </Drawer>
    </>
  );
}

function PreviewWorkbench({
  slug,
  title,
  defaultPlacement,
}: {
  slug: string;
  title: string;
  defaultPlacement: string;
}) {
  const { photo, renders } = useRoomPreview();
  const [placement, setPlacement] = useState(defaultPlacement);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<RenderResponse | null>(null);
  const input = useRef<HTMLInputElement>(null);

  /* Only this product's renders belong in the "latest" slot, but the
     comparison strip shows everything from this visit — that is what
     makes it a comparison rather than a history. */
  const mine = renders.filter((r) => r.productSlug === slug);

  const pick = useCallback(async (file: File) => {
    setError(null);
    try {
      /* Re-encoded in the browser: a phone photograph is 4-8MB and the
         platform refuses a body much past 4.5MB. Also converts HEIC,
         which the image model will not read. */
      const prepared = isImageFile(file) ? await prepareImageForUpload(file) : file;
      const url = URL.createObjectURL(prepared);

      /* The room's shape, measured here because the server would
         otherwise need a native image decoder to learn it — and a
         landscape room rendered square is a room with its sides cropped
         off. See `orientationOf`. */
      const size = await measure(url);
      setRoomPhoto({ url, file: prepared, width: size.width, height: size.height });
      setLatest(null);
    } catch (cause) {
      setError(
        cause instanceof ImagePrepareError
          ? cause.message
          : "We could not read that photo. Try another one.",
      );
    }
  }, []);

  const render = useCallback(async () => {
    const current = photo;
    if (!current) return;

    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("room", current.file);
      body.append("slug", slug);
      body.append("placement", placement);
      body.append("width", String(current.width));
      body.append("height", String(current.height));
      if (note.trim()) body.append("note", note.trim());

      const response = await fetch("/api/v1/visualise", { method: "POST", body });
      const payload = (await response.json()) as
        | { data: RenderResponse }
        | { error: { message: string } };

      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload
            ? payload.error.message
            : "We could not produce a preview. Try again in a moment.",
        );
        return;
      }

      setLatest(payload.data);
      addRoomRender({
        productSlug: slug,
        productTitle: title,
        image: payload.data.image,
        placement: payload.data.placement,
        fromProductPhoto: payload.data.fromProductPhoto,
      });
    } catch {
      setError("We could not reach Quoin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [photo, slug, title, placement, note]);

  return (
    <div className="space-y-5">
      {/* ---- 1. Where it goes ------------------------------------------ */}
      <section className="space-y-2">
        <h3 className="text-caption font-semibold text-ink">Where should it go?</h3>
        <div className="flex flex-wrap gap-2">
          {PLACEMENTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPlacement(option.id)}
              aria-pressed={placement === option.id}
              title={option.hint}
              className={cn(
                "rounded-full border px-3 py-1.5 text-caption transition-colors",
                placement === option.id
                  ? "border-accent bg-accent-wash font-medium text-accent"
                  : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---- 2. The photograph ----------------------------------------- */}
      <section className="space-y-2">
        <h3 className="text-caption font-semibold text-ink">Your photo</h3>

        {photo ? (
          <div className="flex items-start gap-3 rounded-card border border-line-soft bg-raised p-3">
            {/* A plain `img`: this is a blob URL for bytes that exist only
                in this tab, so there is nothing for the optimiser to
                fetch, resize or cache. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt="The room you are previewing"
              className="size-20 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-caption text-ink">Using this photo.</p>
              <p className="text-micro text-muted">
                It stays in this tab only — we do not upload or keep it.
              </p>
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="text-micro font-medium text-accent hover:underline"
              >
                Use a different photo
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => input.current?.click()}
                className="w-full"
              >
                <Camera className="size-4.5" />
                Take a photo
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => input.current?.click()}
                className="w-full"
              >
                <Upload className="size-4.5" />
                Choose a photo
              </Button>
            </div>
            <ul className="space-y-1 pt-1">
              {[
                "Stand back and get the whole floor or wall in frame.",
                "Daylight if you can — the preview copies your lighting.",
                "Keep the camera straight on rather than at a sharp angle.",
              ].map((line) => (
                <li key={line} className="flex gap-2 text-micro text-muted">
                  <span aria-hidden className="text-accent">
                    •
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </>
        )}

        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            /* Cleared so picking the same file twice fires `change` again
               — without this, retrying after a failure does nothing. */
            e.target.value = "";
            if (file) void pick(file);
          }}
        />
      </section>

      {/* ---- 3. Anything to add ---------------------------------------- */}
      {photo && (
        <section className="space-y-2">
          <label htmlFor="room-note" className="text-caption font-semibold text-ink">
            Anything we should know? <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="room-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={160}
            placeholder="e.g. only the area in front of the window"
            className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-body text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        </section>
      )}

      {photo && (
        <Button
          variant="primary"
          size="lg"
          onClick={() => void render()}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <>
              <Spinner className="size-4.5" />
              Rendering — this takes up to a minute
            </>
          ) : (
            <>
              <Sparkle className="size-4.5" />
              {mine.length > 0 ? "Render again" : "Show me"}
            </>
          )}
        </Button>
      )}

      {error && (
        <p
          role="status"
          className="rounded-card border border-danger/30 bg-danger-wash px-4 py-3 text-caption text-danger"
        >
          {error}
        </p>
      )}

      {/* ---- 4. The render --------------------------------------------- */}
      {latest && (
        <section className="space-y-2">
          <div className="overflow-hidden rounded-card border border-line-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.image} alt={`${title} shown in your room`} className="w-full" />
          </div>

          <p className="flex gap-2 text-micro text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <span>
              {latest.disclaimer}
              {!latest.fromProductPhoto && (
                <>
                  {" "}
                  We have no photograph of this particular product, so the preview is drawn from
                  its description — treat the pattern as a stand-in.
                </>
              )}
            </span>
          </p>

          <a
            href={latest.image}
            download={`quoin-preview-${slug}.webp`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-accent hover:underline"
          >
            <Download className="size-4" />
            Save this preview
          </a>
        </section>
      )}

      {/* ---- 5. Compare ------------------------------------------------ */}
      {renders.length > 1 && (
        <section className="space-y-2 border-t border-line-soft pt-4">
          <h3 className="text-caption font-semibold text-ink">
            Compare what you have tried
          </h3>
          <p className="text-micro text-muted">
            Everything you have previewed this visit, against the same photo. Reloading the
            page clears it.
          </p>
          <div className="rail gap-3 pb-1">
            {renders.map((entry) => (
              <figure key={entry.id} className="w-40 shrink-0 space-y-1">
                <div className="relative overflow-hidden rounded-lg border border-line-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.image}
                    alt={`${entry.productTitle} in your room`}
                    className="aspect-4/3 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeRoomRender(entry.id)}
                    aria-label={`Remove the ${entry.productTitle} preview`}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-scrim text-on-accent"
                  >
                    <Close className="size-3.5" />
                  </button>
                </div>
                <figcaption
                  className={cn(
                    "truncate text-micro",
                    entry.productSlug === slug ? "font-medium text-ink" : "text-muted",
                  )}
                  title={entry.productTitle}
                >
                  {entry.productTitle}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The pixel dimensions of a chosen photograph.
 *
 * Resolves to a square on failure rather than rejecting: a shape this
 * could not measure is a worse reason to refuse the whole render than it
 * is to render at the default shape.
 */
function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 1024, height: 1024 });
    image.src = url;
  });
}
