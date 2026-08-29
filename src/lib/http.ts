import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/**
 * API conventions.
 *
 * Every `/api/v1` route answers with the same envelope so that a second
 * client — the planned native app — can implement error handling once
 * rather than per endpoint.
 *
 *   success  { "data": ... }
 *   failure  { "error": { "code": "...", "message": "...", "fields"?: {...} } }
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  extra?: { fields?: Record<string, string>; retryAfterSeconds?: number },
) {
  const headers = new Headers();
  if (extra?.retryAfterSeconds != null) {
    headers.set("Retry-After", String(extra.retryAfterSeconds));
  }

  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(extra?.fields ? { fields: extra.fields } : {}),
        ...(extra?.retryAfterSeconds != null
          ? { retryAfterSeconds: extra.retryAfterSeconds }
          : {}),
      },
    },
    { status: STATUS[code], headers },
  );
}

/** Thrown by handlers to unwind to a specific response. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Parses and validates a JSON body, flattening Zod issues into a
 * field→message map the client can attach to inputs directly.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("bad_request", "Request body must be valid JSON");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("bad_request", "Some fields need attention", fieldsOf(parsed.error));
  }
  return parsed.data;
}

function fieldsOf(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Wraps a handler so thrown `ApiError`s become responses and anything
 * unexpected becomes a 500 without leaking a stack trace to the client.
 */
export function handler<Args extends unknown[]>(
  fn: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await fn(request, ...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.code, error.message, { fields: error.fields });
      }
      console.error("[api] unhandled error", error);
      return fail("internal", "Something went wrong. Please try again.");
    }
  };
}

/**
 * Loads the signed-in user.
 *
 * Reads the row rather than trusting the token body: the JWT cannot be
 * revoked before expiry, so tier and wallet must come from the database
 * or a cancelled Pro member keeps trade pricing for up to 30 days.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) throw new ApiError("unauthorized", "Sign in to continue");

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      tier: true,
      walletPaise: true,
      isStaff: true,
    },
  });

  /* Token valid but the account is gone — treat as signed out. */
  if (!user) throw new ApiError("unauthorized", "Sign in to continue");

  return user;
}

/**
 * Loads the signed-in user and refuses anyone who is not staff.
 *
 * Read from the row for the same reason `requireUser` is: the session
 * token cannot be revoked before it expires, so a token minted while
 * someone had access would keep working after it was taken away.
 *
 * 404-shaped message on purpose. Confirming that an internal tool exists
 * at this path, to someone who cannot use it, is free reconnaissance.
 */
export async function requireStaff() {
  /* Signed out and signed in without access answer identically. A 401
     here would confirm that an internal tool lives at this path to anyone
     who asked, which is the disclosure the 404 exists to avoid. */
  let user;
  try {
    user = await requireUser();
  } catch {
    throw new ApiError("not_found", "Not found");
  }

  if (!user.isStaff) throw new ApiError("not_found", "Not found");
  return user;
}
