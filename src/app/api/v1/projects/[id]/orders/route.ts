import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  ProjectNotFoundError,
  ProjectOrderAlreadyLinkedError,
  ProjectOrderLinkNotFoundError,
  linkOrder,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

/* `reference`, not an internal order id: it is the only identifier for an
   order the customer — or this endpoint's caller — actually has. See the
   file-level note on `linkOrder` in `src/lib/data/projects.ts`. */
const Body = z.object({
  reference: z.string().trim().min(1, "Enter an order reference").max(40),
});

/**
 * POST /api/v1/projects/{id}/orders
 *
 * Links an order to a project. Both must belong to the caller —
 * `linkOrder` checks the project first and then, the check this endpoint
 * exists to enforce, that the order does too. A stranger's order
 * reference 404s exactly like one that does not exist, for the same
 * reason a guessed order reference does at `GET /api/v1/orders/{reference}`.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const order = await linkOrder(user.id, id, body.reference);
    return ok({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    if (error instanceof ProjectOrderLinkNotFoundError) {
      throw new ApiError("not_found", "No such order");
    }
    if (error instanceof ProjectOrderAlreadyLinkedError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }
});
