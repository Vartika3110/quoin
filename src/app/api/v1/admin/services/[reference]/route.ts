import { z } from "zod";
import type { ServiceBookingStatus } from "@prisma/client";
import { ApiError, handler, ok, parseBody, requireStaff } from "@/lib/http";
import { BOOKING_STATUS_LABEL } from "@/lib/services/booking-status";
import { InvalidRupeeAmountError, rupeesToPaise } from "@/lib/services/booking-helpers";
import {
  getBookingForStaff,
  serviceBookingErrorCode,
  staffUpdate,
} from "@/lib/data/service-bookings";

type Ctx = { params: Promise<{ reference: string }> };

const STATUS_VALUES: ReadonlySet<string> = new Set(Object.keys(BOOKING_STATUS_LABEL));

/**
 * GET /api/v1/admin/services/{reference}
 *
 * Everything a person on the phone with this customer needs — the same
 * shape `GET /api/v1/admin/orders/{reference}` gives an order.
 */
export const GET = handler(async (_request, { params }: Ctx) => {
  await requireStaff();
  const { reference } = await params;

  const booking = await getBookingForStaff(reference);
  if (!booking) throw new ApiError("not_found", "No such service booking");

  return ok({ booking });
});

const Body = z.object({
  toStatus: z.string().max(40).optional(),
  /* Rupees, as typed — never paise. Converted here, not trusted from the
     client, for the same reason every other amount in this app is
     recomputed server-side: this route is the actual authority on what a
     quote says, and a compromised or buggy client sending `quotePaise`
     directly would bypass `rupeesToPaise`'s own guards (no float, no
     negative, no garbage). */
  quoteAmount: z.string().trim().max(20).optional(),
  quoteNote: z.string().trim().max(1000).optional(),
  /* An ISO instant, not a bare day-and-time pair: `AdminBookingForm`
     (`src/components/admin/AdminBookingForm.tsx`) combines the IST day and
     time fields staff typed and converts to UTC itself, because IST has a
     fixed +05:30 offset and no daylight-saving edge case for a server to
     get subtly wrong — the conversion is arithmetic a client can do once
     and this route trusts the resulting instant the same way it would
     trust any other `Date`. */
  scheduledAt: z.string().datetime().optional(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/v1/admin/services/{reference}
 *
 * Staff moving a booking through the state machine, entering a quote, or
 * agreeing an exact time. `staffUpdate` is the actual authority on which
 * moves are legal and what a row needs before it is; this route only
 * shapes the input and turns a rupee string into paise.
 */
export const PATCH = handler(async (request, { params }: Ctx) => {
  const staff = await requireStaff();
  const { reference } = await params;
  const body = await parseBody(request, Body);

  if (body.toStatus && !STATUS_VALUES.has(body.toStatus)) {
    throw new ApiError("bad_request", "Not a valid status", { toStatus: "Not a valid status" });
  }

  let quotePaise: number | undefined;
  if (body.quoteAmount !== undefined) {
    try {
      quotePaise = rupeesToPaise(body.quoteAmount);
    } catch (error) {
      if (error instanceof InvalidRupeeAmountError) {
        throw new ApiError("bad_request", error.message, { quoteAmount: error.message });
      }
      throw error;
    }
  }

  try {
    const booking = await staffUpdate(staff.id, reference, {
      toStatus: body.toStatus as ServiceBookingStatus | undefined,
      quotePaise,
      quoteNote: body.quoteNote,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
      note: body.note,
    });
    return ok({ booking });
  } catch (error) {
    const code = serviceBookingErrorCode(error);
    if (code) throw new ApiError(code, (error as Error).message);
    throw error;
  }
});
