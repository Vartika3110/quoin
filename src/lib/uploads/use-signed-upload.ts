"use client";

import { useCallback, useState } from "react";

/* Mirrors `MAX_UPLOAD_BYTES` and `ACCEPTED_PARCHA_TYPES` in
   src/lib/storage/index.ts, which cannot be imported here — it reads `env`
   and `node:crypto` and would drag both into the client bundle. The copy is
   only a pre-flight courtesy; the upload routes re-check both and decide. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * The three-request upload every customer file goes through, as one hook.
 *
 *  1. `POST /api/v1/uploads` mints a signed URL and a PENDING row.
 *  2. The browser PUTs the bytes straight to storage — they never touch
 *     this app's functions.
 *  3. `POST /api/v1/uploads/{id}/confirm` reads the object back and only
 *     then marks it STORED.
 *
 * Written once here, from the sequence `UploadIdea` already proved, because
 * service bookings and project documents both need it and two copies of a
 * three-step handshake is two places for step 3 to be forgotten — and a
 * file that is never confirmed can never be attached to anything.
 *
 * Returns the stored file's id; attaching it (to a project, a booking) is
 * the caller's next request.
 */

export type UploadKind = "PROJECT_DOCUMENT" | "SERVICE_DOCUMENT" | "PARCHA";

export const ACCEPTED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

export interface UploadedFile {
  fileId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "The upload could not be completed. Please try again.");
  }
  return json.data;
}

export function useSignedUpload(kind: UploadKind) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadedFile> => {
      setError(null);

      /* Checked here only to spare a pointless round trip; the server
         checks both again and is the one that decides. */
      if (!(ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
        const message = "Upload a PDF, a photo (JPG, PNG, WebP, HEIC), a spreadsheet or a CSV.";
        setError(message);
        throw new Error(message);
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        const message = "That file is larger than 25 MB.";
        setError(message);
        throw new Error(message);
      }

      setUploading(true);
      try {
        const created = await postJson<{
          fileId: string;
          uploadUrl: string;
          uploadHeaders: Record<string, string>;
        }>("/api/v1/uploads", {
          kind,
          contentType: file.type,
          sizeBytes: file.size,
          originalName: file.name,
        });

        const put = await fetch(created.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, ...created.uploadHeaders },
          body: file,
        });
        if (!put.ok) throw new Error("The upload did not complete. Please try again.");

        await postJson(`/api/v1/uploads/${created.fileId}/confirm`, {});

        return {
          fileId: created.fileId,
          originalName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        };
      } catch (problem) {
        const message =
          problem instanceof Error ? problem.message : "The upload could not be completed.";
        setError(message);
        throw problem instanceof Error ? problem : new Error(message);
      } finally {
        setUploading(false);
      }
    },
    [kind],
  );

  return { upload, uploading, error, clearError: () => setError(null) };
}
