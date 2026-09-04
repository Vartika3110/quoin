import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SiteFooter } from "@/components/storefront/nav/SiteFooter";

/**
 * 404.
 *
 * Deliberately does not render `AppShell`. The shell queries the database
 * for the areas and the category menu, and a not-found page that needs
 * Postgres to render is a not-found page that 500s when Postgres is the
 * reason you got here. The wordmark is a link home, which is the only
 * navigation this page actually owes anyone.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="px-5 py-4 lg:px-6">
        <Link
          href="/"
          className="font-display text-title-lg tracking-[0.18em] text-ink transition-colors hover:text-accent"
        >
          QUOIN
        </Link>
      </header>

      <main className="flex flex-1 items-center px-5 py-16 lg:px-6">
        <div className="mx-auto max-w-md text-center">
          <p className="nums text-display font-semibold text-accent">404</p>
          <h1 className="mt-4 text-headline font-semibold text-ink">
            That page is not here.
          </h1>
          <p className="mt-3 text-body leading-relaxed text-muted">
            The link may be old, or the product may have been retired from the
            catalogue. Search is usually the fastest way back.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Button href="/">Go to the home page</Button>
            <Button href="/categories" variant="outline">
              Browse categories
            </Button>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
