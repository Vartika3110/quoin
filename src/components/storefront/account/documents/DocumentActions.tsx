"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InlineError } from "@/components/ui/ErrorState";
import { Trash } from "@/components/icons";
import { track } from "@/lib/analytics";
import type { DocumentCategory, DocumentRow } from "@/lib/data/documents";

/**
 * View, Download and Delete for one document row.
 *
 * `viewHref` and `fileId` are never both set on a row this app produces
 * (see `listDocumentsForUser`) — an order summary or a quotation opens its
 * own account page, a stored file has no page of its own to open — so
 * "View" is one of two different actions depending on which the row has,
 * never both: a plain navigation for the first, a signed URL fetched on
 * demand for the second. Download repeats the same fetch rather than a
 * second code path, because the object this app hands back is a signed
 * URL to private storage either way; there is no separate "download"
 * response to ask the server for, and a `download` attribute on a
 * cross-origin link like this one is ignored by the browser regardless.
 */
export function DocumentActions({
  category,
  viewHref,
  fileId,
  canDelete,
  deleteTarget,
}: {
  category: DocumentCategory;
  viewHref: DocumentRow["viewHref"];
  fileId: DocumentRow["fileId"];
  canDelete: boolean;
  deleteTarget?: DocumentRow["deleteTarget"];
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function openFile() {
    if (!fileId) return;
    setOpening(true);
    setOpenError(null);
    try {
      const res = await fetch(`/api/v1/uploads/${fileId}`);
      const body = (await res.json().catch(() => null)) as
        | { data?: { url: string }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? "Could not open that file.");
      track("document_viewed", { category });
      window.open(body.data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open that file.");
    } finally {
      setOpening(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/v1/projects/${deleteTarget.projectId}/documents/${deleteTarget.fileId}`,
        { method: "DELETE" },
      );
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not remove that document.");
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not remove that document.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {viewHref && (
        <Button
          href={viewHref}
          size="sm"
          variant="outline"
          onClick={() => track("document_viewed", { category })}
        >
          View
        </Button>
      )}

      {!viewHref && fileId && (
        <>
          <Button size="sm" variant="outline" onClick={openFile} loading={opening}>
            View
          </Button>
          <Button size="sm" variant="outline" onClick={openFile} loading={opening}>
            Download
          </Button>
        </>
      )}

      {canDelete && (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          <Trash className="size-3.5" />
          Delete
        </Button>
      )}

      {openError && <InlineError>{openError}</InlineError>}

      <Modal
        open={confirming}
        onClose={() => !deleting && setConfirming(false)}
        title="Remove this document?"
        description="This only removes it from the project — nothing is deleted from your account."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Remove
            </Button>
          </>
        }
      >
        {deleteError && <InlineError>{deleteError}</InlineError>}
      </Modal>
    </div>
  );
}
