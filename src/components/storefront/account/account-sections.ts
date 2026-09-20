import {
  Briefcase,
  CreditCard,
  Crown,
  Document,
  Headset,
  Heart,
  Layers,
  Package,
  Pin,
  Settings,
  User,
} from "@/components/icons";

/**
 * Every section of the account area, in order.
 *
 * Its own module rather than an export of `AccountShell`, because
 * `AccountLinks` is a client component and the shell renders `AppShell`,
 * which reads cookies through `next/headers`. Importing a constant from
 * the shell dragged that server-only module into the client bundle.
 */
export const ACCOUNT_SECTIONS = [
  { href: "/account", label: "Overview", Icon: User },
  { href: "/account/orders", label: "Orders", Icon: Package },
  { href: "/account/projects", label: "Projects", Icon: Layers },
  { href: "/account/services", label: "Services", Icon: Briefcase },
  { href: "/account/wishlist", label: "Saved", Icon: Heart },
  { href: "/account/documents", label: "Documents", Icon: Document },
  { href: "/account/addresses", label: "Addresses", Icon: Pin },
  { href: "/account/payments", label: "Payments", Icon: CreditCard },
  { href: "/pro", label: "Quoin Pro", Icon: Crown },
  { href: "/account/settings", label: "Settings", Icon: Settings },
  { href: "/account/support", label: "Help & Support", Icon: Headset },
] as const;
