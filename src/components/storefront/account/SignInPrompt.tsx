import { EmptyState } from "@/components/ui/EmptyState";
import { User } from "@/components/icons";

/**
 * What an account page shows to someone who is not signed in.
 *
 * One component rather than a copy per section, so the reason is worded
 * the same everywhere. It says what signing in *gets you on this screen*,
 * because "sign in to continue" tells someone nothing about whether it is
 * worth doing.
 */
export function SignInPrompt({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<User className="size-6" />}
      title="You are not signed in"
      action={{ href: "/consult", label: "Talk to an expert" }}
      secondaryAction={{ href: "/products", label: "Browse the catalogue" }}
    >
      {what} We send a code to your phone — there is no password to forget.
    </EmptyState>
  );
}
