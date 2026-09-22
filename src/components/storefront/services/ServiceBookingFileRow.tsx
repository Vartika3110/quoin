"use client";

import { useState } from "react";
import { Document } from "@/components/icons";

/**
 * One attached file, opened on demand.
 *
 * `GET /api/v1/uploads/{id}` mints a short-lived signed URL — the bucket
 * is private and nothing is ever served from a public one — so viewing a
 * file is always two requests: this route, then `window.open` on what it
 * returns. Never a bare `<a href>` to the file, which would have nothing
 * to point at.
 */
export function ServiceBookingFileRow({
  file,
}: {
  file: { id: string; originalName: string };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function view() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/v1/uploads/${file.id}`);
      const body = await res.json();
      if (!res.ok || !body?.data?.url) throw new Error();
      window.open(body.data.url, "_blank", "noopener");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={view}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong disabled:opacity-60"
    >
      <Document className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{file.originalName}</span>
      <span className="shrink-0 text-caption text-accent">
        {busy ? "Opening…" : error ? "Try again" : "View"}
      </span>
    </button>
  );
}
