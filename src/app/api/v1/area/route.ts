import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/http";
import { AREA_COOKIE, getAreaChoice, listAreaChoices } from "@/lib/data/service-areas";

const AreaInput = z.object({ slug: z.string().min(1).max(80) });

/** GET /api/v1/area — the localities a customer may pick, with their ETA. */
export const GET = handler(async () => ok({ areas: await listAreaChoices() }));

/**
 * POST /api/v1/area — remember the chosen locality.
 *
 * A route handler because a cookie cannot be set from a client component,
 * and the header reads it on the server so the first paint is already
 * correct rather than corrected after hydration.
 *
 * The slug is checked against the real list rather than trusted: this
 * value is echoed into the header, and an unvalidated one is a stored
 * cookie the page renders.
 */
export const POST = handler(async (request) => {
  const { slug } = await parseBody(request, AreaInput);

  const area = await getAreaChoice(slug);
  if (!area) throw new ApiError("not_found", "We do not deliver there yet");

  (await cookies()).set(AREA_COOKIE, area.slug, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return ok({ area });
});
