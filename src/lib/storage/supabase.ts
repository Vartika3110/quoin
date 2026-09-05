import { env } from "@/lib/env";
import { StorageError, type StorageProvider } from "@/lib/storage";

/**
 * Supabase Storage, over `fetch`.
 *
 * Matches the shape of `src/lib/payments/razorpay.ts`: no SDK (this app
 * has four runtime dependencies and hand-rolls MSG91 and Razorpay for the
 * same reason — three REST calls do not justify a fifth dependency),
 * timeouts on every call, and errors that never leak the provider's own
 * response text to a customer.
 *
 * Every call is authenticated with the **service-role key**, which
 * bypasses row-level security entirely. That is the point: this server
 * mints a signed URL scoped to one object on behalf of a customer who
 * never holds a Supabase credential of their own, and the bucket is
 * private, so nothing here is ever reachable without going through this
 * module first.
 */

const TIMEOUT_MS = 10_000;

function requireConfig(): { base: string; bucket: string; key: string } {
  const base = env.SUPABASE_URL;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !bucket || !key) {
    throw new StorageError("Supabase storage is not configured");
  }
  return { base: base.replace(/\/+$/, ""), bucket, key };
}

/** Every path segment individually — a `storageKey` contains `/` on
    purpose (`kind/uuid.ext`, see `buildStorageKey`), and that slash must
    stay a path separator rather than become `%2F`, so the key is split
    and each segment encoded on its own rather than the whole string. */
function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function call(
  config: { base: string; key: string },
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${config.base}/storage/v1${path}`, {
      ...init,
      headers: {
        /* Kong, Supabase's API gateway, requires `apikey` on every
           request regardless of the route; the service-role key doubles
           as both that and the bearer token, which is how Supabase's own
           server-side examples use it. */
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new StorageError(
      `Could not reach storage: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

export class SupabaseStorageProvider implements StorageProvider {
  /**
   * Signed upload URLs are self-authenticating: the token in the query
   * string is what authorises the `PUT`, not a header, which is exactly
   * why they can be handed to a browser that holds no Supabase
   * credential at all. Fixed by Supabase at a two-hour expiry — there is
   * no `expiresIn` parameter on this endpoint to shorten it, so the
   * returned `expiresAt` states that fact rather than a value this code
   * chose.
   *
   * `maxBytes` is accepted for interface parity with providers (S3
   * presigned POST, for one) that can enforce a size cap at the storage
   * layer itself. Supabase's signed-upload-url endpoint cannot, so the
   * cap here is enforced by the caller instead — at request time against
   * the declared size, and again at `stat()` against the real one, which
   * is what `POST /api/v1/uploads/[id]/confirm` does.
   */
  async createUploadUrl(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<{ url: string; headers?: Record<string, string>; expiresAt: Date }> {
    const config = requireConfig();
    const res = await call(
      config,
      `/object/upload/sign/${config.bucket}/${encodePath(input.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const body = await readJson(res);
    if (!res.ok) {
      throw new StorageError("Storage rejected the upload URL request", res.status);
    }
    const data = body as { url?: unknown } | null;
    if (typeof data?.url !== "string") {
      throw new StorageError("Storage returned an unexpected response");
    }

    return {
      url: `${config.base}/storage/v1${data.url}`,
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  async createDownloadUrl(input: { key: string; expiresInSeconds: number }): Promise<string> {
    const config = requireConfig();
    const res = await call(config, `/object/sign/${config.bucket}/${encodePath(input.key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: input.expiresInSeconds }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw new StorageError("Storage rejected the download URL request", res.status);
    }
    const data = body as { signedURL?: unknown } | null;
    if (typeof data?.signedURL !== "string") {
      throw new StorageError("Storage returned an unexpected response");
    }
    return `${config.base}/storage/v1${data.signedURL}`;
  }

  /**
   * Supabase Storage has no single "get object metadata" call. `list`
   * with the parent prefix and an exact-name search is the documented way
   * the official client itself resolves an object's size and content
   * type without downloading its bytes, so a miss here — nothing at
   * `key` yet, the ordinary state for a freshly-issued upload URL —
   * returns `null` rather than throwing.
   */
  async stat(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
    const config = requireConfig();
    const slash = key.lastIndexOf("/");
    const prefix = slash === -1 ? "" : key.slice(0, slash);
    const name = slash === -1 ? key : key.slice(slash + 1);

    const res = await call(config, `/object/list/${config.bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, search: name, limit: 1 }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      throw new StorageError("Storage rejected the list request", res.status);
    }

    const rows = Array.isArray(body) ? body : [];
    const match = rows.find(
      (row): row is { name: string; metadata?: { size?: number; mimetype?: string } } =>
        typeof row === "object" && row !== null && (row as { name?: unknown }).name === name,
    );
    const sizeBytes = match?.metadata?.size;
    const contentType = match?.metadata?.mimetype;
    if (typeof sizeBytes !== "number" || typeof contentType !== "string") return null;
    return { sizeBytes, contentType };
  }

  /** For server-side reading — a future OCR pass, or staff tooling — not
      for answering a customer's request. Customer downloads always go
      through `createDownloadUrl`, never through this server. */
  async readObject(key: string): Promise<Buffer> {
    const config = requireConfig();
    const res = await call(config, `/object/${config.bucket}/${encodePath(key)}`, {
      method: "GET",
    });
    if (!res.ok) {
      throw new StorageError("Storage rejected the read request", res.status);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteObject(key: string): Promise<void> {
    const config = requireConfig();
    const res = await call(config, `/object/${config.bucket}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok) {
      throw new StorageError("Storage rejected the delete request", res.status);
    }
  }
}
