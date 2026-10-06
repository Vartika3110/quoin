import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { FAQ, SUPPORT_CATEGORIES } from "@/lib/support/faq";

export const metadata: Metadata = {
  title: "Frequently asked questions — Quoin",
  description:
    "How ordering, delivery, payment, returns and expert services work at Quoin.",
};

/**
 * The questions, without an account.
 *
 * These answers already existed — `src/lib/support/faq.ts` holds them and
 * `/account/support` has rendered them since Help & Support shipped. The
 * problem is where: that page is behind `SignInPrompt`, so the customer
 * most likely to want them is the one who cannot reach them. Somebody
 * deciding whether to order at all does not have an account yet, and
 * "sign in to find out how returns work" is the wrong answer to that.
 *
 * So the same data, read-only and public, linked from the footer. The
 * account page keeps its copy and keeps the thing this page cannot do —
 * raising a request against your own orders.
 *
 * No accordion. Twenty-odd answers of two sentences each is a page to
 * scan, not a set of drawers to open one at a time, and a question whose
 * answer is hidden until clicked is a question the reader has to guess is
 * worth asking.
 */
export default function FaqPage() {
  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "FAQs" }]} />
        </div>

        <SectionHead
          level={1}
          size="lg"
          title="Frequently asked questions"
          subtitle="How ordering, delivery, payment and services work."
        />

        <div className="flex flex-col gap-8 px-5 pb-10 lg:px-0">
          {SUPPORT_CATEGORIES.map((category) => {
            const entries = FAQ[category.slug];
            if (entries.length === 0) return null;

            return (
              <section key={category.slug}>
                <h2 className="font-display text-title-sm font-semibold text-ink">
                  {category.label}
                </h2>
                <p className="mt-0.5 text-caption text-muted">{category.summary}</p>

                {/* A description list, because that is what this is: a
                    term and its definition. The markup is the structure a
                    screen reader announces, so it may as well be true. */}
                <dl className="mt-4 flex flex-col gap-4">
                  {entries.map((entry) => (
                    <div key={entry.q}>
                      <dt className="text-body-sm font-semibold text-ink">
                        {entry.q}
                      </dt>
                      <dd className="mt-1 text-body-sm leading-relaxed text-muted">
                        {entry.a}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
