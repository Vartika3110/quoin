import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { SignInPanel } from "@/components/storefront/auth/SignInPanel";
import { Card } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { InlineError } from "@/components/ui/ErrorState";
import { CheckCircle } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { isGoogleSignInConfigured } from "@/lib/auth/google";
import { isOtpDeliveryAvailable } from "@/lib/auth/sender";
import { one } from "@/lib/search-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Quoin",
  /* Nothing here should ever appear in a search result. */
  robots: { index: false, follow: false },
};

const REASONS = [
  "Your addresses saved, so a delivery is two taps",
  "Every order and booking kept against your account",
  "Trade pricing applied automatically if you are Pro",
];

/**
 * Copy for `?error=`, set by the Google callback route redirecting back
 * here. Unknown values are ignored rather than shown, matching how a
 * stale or hand-edited query string is already treated elsewhere in this
 * app (`parseOrderStatusFilter`, `safeNext`).
 */
const ERROR_COPY: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unavailable: "Google sign-in isn't available yet.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const next = one(sp.next);
  const errorMessage = ERROR_COPY[one(sp.error) ?? ""];

  /* Already signed in: this page has nothing to offer, and showing a sign-in
     form to someone with a session is how people end up requesting codes
     they do not need. */
  if (await getSession()) redirect(safeNext(next));

  const googleEnabled = isGoogleSignInConfigured();
  const smsEnabled = isOtpDeliveryAvailable();

  /* Truthful for whichever methods are actually live — never the fixed
     "one number, one code" line when SMS is the one thing not working,
     which is exactly the state this deploy sits in until MSG91's DLT
     template clears. */
  const subtitle =
    googleEnabled && smsEnabled
      ? "Continue with Google, or use one number and one code. Quoin creates the account the first time you verify."
      : smsEnabled
        ? "One number, one code. Quoin creates the account the first time you verify — there is nothing separate to sign up for."
        : googleEnabled
          ? "Continue with your Google account. Quoin creates the account the first time you sign in."
          : "Sign-in isn't available yet. Please check back shortly.";

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Sign in" }]} />
        </div>

        <div className="mx-auto max-w-md px-5 lg:px-0">
          <h1 className="font-display text-headline font-semibold text-ink">Sign in</h1>
          <p className="mt-2 text-body leading-relaxed text-muted">{subtitle}</p>

          {errorMessage && (
            <div className="mt-4">
              <InlineError>{errorMessage}</InlineError>
            </div>
          )}

          <Card padding="lg" className="mt-6">
            <SignInPanel
              next={safeNext(next)}
              googleEnabled={googleEnabled}
              smsEnabled={smsEnabled}
            />
          </Card>

          <ul className="mt-6 space-y-2">
            {REASONS.map((reason) => (
              <li key={reason} className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="text-caption leading-relaxed text-muted">
                  {reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
