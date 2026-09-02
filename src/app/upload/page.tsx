import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { SectionHead } from "@/components/storefront/sections";
import { Upload } from "@/components/icons";

export const metadata: Metadata = { title: "Upload a parcha — Quoin" };

/**
 * Not built yet, and says so.
 *
 * The tab exists because the navigation is designed around six
 * destinations. A tab that quietly goes nowhere is worse than one that
 * explains itself — a customer who taps this should learn what it will do
 * rather than wonder whether the app is broken.
 */
export default function UploadPage() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-0">
        <SectionHead title="Upload a parcha" />
        <div className="mx-5 rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center lg:mx-0">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-wash text-accent">
            <Upload className="size-6" />
          </span>
          <p className="mt-4 text-sm text-ink">Coming soon</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
            Photograph a handwritten materials list or a supplier bill and we
            will turn it into a priced order you can check and confirm.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
