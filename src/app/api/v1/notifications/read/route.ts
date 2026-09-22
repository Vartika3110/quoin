import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/http";
import { markNotificationsRead } from "@/lib/data/notifications";

/**
 * POST /api/v1/notifications/read
 *
 * Two shapes rather than one with an optional `ids` — `{}` would be
 * ambiguous between "mark nothing" and "mark everything", and the bell
 * needs both a per-notification click and a "Mark all as read" button.
 */
const Body = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(50) }),
  z.object({ all: z.literal(true) }),
]);

export const POST = handler(async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, Body);

  const updated = await markNotificationsRead(user.id, "ids" in body ? body.ids : undefined);
  return ok({ updated });
});
