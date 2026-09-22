import type { Metadata } from "next";
import { AppShell } from "@/components/storefront/AppShell";
import { SignInPrompt } from "@/components/storefront/account/SignInPrompt";
import { ServiceBookingFlow } from "@/components/storefront/services/ServiceBookingFlow";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listServices } from "@/lib/data/services";
import { PROJECT_KIND_FROM_DB } from "@/lib/data/projects";
import { one } from "@/lib/search-params";
import { addDays, istDay } from "@/lib/types/consult";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a service — Quoin",
  robots: { index: false, follow: false },
};

/** The rail shows a month out; a booking may still be made up to
    `BOOKING_HORIZON_DAYS` (`src/lib/services/booking-helpers.ts`) — the
    rail is a convenience, not the actual limit `createServiceBooking`
    enforces. */
const RAIL_DAYS = 30;

export default async function ServiceBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const serviceSlug = one(sp.service);
  const projectId = one(sp.project);
  const forceQuote = one(sp.mode) === "quote";

  const query = new URLSearchParams();
  if (serviceSlug) query.set("service", serviceSlug);
  if (projectId) query.set("project", projectId);
  if (forceQuote) query.set("mode", "quote");
  const next = `/services/book${query.toString() ? `?${query.toString()}` : ""}`;

  const session = await getSession();

  if (!session) {
    return (
      <AppShell>
        <div className="pt-4 lg:pt-6">
          <div className="px-5 lg:mx-auto lg:max-w-lg lg:px-0">
            <SignInPrompt
              what="Signing in lets Quoin call you back about this booking and keeps it in your account."
              next={next}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const [services, projectRows, addressRows] = await Promise.all([
    listServices(),
    db.project.findMany({
      where: { userId: session.userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, kind: true, location: true },
    }),
    db.address.findMany({
      where: { userId: session.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        label: true,
        line1: true,
        line2: true,
        landmark: true,
        city: true,
        pincode: true,
        isDefault: true,
      },
    }),
  ]);

  /* A "Project site" address is what a customer booking a professional is
     almost always about to pick — stable-sorted to the front rather than
     re-ordered by anything else, so a SITE address that is also the
     default still leads. */
  const addresses = [...addressRows].sort(
    (a, b) => Number(b.label === "SITE") - Number(a.label === "SITE"),
  );

  const today = istDay(new Date());
  const tomorrow = addDays(today, 1);
  const days = Array.from({ length: RAIL_DAYS }, (_, i) => addDays(tomorrow, i));

  return (
    <AppShell>
      <div className="pt-4 pb-24 lg:pb-10 lg:pt-6">
        <div className="px-5 lg:mx-auto lg:max-w-3xl lg:px-0">
          <ServiceBookingFlow
            services={services}
            projects={projectRows.map((p) => ({
              id: p.id,
              name: p.name,
              kind: PROJECT_KIND_FROM_DB[p.kind],
              location: p.location,
            }))}
            addresses={addresses}
            days={days}
            initialServiceSlug={serviceSlug}
            initialProjectId={projectId}
            forceQuote={forceQuote}
          />
        </div>
      </div>
    </AppShell>
  );
}
