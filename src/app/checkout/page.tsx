import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { CheckoutFlow } from "@/components/storefront/checkout/CheckoutFlow";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
import { isGoogleSignInConfigured } from "@/lib/auth/google";
import { isOtpDeliveryAvailable } from "@/lib/auth/sender";
import { deliveryPhoneFor, maskPhone } from "@/lib/auth/phone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout — Quoin",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  /* Read on the server so the first step already knows whether to show the
     address picker or the sign-in panel. Doing it in the client would flash
     the wrong one on every load. */
  const session = await getSession();
  const isSignedIn = Boolean(session);

  /* Whether the signed-in account already has a phone Quoin can ship
     against — a Google account may have none. Read here rather than
     rediscovered client-side, for the same reason `isSignedIn` is: the
     first paint of the address step must already know whether to ask for
     one. `deliveryPhoneFor` prefers a verified `phone` and falls back to a
     previously saved `deliveryPhone` — see `src/lib/auth/phone.ts`. */
  const user = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { phone: true, deliveryPhone: true },
      })
    : null;
  const needsContactPhone =
    isSignedIn && !deliveryPhoneFor({ phone: user?.phone ?? null, deliveryPhone: user?.deliveryPhone ?? null });

  /* A previously saved delivery number, shown instead of the input when
     there is one and no verified phone — a returning Google customer
     should not be asked again. Null whenever `needsContactPhone` is false
     because a verified phone exists, since that phone is what ships the
     order and there is nothing saved to announce. */
  const savedDeliveryPhone =
    !user?.phone && user?.deliveryPhone ? maskPhone(user.deliveryPhone) : null;

  /* Whether Razorpay can actually take a payment — decided here rather
     than left for the client to discover after already writing an order,
     because the payment step's whole list of options depends on it. */
  const paymentsConfigured = isRazorpayConfigured();

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
          <CheckoutFlow
            isSignedIn={isSignedIn}
            needsContactPhone={needsContactPhone}
            savedDeliveryPhone={savedDeliveryPhone}
            paymentsConfigured={paymentsConfigured}
            googleEnabled={isGoogleSignInConfigured()}
            smsEnabled={isOtpDeliveryAvailable()}
          />
        </div>
      </div>
    </AppShell>
  );
}
