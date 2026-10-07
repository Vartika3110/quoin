"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "@/components/icons";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { ImagePrepareError, prepareImageForUpload } from "@/lib/parcha-image";

/**
 * Search by photograph.
 *
 * A camera button beside the microphone. Pressing it opens the phone's
 * camera or photo library (`accept="image/*"` offers both on a phone, and
 * a file picker on a desktop), the photo is sent to
 * `POST /api/v1/search/photo`, and what comes back is a handful of plain
 * search words — which the palette drops into its own box, so the results
 * are ordinary catalogue results. Nothing is recommended by the model.
 *
 * Like `VoiceSearch`, it **renders nothing where it cannot work**. Whether
 * the server has a vision key is asked once per page load with a free
 * `GET`; until the answer is "yes" there is no button, rather than a
 * button that fails when pressed.
 */

export interface PhotoSearchResult {
  description: string;
  terms: string[];
}

/* One answer per page load, shared by every mount. `null` = not asked. */
let enabledCache: boolean | null = null;
let enabledRequest: Promise<boolean> | null = null;

function probeEnabled(): Promise<boolean> {
  if (enabledCache !== null) return Promise.resolve(enabledCache);
  enabledRequest ??= fetch("/api/v1/search/photo")
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => Boolean(body?.data?.enabled))
    .catch(() => false)
    .then((value) => {
      enabledCache = value;
      return value;
    });
  return enabledRequest;
}

export function PhotoSearch({
  onResult,
  onError,
  className,
}: {
  onResult: (result: PhotoSearchResult) => void;
  /** A sentence written for the customer. */
  onError: (message: string) => void;
  className?: string;
}) {
  const [enabled, setEnabled] = useState(enabledCache === true);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void probeEnabled().then((value) => live && setEnabled(value));
    return () => {
      live = false;
    };
  }, []);

  if (!enabled) return null;

  async function send(file: File) {
    setBusy(true);
    try {
      const prepared = await prepareImageForUpload(file);
      const form = new FormData();
      form.append("file", prepared);

      const response = await fetch("/api/v1/search/photo", { method: "POST", body: form });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        onError(
          body?.error?.message ?? "We could not read that photo. Try again, or type your search.",
        );
        return;
      }
      onResult(body.data as PhotoSearchResult);
    } catch (error) {
      onError(
        error instanceof ImagePrepareError
          ? "This browser cannot open that kind of photo. Try a JPG or PNG."
          : "We could not send that photo. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
      /* Lets the same photo be chosen twice in a row. */
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={busy ? "Reading your photo" : "Search with a photo"}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Spinner className="size-4" /> : <Camera className="size-5" />}
      </button>
    </>
  );
}
