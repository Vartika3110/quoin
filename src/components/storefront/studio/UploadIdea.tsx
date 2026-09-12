"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { Camera, Close, Plus, Upload } from "@/components/icons";
import {
  ImagePrepareError,
  isImageFile,
  prepareImageForUpload,
} from "@/lib/parcha-image";
import { ROOMS, ROOM_LABEL, type StudioRoom, type Swatch } from "@/lib/types/studio";

/**
 * Adding a photograph to Studio.
 *
 * Quoin owns no interiors photography, so the feed is what people put in
 * it. That makes this page the supply side of the whole feature, and it
 * has to be short enough that somebody who has just finished a kitchen
 * actually completes it: an image, a title, and everything else optional.
 *
 * ## The upload path
 *
 * Identical to a parcha's, and reusing its parts rather than growing a
 * second one:
 *
 *  1. `prepareImageForUpload` re-encodes and shrinks it in the browser —
 *     a phone's 12MP HEIC becomes a JPEG a few hundred kilobytes wide.
 *  2. `POST /api/v1/uploads` mints a signed URL. The bytes never touch
 *     this server; Vercel caps a request body at about 4.5MB and a photo
 *     of a room routinely exceeds it.
 *  3. The browser PUTs straight to the bucket.
 *  4. `POST /api/v1/uploads/{id}/confirm` reads the object back and
 *     checks its real size and type before the row is trusted.
 *  5. `POST /api/v1/studio/ideas` records the idea.
 *
 * ## Dimensions and the blur
 *
 * Both are measured here, from the prepared file, and sent with the idea.
 * The masonry grid needs the aspect ratio before the bytes arrive, and
 * the blur is a 16px thumbnail drawn to a canvas — a tenth of a
 * kilobyte of data URI that turns a grey box into the photograph's own
 * colour while it loads.
 *
 * ## Colours
 *
 * Typed, and labelled as typed. This is the form section 12 wants an
 * image-analysis pass to fill in later; until something actually looks at
 * a photograph, the swatches are the uploader's own and the page says so.
 */
const MAX_COLOURS = 6;

export function UploadIdea() {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [blur, setBlur] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [room, setRoom] = useState<StudioRoom | "">("");
  const [styles, setStyles] = useState("");
  const [materials, setMaterials] = useState("");
  const [colors, setColors] = useState<Swatch[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(picked: File | undefined) {
    if (!picked) return;
    setError(null);

    if (!isImageFile(picked)) {
      setError("That is not an image. JPEG, PNG, WebP or HEIC.");
      return;
    }

    try {
      const prepared = await prepareImageForUpload(picked);
      const measured = await measure(prepared);

      setFile(prepared);
      setDimensions({ width: measured.width, height: measured.height });
      setBlur(measured.blur);
      /* Revoked when it is replaced or the page leaves — an object URL
         held for a session's worth of uploads leaks the whole file. */
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(prepared);
      });
    } catch (problem) {
      setError(
        problem instanceof ImagePrepareError
          ? problem.message
          : "The browser could not read that image.",
      );
    }
  }

  async function submit() {
    if (!file || !dimensions || !title.trim()) return;

    setBusy(true);
    setError(null);

    try {
      setStep("Preparing the upload");
      const created = await post<{
        fileId: string;
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
      }>("/api/v1/uploads", {
        kind: "STUDIO_IDEA",
        contentType: file.type,
        sizeBytes: file.size,
        originalName: file.name,
      });

      setStep("Uploading");
      const put = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type, ...created.uploadHeaders },
        body: file,
      });
      if (!put.ok) throw new Error("The upload did not complete. Please try again.");

      setStep("Checking the file");
      await post(`/api/v1/uploads/${created.fileId}/confirm`, {});

      setStep("Saving");
      const { idea } = await post<{ idea: { slug: string } }>("/api/v1/studio/ideas", {
        title: title.trim(),
        description: description.trim(),
        fileId: created.fileId,
        width: dimensions.width,
        height: dimensions.height,
        ...(blur ? { blurDataUrl: blur } : {}),
        ...(room ? { room } : {}),
        styles: splitTags(styles),
        materials: splitTags(materials),
        colors,
        visibility: isPublic ? "public" : "private",
      });

      toast.success("Added to Studio");
      router.push(`/studio/idea/${idea.slug}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
      setBusy(false);
      setStep(null);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />

      {preview && dimensions ? (
        <div className="relative overflow-hidden rounded-card border border-line-soft bg-sunk">
          {/* A local object URL of a file this browser just made — there
              is nothing for next/image to optimise and no remote pattern
              to allow. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The photograph you are adding"
            className="max-h-96 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            /* `bg-surface/90`, not `bg-plate`: this floats over whatever
               photograph was just chosen, and the 7%-opacity dark-mode
               `plate` gives almost no separation from a light room photo.
               `tap-target` covers the gap between the pill's own height
               and 44px without redrawing it. */
            className="tap-target absolute right-2 top-2 flex min-h-9 items-center gap-1.5 rounded-full border border-line-soft bg-surface/90 px-3 text-caption font-medium text-ink shadow-sm backdrop-blur-sm hover:bg-surface"
          >
            <Camera className="size-3.5" />
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 text-center transition-colors hover:border-accent hover:bg-accent-wash"
        >
          <span className="grid size-12 place-items-center rounded-full bg-accent-wash text-accent">
            <Upload className="size-5" />
          </span>
          <span className="text-body font-medium text-ink">
            Choose a photograph
          </span>
          <span className="max-w-sm text-body-sm text-muted">
            A room you have finished, or one you are working on. It is resized
            in your browser before anything is sent.
          </span>
        </button>
      )}

      {error ? <InlineError>{error}</InlineError> : null}

      <Field label="Title" htmlFor="idea-title" required>
        <Input
          id="idea-title"
          value={title}
          maxLength={120}
          placeholder="Warm minimal kitchen in oak and brass"
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="idea-description" hint="Optional.">
        <Textarea
          id="idea-description"
          rows={3}
          value={description}
          maxLength={600}
          placeholder="What was used, what it cost, what you would do differently."
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <Field label="Room" htmlFor="idea-room">
        <Select
          id="idea-room"
          value={room}
          onChange={(event) => setRoom(event.target.value as StudioRoom | "")}
        >
          <option value="">Not saying</option>
          {ROOMS.map((value) => (
            <option key={value} value={value}>
              {ROOM_LABEL[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Styles"
        htmlFor="idea-styles"
        hint="Comma separated — modern, minimal, japandi."
      >
        <Input
          id="idea-styles"
          value={styles}
          onChange={(event) => setStyles(event.target.value)}
        />
      </Field>

      <Field
        label="Materials"
        htmlFor="idea-materials"
        hint="Comma separated. These are what Shop this look searches the catalogue for, so real names help — oak, marble, brass."
      >
        <Input
          id="idea-materials"
          value={materials}
          onChange={(event) => setMaterials(event.target.value)}
        />
      </Field>

      <ColourPicker colors={colors} onChange={setColors} />

      <Card tone="sunk" padding="md">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--quoin-accent)]"
          />
          <span>
            <span className="block text-body font-medium text-ink">
              Show this in the public feed
            </span>
            <span className="block text-caption text-muted">
              Anyone can see it and save it. Turn this off and it stays in your
              own Studio only.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          size="lg"
          onClick={submit}
          disabled={busy || !file || !title.trim()}
        >
          {busy ? <Spinner className="size-4" /> : null}
          {busy ? (step ?? "Working") : "Add to Studio"}
        </Button>
        <Button href="/studio" variant="ghost" size="lg">
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ColourPicker({
  colors,
  onChange,
}: {
  colors: Swatch[];
  onChange: (next: Swatch[]) => void;
}) {
  const [hex, setHex] = useState("#d9c9b4");
  const [name, setName] = useState("");

  function add() {
    const label = name.trim();
    if (!label || colors.length >= MAX_COLOURS) return;
    onChange([...colors, { hex: hex.toLowerCase(), name: label }]);
    setName("");
  }

  return (
    <div>
      <p className="text-body font-medium text-ink">Colours</p>
      <p className="mt-0.5 text-caption text-muted">
        {/* Section 41: no pretending. Nothing in this app has looked at
            the photograph, and the page must not imply it has. */}
        Picked by you, not read from the image.
      </p>

      {colors.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {colors.map((colour, index) => (
            <li
              key={`${colour.hex}-${index}`}
              className="flex items-center gap-2 rounded-full border border-line-soft bg-surface py-1 pl-1.5 pr-1"
            >
              <span
                className="size-5 rounded-full border border-line-soft"
                style={{ backgroundColor: colour.hex }}
                aria-hidden
              />
              <span className="text-body-sm text-ink">{colour.name}</span>
              <button
                type="button"
                onClick={() => onChange(colors.filter((_, i) => i !== index))}
                aria-label={`Remove ${colour.name}`}
                /* 24px drawn, so the pill row stays compact; `tap-target`
                   is what makes it a legal touch target anyway. */
                className="tap-target relative grid size-6 place-items-center rounded-full text-faint hover:bg-danger-wash hover:text-danger"
              >
                <Close className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {colors.length < MAX_COLOURS ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={hex}
            aria-label="Pick a colour"
            onChange={(event) => setHex(event.target.value)}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-1"
          />
          <Input
            value={name}
            maxLength={40}
            placeholder="Warm beige"
            aria-label="Name this colour"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button
            variant="outline"
            onClick={add}
            disabled={!name.trim()}
            aria-label="Add this colour"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Reads the `{ data }` envelope, throwing the server's own message. */
async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(parsed?.error?.message ?? "Something went wrong. Please try again.");
  }
  return parsed?.data as T;
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * The photograph's real dimensions, and a blurred thumbnail of it.
 *
 * Both come off the same decode, so the file is read once. The thumbnail
 * is 16px on its longest edge and encoded at low quality — a data URI of
 * a few hundred bytes, which is small enough to inline into every card in
 * a forty-tile grid without the markup costing more than the images.
 */
async function measure(
  file: File,
): Promise<{ width: number; height: number; blur: string | null }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The browser could not read that image"));
      element.src = url;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;

    let blur: string | null = null;
    try {
      const scale = 16 / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL("image/jpeg", 0.5);
        /* Capped to match the route's own limit. A browser that produces
           something larger gets no placeholder rather than a rejected
           upload. */
        if (encoded.length <= 4000) blur = encoded;
      }
    } catch {
      /* A tainted canvas or a browser without `toDataURL` costs the
         placeholder and nothing else. */
    }

    return { width, height, blur };
  } finally {
    URL.revokeObjectURL(url);
  }
}
