import { DocumentActions } from "@/components/storefront/account/documents/DocumentActions";
import type { DocumentRow } from "@/lib/data/documents";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Same thresholds and output shape as `formatSize` in
    `src/components/storefront/projects/DocumentsPanel.tsx` — restated
    rather than imported: that module is a client component scoped to one
    project's own tab, and this list is a server component reading across
    every project, so sharing an import would be the only coupling between
    the two files. `null` covers every row this list has no byte count
    for — an order summary, a quotation, a typed parcha. */
function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The document list, twice — a table from `lg` and a stack of cards below
 * it, both in the DOM and swapped with CSS rather than picked at render
 * time, matching the rule `docs/design-system.md` states under "Mobile":
 * the server renders once and nothing reflows at hydration.
 */
export function DocumentsList({ rows }: { rows: DocumentRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-line-soft lg:block">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line-soft bg-sunk text-micro uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-hair bg-surface">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="max-w-xs truncate px-4 py-3 text-body-sm text-ink">{row.name}</td>
                <td className="px-4 py-3 text-body-sm text-muted">{row.type}</td>
                <td className="max-w-40 truncate px-4 py-3 text-body-sm text-muted">
                  {row.projectName ?? "—"}
                </td>
                <td className="nums px-4 py-3 text-body-sm text-muted">
                  {DATE_FORMAT.format(row.date)}
                </td>
                <td className="nums px-4 py-3 text-body-sm text-muted">{formatSize(row.sizeBytes)}</td>
                <td className="px-4 py-3">
                  <DocumentActions
                    category={row.category}
                    viewHref={row.viewHref}
                    fileId={row.fileId}
                    canDelete={row.canDelete}
                    deleteTarget={row.deleteTarget}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-card border border-line-soft bg-surface p-4">
            <p className="truncate text-body-sm font-medium text-ink">{row.name}</p>
            <p className="nums mt-1 text-micro text-muted">
              {row.type}
              {row.projectName ? ` · ${row.projectName}` : ""} · {DATE_FORMAT.format(row.date)}
              {row.sizeBytes != null ? ` · ${formatSize(row.sizeBytes)}` : ""}
            </p>
            <div className="mt-3">
              <DocumentActions
                category={row.category}
                viewHref={row.viewHref}
                fileId={row.fileId}
                canDelete={row.canDelete}
                deleteTarget={row.deleteTarget}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
