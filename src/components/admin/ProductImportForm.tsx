"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  REQUIRED_COLUMNS,
  importTemplateCsv,
} from "@/lib/admin/product-import";

/**
 * Upload, look, then commit.
 *
 * The preview is not a courtesy — it is the only thing standing between a
 * mistyped column and a few hundred wrong prices on a live shop. So the
 * commit button does not exist until a dry run has come back, and it
 * disappears again the moment a different file is chosen.
 *
 * The file is sent twice, once for each pass. It is a few hundred rows of
 * text; the alternative is a server-side staging area that can expire or
 * be replayed, which is a worse trade for something this small.
 */

interface RowPlan {
  line: number;
  sku: string;
  name: string;
  action: "create" | "update" | "error";
  changes: string[];
  message?: string;
}

interface Summary {
  willCreate: number;
  willUpdate: number;
  rejected: number;
  totalRows: number;
  unknownColumns: string[];
  created?: number;
  updated?: number;
}

type State =
  | { kind: "idle" }
  | { kind: "working"; what: "preview" | "apply" }
  | { kind: "previewed"; summary: Summary; plans: RowPlan[] }
  | { kind: "applied"; summary: Summary }
  | { kind: "error"; message: string };

export function ProductImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send(apply: boolean) {
    if (!csv) return;
    setState({ kind: "working", what: apply ? "apply" : "preview" });

    try {
      const res = await fetch("/api/v1/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, apply }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setState({ kind: "error", message: payload?.error?.message ?? "Could not read the file" });
        return;
      }

      if (apply) {
        setState({ kind: "applied", summary: payload.data.summary });
        /* The register is a server component; without this it would be
           served from the client router cache without the new rows. */
        router.refresh();
      } else {
        setState({ kind: "previewed", summary: payload.data.summary, plans: payload.data.plans });
      }
    } catch {
      setState({ kind: "error", message: "Network error — nothing was changed" });
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setFilename(file.name);
    setState({ kind: "idle" });
    setCsv(await file.text());
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([importTemplateCsv()], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "quoin-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const working = state.kind === "working";

  if (state.kind === "applied") {
    return (
      <Card padding="lg">
        <h2 className="font-display text-title-sm font-semibold text-ink">Uploaded</h2>
        <p className="mt-2 text-body-sm text-muted">
          {state.summary.created} product{state.summary.created === 1 ? "" : "s"} added and{" "}
          {state.summary.updated} updated. They are on the storefront now.
        </p>
        <div className="mt-5 flex gap-3">
          <Button href="/admin/products">Back to products</Button>
          <Button
            variant="outline"
            onClick={() => {
              setCsv(null);
              setFilename("");
              setState({ kind: "idle" });
            }}
          >
            Upload another file
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h2 className="font-display text-title-sm font-semibold text-ink">The file</h2>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">
          A CSV with a header row, up to {MAX_IMPORT_ROWS} products. Rows are matched
          on <span className="nums text-ink">sku</span> — a code already in the
          catalogue is updated in place, a new one is added. Uploading the same file
          twice never makes a duplicate, so this is also how you reprice in bulk.
        </p>

        <dl className="mt-4 space-y-2 text-caption">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <dt className="text-muted">Required:</dt>
            {REQUIRED_COLUMNS.map((c) => (
              <dd key={c}>
                <Badge tone="accent" size="sm">
                  {c}
                </Badge>
              </dd>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <dt className="text-muted">Optional:</dt>
            {IMPORT_COLUMNS.filter(
              (c) => !(REQUIRED_COLUMNS as readonly string[]).includes(c),
            ).map((c) => (
              <dd key={c}>
                <Badge size="sm">{c}</Badge>
              </dd>
            ))}
          </div>
        </dl>

        <ul className="mt-4 space-y-1.5 text-caption text-muted">
          <li>
            Prices are in rupees and <span className="text-ink">already include GST</span> —
            the slab is what the invoice extracts, never what it adds. A blank sell
            price means sell at MRP.
          </li>
          <li>
            <span className="text-ink">Brands and categories must already exist.</span> They
            are matched by name, ignoring case, and a name that matches nothing is an
            error rather than a new brand — which is how “Dr Fixit” and “Dr. Fixit”
            both ended up in this catalogue.
          </li>
          <li>
            A blank cell means “leave this alone” on an existing product. It does not
            clear the value.
          </li>
          <li>
            Nothing is written while any row is rejected, so a typo on line 40 cannot
            leave the first 39 half-applied.
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-4 text-body font-medium text-ink transition-colors hover:bg-hover">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            Choose a CSV
          </label>
          {filename && <span className="text-caption text-muted">{filename}</span>}
          <Button variant="ghost" onClick={downloadTemplate}>
            Download a template
          </Button>
        </div>

        {csv && state.kind !== "previewed" && (
          <div className="mt-5">
            <Button loading={working} disabled={working} onClick={() => send(false)}>
              Check the file
            </Button>
            <p className="mt-2 text-micro text-muted">
              Reads the file and shows what would change. Writes nothing.
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" className="mt-4 text-body-sm text-danger">
            {state.message}
          </p>
        )}
      </Card>

      {state.kind === "previewed" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows read" value={state.summary.totalRows} />
            <Stat label="To add" value={state.summary.willCreate} tone="success" />
            <Stat label="To update" value={state.summary.willUpdate} tone="accent" />
            <Stat
              label="Rejected"
              value={state.summary.rejected}
              tone={state.summary.rejected > 0 ? "accent" : "plain"}
            />
          </div>

          {state.summary.unknownColumns.length > 0 && (
            <p className="text-body-sm text-warning">
              Ignored column{state.summary.unknownColumns.length === 1 ? "" : "s"}:{" "}
              {state.summary.unknownColumns.join(", ")}. Check for a typo before
              applying — a misspelled header is read as missing, not as an error.
            </p>
          )}

          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-raised text-left text-micro font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Line</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">What happens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {state.plans.map((plan) => (
                  <tr key={plan.line} className={plan.action === "error" ? "bg-danger-wash/40" : ""}>
                    <td className="nums px-4 py-2.5 text-muted">{plan.line}</td>
                    <td className="nums px-4 py-2.5 text-ink">{plan.sku || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{plan.name || "—"}</td>
                    <td className="px-4 py-2.5">
                      {plan.action === "error" ? (
                        <span className="text-danger">{plan.message}</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={plan.action === "create" ? "success" : "info"} size="sm">
                            {plan.action === "create" ? "Add" : "Update"}
                          </Badge>
                          <span className="text-muted">{plan.changes.join(", ")}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card padding="lg">
            {state.summary.rejected > 0 ? (
              <>
                <p className="text-body-sm text-danger">
                  {state.summary.rejected} row{state.summary.rejected === 1 ? "" : "s"} cannot
                  be applied. Fix them in the file and choose it again — nothing has been
                  changed.
                </p>
                {/* No "apply the good ones" here on purpose. A price list
                    applied in part is a shop that is partly wrong, and
                    nobody can tell by looking which half landed. */}
                <div className="mt-4">
                  <Button variant="ghost" onClick={() => setState({ kind: "idle" })}>
                    Start over
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-body-sm text-muted">
                  Applying this adds {state.summary.willCreate} and updates{" "}
                  {state.summary.willUpdate} product
                  {state.summary.willUpdate === 1 ? "" : "s"}. Price changes are on the
                  storefront immediately.
                </p>
                <div className="mt-4 flex gap-3">
                  <Button loading={working} disabled={working} onClick={() => send(true)}>
                    Apply to the catalogue
                  </Button>
                  <Button variant="ghost" onClick={() => setState({ kind: "idle" })}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
