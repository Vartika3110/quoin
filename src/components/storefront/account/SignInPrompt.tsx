import { EmptyState } from "@/components/ui/EmptyState";
import { User } from "@/components/icons";

/**
 * What an account page shows to someone who is not signed in.
 *
 * One component rather than a copy per section, so the reason is worded
 * the same everywhere. It says what signing in *gets you on this screen*,
 * because "sign in to continue" tells someone nothing about whether it is
 * worth doing.
 *
 * The primary action is a real link to `/signin` — it used to point at
 * "Talk to an expert" and "Browse the catalogue" only, so a customer who
 * followed "Account" while signed out landed on a page about signing in
 * with no control that actually did it. `next` carries the page's own path
 * so the sign-in page returns here rather than to the account overview,
 * which is `/signin`'s default when nothing else is given.
 */
export function SignInPrompt({ what, next }: { what: string; next?: string }) {
  const signInHref = next ? `/signin?next=${encodeURIComponent(next)}` : "/signin";

  return (
    <EmptyState
      icon={<User className="size-6" />}
      title="You are not signed in"
      action={{ href: signInHref, label: "Sign in" }}
      secondaryAction={{ href: "/products", label: "Browse the catalogue" }}
    >
      {what} We send a code to your phone — there is no password to forget.
    </EmptyState>
  );
}
