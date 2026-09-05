import { randomUUID } from "node:crypto";
import type { StoredFileKind } from "@prisma/client";
import { env } from "@/lib/env";
import { SupabaseStorageProvider } from "@/lib/storage/supabase";

/**
 * Object storage.
 *
 * `StoredFile` (prisma/schema.prisma) is the index; this module is where
 * bytes actually go. Kept behind an interface — mirroring
 * `src/lib/payments/razorpay.ts` and `src/lib/auth/sender.ts` — so that a
 * second provider is a new file implementing `StorageProvider`, not a
 * rewrite of every caller. Supabase is the only implementation today,
 * because the database is already Supabase: one vendor, one account, one
 * bill, and the storage service shares the same project credentials.
 */
export interface StorageProvider {
  /**
   * A short-lived URL the *browser* uploads directly to, never a route
   * this server proxies bytes through. Vercel caps a request body at
   * roughly 4.5MB, and a phone's HEIC photo of a parcha routinely exceeds
   * that — a proxy would fail on exactly the files this feature exists
   * for.
   */
  createUploadUrl(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<{ url: string; headers?: Record<string, string>; expiresAt: Date }>;

  /** A short-lived URL to read the object back, minted server-side only. */
  createDownloadUrl(input: { key: string; expiresInSeconds: number }): Promise<string>;

  /**
   * The object's *real* size and content type, read from the bucket
   * itself — never from anything a client declared. Null when nothing
   * exists at `key` yet, which is the ordinary state for a signed URL
   * nobody has uploaded to.
   */
  stat(key: string): Promise<{ sizeBytes: number; contentType: string } | null>;

  /** The full bytes. For server-side reading (a future OCR pass), not for
      answering a request — customer downloads always go through
      `createDownloadUrl`, never through this server. */
  readObject(key: string): Promise<Buffer>;

  deleteObject(key: string): Promise<void>;
}

/** Thrown by every provider implementation on failure, so a route can
    catch one type regardless of which provider is live. Never carries the
    provider's raw response text into a customer-facing message — see the
    callers in `src/app/api/v1/uploads/**`, which log it and return a
    generic error instead, the same discipline `RazorpayError` follows. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Whether uploads can be taken at all.
 *
 * Only Supabase exists today, so this checks Supabase's three variables
 * regardless of `STORAGE_PROVIDER`'s value — an unrecognised selector is
 * handled the same way an unset one is, by falling back to Supabase
 * rather than throwing, so a typo in the selector degrades to "uploads
 * unavailable" instead of a boot failure.
 */
export function isStorageConfigured(): boolean {
  return Boolean(
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_STORAGE_BUCKET,
  );
}

/** The bucket every `StoredFile` row is written against. Read by the
    upload route to fill `StoredFile.bucket` — kept out of the provider
    interface itself because "which bucket" is configuration, not a
    per-call argument any provider method needs. */
export function storageBucketName(): string | null {
  return env.SUPABASE_STORAGE_BUCKET ?? null;
}

let cachedProvider: StorageProvider | null = null;

/**
 * The configured provider, cached for the life of the process.
 *
 * Always returns *something* — it does not throw when unconfigured,
 * matching `getOtpSender()`'s shape (`src/lib/auth/sender.ts`). Individual
 * `StorageProvider` methods are what throw `StorageError` when the
 * underlying credentials are missing, so a route that forgets to check
 * `isStorageConfigured()` first still fails safely rather than silently
 * no-opping.
 */
export function getStorageProvider(): StorageProvider {
  if (!cachedProvider) cachedProvider = new SupabaseStorageProvider();
  return cachedProvider;
}

/* ---- Validation shared by every route in src/app/api/v1/uploads -------- */

/**
 * The MIME allow-list. Named for Parcha because that is the one feature
 * calling this route today, but it is the *only* allow-list — every
 * `StoredFileKind` is validated against it, so a future project-document
 * or product-image upload does not get a quieter check by accident.
 */
export const ACCEPTED_PARCHA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

export type AcceptedContentType = (typeof ACCEPTED_PARCHA_TYPES)[number];

export function isAcceptedContentType(value: string): value is AcceptedContentType {
  return (ACCEPTED_PARCHA_TYPES as readonly string[]).includes(value);
}

const EXTENSION_BY_CONTENT_TYPE: Record<AcceptedContentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
};

/** Only ever called with a content type already checked by
    `isAcceptedContentType` — the return type reflects that. */
export function extensionForContentType(contentType: AcceptedContentType): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType];
}

/**
 * A phone's HEIC photo of a parcha is routinely 3-8MB; an XLSX export of a
 * large materials list is smaller still. 25MB leaves headroom for both
 * without opening the door to arbitrary large files sitting PENDING
 * forever.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** How long a customer's own download link stays valid. Long enough to
    open on a slow connection, short enough that a link pasted somewhere
    else is not a standing leak. */
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/** Sliding window for rate-limiting upload-URL issuance, mirroring the OTP
    idiom (`src/app/api/v1/auth/otp/request/route.ts`): counted straight
    off `StoredFile.createdAt` rather than a dedicated table, because every
    issued URL already writes a row and a second table would just be the
    same count kept twice. */
export const UPLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const UPLOAD_RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * Builds the path an object is stored at.
 *
 * Deliberately takes no filename. `StoredFile.originalName` is
 * attacker-controlled text — a client can send `../../etc/passwd` or
 * `photo.jpg.exe` as easily as a real name — and the only way a value
 * like that cannot end up inside a storage path is for the function that
 * builds paths to never see it at all. The key is built entirely from a
 * server-generated id and an extension already derived from the
 * *validated* content type (`extensionForContentType`), never from
 * anything the client named.
 */
export function buildStorageKey(input: {
  kind: StoredFileKind;
  contentType: AcceptedContentType;
}): string {
  const id = randomUUID();
  const extension = extensionForContentType(input.contentType);
  return `${input.kind.toLowerCase()}/${id}.${extension}`;
}
