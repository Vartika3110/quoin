import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { CheckoutFlow } from "@/components/storefront/checkout/CheckoutFlow";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — Quoin",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  /* Read on the server so the first step already knows whether to show the
     address picker or the sign-in panel. Doing it in the client would flash
     the wrong one on every load. */
  const isSignedIn = Boolean(await getSession());

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Cart", href: "/cart" },
              { label: "Checkout" },
            ]}
          />
        </div>

        <SectionHead level={1} size="lg" title="Checkout" />

        <div className="px-5 lg:px-0">
          <CheckoutFlow isSignedIn={isSignedIn} />
        </div>
      </div>
    </AppShell>
  );
}
