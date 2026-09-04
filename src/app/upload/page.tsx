import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { ParchaWorkbench } from "@/components/storefront/parcha/ParchaWorkbench";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Eyebrow } from "@/components/ui/Badge";
import { CheckCircle, Layers, Rupee } from "@/components/icons";

export const metadata: Metadata = {
  title: "Upload a parcha — Quoin",
  description:
    "Turn a handwritten materials list into a priced order, matched line by line against the Quoin catalogue.",
};

const STEPS = [
  {
    Icon: Layers,
    title: "Write it as you would on paper",
    body: "One item a line. Quantities and units are read for you.",
  },
  {
    Icon: CheckCircle,
    title: "We match it to the catalogue",
    body: "Every line is searched against real products and real SKUs.",
  },
  {
    Icon: Rupee,
    title: "You get a priced list",
    body: "Edit the quantities, drop what you do not need, then order it.",
  },
];

export default function UploadPage() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Upload Parcha" }]}
          />
        </div>

        <header className="px-5 lg:px-0">
          <Eyebrow>Upload Parcha</Eyebrow>
          <h1 className="mt-3 max-w-2xl text-headline font-semibold text-ink lg:text-headline-lg">
            Upload your parcha. We&rsquo;ll organise the rest.
          </h1>
          <p className="mt-3 max-w-xl text-body-lg leading-relaxed text-muted">
            A materials list, priced against the catalogue line by line — so
            you can see what a job costs before you order any of it.
          </p>
        </header>

        <ul className="mt-8 grid gap-3 px-5 sm:grid-cols-3 lg:px-0">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li
              key={title}
              className="rounded-card border border-line-soft bg-surface p-4"
            >
              <span className="flex items-center gap-2">
                <span className="nums grid size-6 place-items-center rounded-full bg-accent-wash text-micro font-semibold text-accent">
                  {i + 1}
                </span>
                <Icon className="size-4 text-muted" />
              </span>
              <p className="mt-3 text-body-sm font-semibold text-ink">{title}</p>
              <p className="mt-1 text-caption leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 px-5 lg:px-0">
          <ParchaWorkbench />
        </div>
      </div>
    </AppShell>
  );
}
