import Link from "next/link";
import { AppShell } from "@/components/storefront/AppShell";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SectionHead } from "@/components/ui/Section";
import { cn } from "@/components/ui/cn";
import {
  Briefcase,
  CreditCard,
  Crown,
  Document,
  Heart,
  Layers,
  Package,
  Pin,
  Settings,
  User,
} from "@/components/icons";

/**
 * The account area's frame.
 *
 * A left rail of sections at `lg` and a scrolling chip row on a phone —
 * the same information, in the shape each screen can carry. The rail is
 * not a second navigation: it is the contents page of one long area, which
 * is why it shows every section including the ones that are empty. A
 * section that appears only when it has data is a section customers never
 * learn exists.
 */

export const ACCOUNT_SECTIONS = [
  { href: "/account", label: "Overview", Icon: User },
  { href: "/account/orders", label: "Orders", Icon: Package },
  { href: "/account/projects", label: "Projects", Icon: Layers },
  { href: "/account/wishlist", label: "Saved", Icon: Heart },
  { href: "/account/services", label: "Services", Icon: Briefcase },
  { href: "/account/addresses", label: "Addresses", Icon: Pin },
  { href: "/account/payments", label: "Payments", Icon: CreditCard },
  { href: "/account/documents", label: "Documents", Icon: Document },
  { href: "/pro", label: "Quoin Pro", Icon: Crown },
  { href: "/account/settings", label: "Settings", Icon: Settings },
] as const;

export function AccountShell({
  current,
  title,
  subtitle,
  children,
}: {
  /** The `href` of the section being shown. */
  current: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const section = ACCOUNT_SECTIONS.find((s) => s.href === current);

  return (
    <AppShell>
      <div className="pt-4 lg:pt-6">
        <div className="mb-3 px-5 lg:px-0">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              ...(current === "/account"
                ? [{ label: "Account" }]
                : [
                    { label: "Account", href: "/account" },
                    { label: section?.label ?? title },
                  ]),
            ]}
          />
        </div>

        <SectionHead level={1} size="lg" title={title} subtitle={subtitle} />

        <div className="lg:flex lg:gap-10">
          <nav aria-label="Account sections" className="lg:w-52 lg:shrink-0">
            {/* The rail on a desktop. */}
            <ul className="sticky top-24 hidden space-y-0.5 lg:block">
              {ACCOUNT_SECTIONS.map(({ href, label, Icon }) => {
                const on = href === current;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-body transition-colors",
                        on
                          ? "bg-accent-wash font-medium text-accent"
                          : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      <Icon className="size-4.5 shrink-0" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* The chip row on a phone — but only on the sub-pages. The
                overview renders `AccountLinks` instead, which is the same
                destinations as a proper list; showing both would be the
                navigation twice above the content. */}
            <ul
              className={cn(
                "rail mb-6 gap-2 px-5 scroll-pl-5 lg:hidden",
                current === "/account" && "hidden",
              )}
            >
              {ACCOUNT_SECTIONS.map(({ href, label, Icon }) => {
                const on = href === current;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-caption transition-colors",
                        on
                          ? "border-accent-edge bg-accent-wash font-medium text-accent"
                          : "border-line-soft bg-surface text-muted",
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0 flex-1 px-5 lg:px-0">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
