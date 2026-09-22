import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { LoadError } from "@/components/storefront/account/LoadError";
import { LinkTabs } from "@/components/storefront/orders/LinkTabs";
import { DocumentsList } from "@/components/storefront/account/documents/DocumentsList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Document } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { one } from "@/lib/search-params";
import {
  DOCUMENT_CATEGORIES,
  countDocumentsForUser,
  listDocumentsForUser,
  type DocumentCategory,
} from "@/lib/data/documents";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Documents — Quoin" };

type CategoryParam = "all" | DocumentCategory;

const TABS: { id: CategoryParam; label: string }[] = [
  { id: "all", label: "All" },
  ...DOCUMENT_CATEGORIES.map((c) => ({ id: c.value as CategoryParam, label: c.label })),
];

function isDocumentCategory(value: string | undefined): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.some((c) => c.value === value);
}

function categoryHref(id: CategoryParam): string {
  return id === "all" ? "/account/documents" : `/account/documents?category=${id}`;
}

/**
 * The document centre.
 *
 * `listDocumentsForUser` already reads across every table a document can
 * live in — see that module's own note on why there is no `Document`
 * model — so this page's only job is the chip filter and the two shapes
 * of "nothing here": no document has ever existed for this account at
 * all, and this category specifically has none while others do. Those are
 * different sentences, the same distinction `/account/orders` already
 * draws between `!hasAnyOrders` and an empty tab.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();

  if (!session) {
    return (
      <AccountShell
        current="/account/documents"
        title="Documents"
        subtitle="Invoices, quotations, project documents and parcha files."
      >
        <SignInPrompt
          what="Signing in keeps every invoice, quotation and project file against your account."
          next="/account/documents"
        />
      </AccountShell>
    );
  }

  const raw = one((await searchParams).category);
  const category: DocumentCategory | undefined = isDocumentCategory(raw) ? raw : undefined;

  let rows;
  let totalCount: number;
  try {
    [rows, totalCount] = await Promise.all([
      listDocumentsForUser(session.userId, category),
      countDocumentsForUser(session.userId),
    ]);
  } catch (error) {
    console.error("[account/documents] failed to load documents", error);
    return (
      <AccountShell current="/account/documents" title="Documents">
        <LoadError title="We couldn't load your documents." />
      </AccountShell>
    );
  }

  return (
    <AccountShell
      current="/account/documents"
      title="Documents"
      subtitle="Invoices, quotations, project documents and parcha files."
    >
      <div className="space-y-4">
        {totalCount > 0 && (
          <LinkTabs
            label="Document category"
            items={TABS}
            value={category ?? "all"}
            hrefFor={categoryHref}
          />
        )}

        {totalCount === 0 ? (
          <EmptyState
            icon={<Document className="size-6" />}
            title="Your invoices, quotations and project files will appear here."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Document className="size-6" />}
            title="Nothing in this category yet."
            action={{ href: "/account/documents", label: "View all documents" }}
            compact
          />
        ) : (
          <DocumentsList rows={rows} />
        )}
      </div>
    </AccountShell>
  );
}
