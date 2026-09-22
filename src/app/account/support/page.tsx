import type { Metadata } from "next";
import { AccountShell } from "@/components/storefront/account/AccountShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { SupportCategoryTiles } from "@/components/storefront/support/SupportCategoryTiles";
import { FaqSection } from "@/components/storefront/support/FaqSection";
import { SupportContactForm } from "@/components/storefront/support/SupportContactForm";
import { SupportRequestList } from "@/components/storefront/support/SupportRequestList";
import { getSession } from "@/lib/auth/session";
import { one } from "@/lib/search-params";
import {
  defaultSubject,
  listSupportRequestsForUser,
  parseSupportCategory,
} from "@/lib/data/support";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Help & Support — Quoin" };

/** A reference is quoted, not typed freely, wherever this page links from
    — bounded the same as the API's own zod schema so a malformed query
    string cannot make its way any further than this page. */
const MAX_REFERENCE_LENGTH = 40;

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  const sp = await searchParams;

  const category = parseSupportCategory(one(sp.category));
  const orderReference = one(sp.order)?.trim().slice(0, MAX_REFERENCE_LENGTH) || undefined;
  const bookingReference = one(sp.booking)?.trim().slice(0, MAX_REFERENCE_LENGTH) || undefined;
  const type = one(sp.type);

  const requests = session ? await listSupportRequestsForUser(session.userId) : [];

  /* The form's own category defaults to whatever was asked for; failing
     that, to the category the order or booking naturally belongs under —
     never left on "Orders" for a customer who arrived asking about a
     booking. */
  const formCategory = category ?? (bookingReference ? "services" : "orders");

  return (
    <AccountShell
      current="/account/support"
      title="Help & Support"
      subtitle="Answers to the questions we hear most, and a way to reach Quoin about anything else."
    >
      <div className="space-y-8">
        <SupportCategoryTiles current={category} />

        <FaqSection category={category} />

        <div className="border-t border-line-soft pt-6">
          <h2 className="font-display text-title-sm font-semibold text-ink">Contact support</h2>

          {!session ? (
            <div className="mt-3">
              <SignInPrompt
                what="Signing in lets Quoin see your orders and bookings when you ask about one, and keeps every request in one place."
                next={`/account/support${category ? `?category=${category}` : ""}`}
              />
            </div>
          ) : (
            <div className="mt-4 max-w-xl">
              <SupportContactForm
                defaultCategory={formCategory}
                orderReference={orderReference}
                bookingReference={bookingReference}
                defaultSubject={defaultSubject({ orderReference, bookingReference, type })}
              />
            </div>
          )}
        </div>

        {session && (
          <div className="border-t border-line-soft pt-6">
            <h2 className="font-display text-title-sm font-semibold text-ink">Your requests</h2>
            <div className="mt-4">
              <SupportRequestList requests={requests} />
            </div>
          </div>
        )}
      </div>
    </AccountShell>
  );
}
