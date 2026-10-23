import { handler, ok } from "@/lib/http";
import { enforce } from "@/lib/rate-limit";
import { listAvailability } from "@/lib/data/consult-sessions";
import { addDays, CONSULT_HORIZON_DAYS, istDay } from "@/lib/types/consult";

/**
 * GET /api/v1/consultations/availability
 *
 * The bookable start times for the next fortnight, as the booking form
 * needs them. Only times that can actually be booked are returned — a
 * picker that offers a slot the server then refuses tells the customer
 * after they have already chosen.
 *
 * Open to anyone, like the consultation request endpoint beside it: a
 * customer should be able to see whether there is a slot this evening
 * before being asked for a phone number. Counted against the `search`
 * bucket, which is the loosest one, because the form refetches this after
 * every failed booking.
 *
 * Computed per request and never cached. "Today" is in the answer, and a
 * cached response serves yesterday's grid after midnight — the exact bug
 * `/consult` sets `force-dynamic` to avoid.
 */
export const runtime = "nodejs";

export const GET = handler(async (request) => {
  enforce("search", request);

  /* Quoin's calendar, not the caller's device — see `istDay`. */
  const today = istDay(new Date());
  const days = Array.from({ length: CONSULT_HORIZON_DAYS }, (_, i) => addDays(today, i));

  const availability = await listAvailability({ days });

  return ok({
    /* Days with nothing left are returned as empty rather than omitted,
       so the rail renders a greyed-out day instead of silently skipping
       from Tuesday to Thursday. */
    days: availability,
  });
});
