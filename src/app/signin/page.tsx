import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/storefront/AppShell";
import { SignInPanel } from "@/components/storefront/auth/SignInPanel";
import { Card } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CheckCircle } from "@/components/icons";
import { getSession } from "@/lib/auth/session";
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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const next = one((await searchParams).next);

  /* Already signed in: this page has nothing to offer, and showing a sign-in
     form to someone with a session is how people end up requesting codes
     they do not need. */
  if (await getSession()) redirect(safeNext(next));

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Sign in" }]} />
        </div>

        <div className="mx-auto max-w-md px-5 lg:px-0">
          <h1 className="text-headline font-semibold text-ink">Sign in</h1>
          <p className="mt-2 text-body leading-relaxed text-muted">
            One number, one code. Quoin creates the account the first time you
            verify — there is nothing separate to sign up for.
          </p>

          <Card padding="lg" className="mt-6">
            <SignInPanel next={safeNext(next)} />
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

/**
 * Where to send someone after they verify.
 *
 * Only same-origin paths are honoured. `?next=https://elsewhere` on a
 * sign-in page is an open redirect, and an open redirect on the one screen
 * where people expect to type a credential is a phishing primitive: the
 * link looks like Quoin, the sign-in is real, and the landing is not.
 * Protocol-relative `//host` is rejected for the same reason.
 */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}
