import type { ReactNode } from "react";
import { AppShell } from "@/components/storefront/AppShell";

/**
 * The pages a payment gateway asks for.
 *
 * Razorpay, PayU and Cashfree each require a privacy policy, terms,
 * a refunds and cancellations policy, a named grievance officer with a
 * response time, and a contact page — reachable from every page — before
 * they will activate a live account. India's Consumer Protection
 * (E-Commerce) Rules require the grievance officer independently of any
 * gateway.
 *
 * A route group rather than a `/legal` prefix: `/privacy` is the URL a
 * reviewer, a crawler and a customer all expect, and nesting it under a
 * folder nobody asked for buys nothing.
 *
 * Everything in here is marked `[LEGAL TO CONFIRM]` where a real fact is
 * missing. That marker is deliberate and it is not a placeholder to
 * quietly delete: each one is a decision somebody at Quoin has to make —
 * an address, a name, a window in days — and publishing a policy that
 * invents them is worse than publishing one that is visibly unfinished.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <article className="mx-auto w-full max-w-prose px-5 py-8 lg:px-0 lg:py-14">
        {children}
      </article>
    </AppShell>
  );
}
