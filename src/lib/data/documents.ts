import { db } from "@/lib/db";
import { MONEY_MOVED_STATUSES } from "@/lib/orders/status-groups";

/**
 * The document centre — every file or record a customer might call "my
 * paperwork", read from the five tables that actually hold one rather
 * than written into a sixth table of its own.
 *
 * There is no `Document` model. An invoice is a paid `Order`, a quotation
 * is a `ServiceBooking` with a price on it, a project's drawings are
 * `ProjectDocument` rows, a parcha is a `ParchaSubmission`, and a site
 * photo attached to a booking is a `ServiceBookingFile`. Reading across the
 * five live tables means nothing here can drift from the row it describes
 * — delete the order and its "invoice" is gone because the order is gone,
 * not because two tables had to be kept in sync by hand.
 */

export type DocumentCategory = "invoices" | "quotations" | "project" | "parcha" | "service";

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "invoices", label: "Invoices" },
  { value: "quotations", label: "Quotations" },
  { value: "project", label: "Project documents" },
  { value: "parcha", label: "Parcha" },
  { value: "service", label: "Service documents" },
];

export interface DocumentRow {
  id: string;
  category: DocumentCategory;
  name: string;
  type: string;
  projectName: string | null;
  date: Date;
  sizeBytes: number | null;
  viewHref: string | null;
  fileId: string | null;
  canDelete: boolean;
  /** Set only for `category: "project"` — what `DELETE
      /api/v1/projects/{id}/documents/{fileId}` needs to remove the join
      row. Absent everywhere else, matching `canDelete: false`. */
  deleteTarget?: { projectId: string; fileId: string };
}

/**
 * How a stored file's declared MIME type reads to a customer.
 *
 * The accepted set lives in `ACCEPTED_CONTENT_TYPES`
 * (`src/lib/storage/index.ts`); this only has to name what a person calls
 * each one, not police the set, so "File" is a safe fallback for anything
 * accepted there without being named here — it renders instead of
 * throwing.
 */
export function contentTypeLabel(contentType: string): string {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("image/")) return "Image";
  if (
    contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    contentType === "application/vnd.ms-excel"
  ) {
    return "Spreadsheet";
  }
  if (contentType === "text/csv") return "CSV";
  return "File";
}

/** Every source query below is capped at this — a document centre, not an
    export tool — so a merge across every category never has to sort more
    than five times this many rows to answer one page. */
const ROW_CAP = 200;

function mergeNewestFirst(rows: DocumentRow[][]): DocumentRow[] {
  return rows
    .flat()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, ROW_CAP);
}

/** Paid orders read as "Order summary" documents — the receipt each one
    already has at `/account/orders/{reference}/receipt`. */
async function invoicesFor(userId: string): Promise<DocumentRow[]> {
  const rows = await db.order.findMany({
    where: { userId, status: { in: [...MONEY_MOVED_STATUSES] } },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
    select: {
      reference: true,
      paidAt: true,
      createdAt: true,
      /* First linked project only — a document row names one project,
         and an order filed under several is the edge case, not the row
         this list is designed around. */
      projectOrders: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { project: { select: { name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: `order:${row.reference}`,
    category: "invoices" as const,
    name: `Order summary ${row.reference}`,
    type: "Order summary",
    projectName: row.projectOrders[0]?.project.name ?? null,
    date: row.paidAt ?? row.createdAt,
    sizeBytes: null,
    viewHref: `/account/orders/${row.reference}/receipt`,
    fileId: null,
    canDelete: false,
  }));
}

/** A booking or quote request that has been priced reads as a "Quotation"
    document, whether or not the customer has accepted it yet. */
async function quotationsFor(userId: string): Promise<DocumentRow[]> {
  const rows = await db.serviceBooking.findMany({
    where: { userId, quotePaise: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: ROW_CAP,
    select: {
      reference: true,
      serviceName: true,
      quotedAt: true,
      updatedAt: true,
      project: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: `booking:${row.reference}`,
    category: "quotations" as const,
    name: `Quote ${row.reference} · ${row.serviceName}`,
    type: "Quotation",
    projectName: row.project?.name ?? null,
    date: row.quotedAt ?? row.updatedAt,
    sizeBytes: null,
    viewHref: `/account/services/${row.reference}`,
    fileId: null,
    canDelete: false,
  }));
}

/** Drawings, specifications and photographs attached to a project. The
    only category a customer may delete from here — see the model comment
    on `ProjectDocument`: removing the row detaches it from the project,
    the bytes are `Restrict`ed and stay in the bucket either way. */
async function projectDocumentsFor(userId: string): Promise<DocumentRow[]> {
  const rows = await db.projectDocument.findMany({
    where: { project: { userId } },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
    select: {
      id: true,
      fileId: true,
      label: true,
      createdAt: true,
      projectId: true,
      project: { select: { name: true } },
      file: { select: { originalName: true, contentType: true, sizeBytes: true } },
    },
  });

  return rows.map((row) => ({
    id: `projectDocument:${row.id}`,
    category: "project" as const,
    name: row.label || row.file.originalName,
    type: contentTypeLabel(row.file.contentType),
    projectName: row.project.name,
    date: row.createdAt,
    sizeBytes: row.file.sizeBytes,
    viewHref: null,
    fileId: row.fileId,
    canDelete: true,
    deleteTarget: { projectId: row.projectId, fileId: row.fileId },
  }));
}

/** Both shapes a parcha can take: a photographed or exported list that
    finished uploading, and one typed straight into the workbench. Neither
    is deletable from here — a parcha is the record of what was submitted,
    not a working document a customer edits after the fact. */
async function parchaFor(userId: string): Promise<DocumentRow[]> {
  const [uploaded, typed] = await Promise.all([
    db.parchaSubmission.findMany({
      where: { userId, source: "UPLOAD", file: { status: "STORED" } },
      orderBy: { createdAt: "desc" },
      take: ROW_CAP,
      select: {
        id: true,
        createdAt: true,
        fileId: true,
        file: { select: { originalName: true, sizeBytes: true } },
      },
    }),
    db.parchaSubmission.findMany({
      where: { userId, source: "TYPED" },
      orderBy: { createdAt: "desc" },
      take: ROW_CAP,
      select: { id: true, reference: true, createdAt: true },
    }),
  ]);

  /* `flatMap` rather than `map` + a non-null assertion: the `where` above
     already guarantees a matching `STORED` file exists, but the type
     system does not know that from a nested relation filter, and this
     drops the row instead of asserting past it if that ever stops being
     true. */
  const uploadedRows: DocumentRow[] = uploaded.flatMap((row) =>
    row.file
      ? [
          {
            id: `parcha:${row.id}`,
            category: "parcha" as const,
            name: row.file.originalName,
            type: "Parcha",
            projectName: null,
            date: row.createdAt,
            sizeBytes: row.file.sizeBytes,
            viewHref: null,
            fileId: row.fileId,
            canDelete: false,
          },
        ]
      : [],
  );

  const typedRows: DocumentRow[] = typed.map((row) => ({
    id: `parcha:${row.id}`,
    category: "parcha" as const,
    name: `Typed parcha ${row.reference}`,
    type: "Parcha",
    projectName: null,
    date: row.createdAt,
    sizeBytes: null,
    viewHref: null,
    fileId: null,
    canDelete: false,
  }));

  return mergeNewestFirst([uploadedRows, typedRows]);
}

/** A site photograph or drawing attached to a booking — never deletable
    from the account: it is Quoin's own record of what a professional was
    shown, not a file the customer manages. */
async function serviceDocumentsFor(userId: string): Promise<DocumentRow[]> {
  const rows = await db.serviceBookingFile.findMany({
    where: { booking: { userId } },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
    select: {
      id: true,
      fileId: true,
      createdAt: true,
      booking: { select: { project: { select: { name: true } } } },
      file: { select: { originalName: true, contentType: true, sizeBytes: true } },
    },
  });

  return rows.map((row) => ({
    id: `serviceFile:${row.id}`,
    category: "service" as const,
    name: row.file.originalName,
    type: contentTypeLabel(row.file.contentType),
    projectName: row.booking.project?.name ?? null,
    date: row.createdAt,
    sizeBytes: row.file.sizeBytes,
    viewHref: null,
    fileId: row.fileId,
    canDelete: false,
  }));
}

const READERS: Record<DocumentCategory, (userId: string) => Promise<DocumentRow[]>> = {
  invoices: invoicesFor,
  quotations: quotationsFor,
  project: projectDocumentsFor,
  parcha: parchaFor,
  service: serviceDocumentsFor,
};

/**
 * Every document category page reads, in one call: all five when
 * `category` is omitted, or just the one asked for. Newest first, capped
 * at `ROW_CAP` either way — a filtered read never has to merge, but stays
 * on the same cap so switching a chip never changes what "capped" means.
 */
export async function listDocumentsForUser(
  userId: string,
  category?: DocumentCategory,
): Promise<DocumentRow[]> {
  const categories = category ? [category] : (Object.keys(READERS) as DocumentCategory[]);
  const rows = await Promise.all(categories.map((c) => READERS[c](userId)));
  return mergeNewestFirst(rows);
}

/** The dashboard's document count — every row `listDocumentsForUser` could
    ever return, not just the first `ROW_CAP` of them, so the two never
    disagree about whether there are "more than fit on the page". */
export async function countDocumentsForUser(userId: string): Promise<number> {
  const [invoices, quotations, project, parchaUploaded, parchaTyped, service] = await Promise.all([
    db.order.count({ where: { userId, status: { in: [...MONEY_MOVED_STATUSES] } } }),
    db.serviceBooking.count({ where: { userId, quotePaise: { not: null } } }),
    db.projectDocument.count({ where: { project: { userId } } }),
    db.parchaSubmission.count({ where: { userId, source: "UPLOAD", file: { status: "STORED" } } }),
    db.parchaSubmission.count({ where: { userId, source: "TYPED" } }),
    db.serviceBookingFile.count({ where: { booking: { userId } } }),
  ]);
  return invoices + quotations + project + parchaUploaded + parchaTyped + service;
}
