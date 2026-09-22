"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineError } from "@/components/ui/ErrorState";
import { Document, Upload } from "@/components/icons";
import { track } from "@/lib/analytics";
import { formatPrice } from "@/lib/types/catalog";
import { ACCEPTED_UPLOAD_TYPES, useSignedUpload } from "@/lib/uploads/use-signed-upload";
import { moneyMoved } from "@/lib/orders/status-groups";
import { useProjects, type Project, type ProjectDocument } from "@/lib/store/projects";

/**
 * The Documents tab.
 *
 * Three sections that are honestly three different kinds of paper, never
 * merged into one list with a fake "category" column — see the design
 * system's note on not drawing what there is no data behind: invoices are
 * a read of money-moved linked orders, quotes are a read of priced service
 * bookings, and only the third section, project documents, is a table this
 * app actually owns rows in.
 */
export function DocumentsPanel({ project }: { project: Project }) {
  const { addDocument, removeDocument } = useProjects();
  const { upload, uploading, error: uploadError, clearError } = useSignedUpload("PROJECT_DOCUMENT");
  const fileInput = useRef<HTMLInputElement>(null);

  const [attachError, setAttachError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ProjectDocument | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const invoices = project.orders.filter((o) => moneyMoved(o.status));
  const quotes = project.services.filter((s) => s.quotePaise != null);
  const documents = project.documents;
  const nothing = invoices.length === 0 && quotes.length === 0 && documents.length === 0;

  async function handleFile(file: File) {
    clearError();
    setAttachError(null);
    try {
      const uploaded = await upload(file);
      await addDocument(project.id, uploaded.fileId);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "The upload could not be completed. Please try again.");
    }
  }

  async function handleView(doc: ProjectDocument) {
    setViewError(null);
    setViewingId(doc.fileId);
    try {
      const res = await fetch(`/api/v1/uploads/${doc.fileId}`);
      const body = (await res.json().catch(() => null)) as
        | { data?: { url: string }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.data) throw new Error(body?.error?.message ?? "Could not open that file.");
      window.open(body.data.url, "_blank", "noopener,noreferrer");
      track("document_viewed", { source: "project" });
    } catch (err) {
      setViewError(err instanceof Error ? err.message : "Could not open that file.");
    } finally {
      setViewingId(null);
    }
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeDocument(project.id, removeTarget.fileId);
      setRemoveTarget(null);
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Could not remove that document. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_UPLOAD_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} loading={uploading}>
          <Upload className="size-4" />
          Upload document
        </Button>
      </div>
      {(attachError ?? uploadError) && <InlineError>{attachError ?? uploadError}</InlineError>}

      {nothing ? (
        <EmptyState icon={<Document className="size-6" />} title="Nothing here yet">
          Your invoices, quotations and project files will appear here.
        </EmptyState>
      ) : (
        <>
          {invoices.length > 0 && (
            <section>
              <h2 className="font-display text-title-sm font-semibold text-ink">Invoices</h2>
              <ul className="mt-3 space-y-2">
                {invoices.map((order) => (
                  <li key={order.reference}>
                    <Link
                      href={`/account/orders/${order.reference}/receipt`}
                      onClick={() => track("document_viewed", { source: "project" })}
                      className="flex items-center justify-between gap-3 rounded-card border border-line-soft bg-surface px-4 py-3 transition-colors hover:border-line-strong"
                    >
                      <span className="font-mono text-body-sm text-ink">{order.reference}</span>
                      <span className="nums text-body-sm font-medium text-ink">
                        {formatPrice(order.totalPaise)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {quotes.length > 0 && (
            <section>
              <h2 className="font-display text-title-sm font-semibold text-ink">Quotes</h2>
              <ul className="mt-3 space-y-2">
                {quotes.map((service) => (
                  <li key={service.reference}>
                    <Link
                      href={`/account/services/${service.reference}`}
                      onClick={() => track("document_viewed", { source: "project" })}
                      className="flex items-center justify-between gap-3 rounded-card border border-line-soft bg-surface px-4 py-3 transition-colors hover:border-line-strong"
                    >
                      <span className="min-w-0 truncate text-body-sm text-ink">{service.serviceName}</span>
                      <span className="nums shrink-0 text-body-sm font-medium text-ink">
                        {formatPrice(service.quotePaise ?? 0)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-display text-title-sm font-semibold text-ink">Project documents</h2>
            {documents.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted">Nothing uploaded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-line-soft bg-surface px-4 py-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent">
                      <Document className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium text-ink">
                        {doc.originalName}
                      </span>
                      <span className="nums mt-0.5 block text-micro text-muted">
                        {documentKind(doc.contentType)} · {DATE_FORMAT.format(new Date(doc.createdAt))} ·{" "}
                        {formatSize(doc.sizeBytes)}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(doc)}
                        loading={viewingId === doc.fileId}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRemoveError(null);
                          setRemoveTarget(doc);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {viewError && (
              <div className="mt-2">
                <InlineError>{viewError}</InlineError>
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        open={removeTarget != null}
        onClose={() => {
          if (!removing) setRemoveTarget(null);
        }}
        title={removeTarget ? `Remove ${removeTarget.originalName}?` : "Remove document"}
        description="This only removes it from the project — nothing is deleted from your account."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Keep it
            </Button>
            <Button variant="danger" onClick={handleRemoveConfirm} loading={removing}>
              Remove
            </Button>
          </div>
        }
      >
        {removeError && <InlineError>{removeError}</InlineError>}
      </Modal>
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function documentKind(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("image/")) return "Image";
  if (contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return "Spreadsheet";
  }
  if (contentType === "text/csv") return "CSV";
  return "File";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
