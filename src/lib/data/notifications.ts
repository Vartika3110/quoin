import { Prisma, type NotificationKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * In-app notifications — see the `Notification` model for why in-app only.
 *
 * `notify` is called from the side of writes that matter far more than it
 * does: a settled payment, a staff status change, a booking. So it never
 * throws. A notification that fails to write costs a customer a bell dot;
 * a notification write that fails a webhook costs Razorpay a retry storm
 * and the customer a PAID order that looks unpaid. Callers invoke it
 * *after* their own transaction has committed, never inside it.
 */

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Same-origin path. Anything else is dropped rather than stored. */
  href?: string;
  /** Makes a repeated call a no-op — see `Notification.dedupeKey`. */
  dedupeKey?: string;
}

/** A path on this site, and not `//host` (protocol-relative) either. */
function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 160),
        body: (input.body ?? "").slice(0, 500),
        href: safeHref(input.href),
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return; // Already told them — the retry this key exists for.
    }
    console.error("[notifications] failed to write", { kind: input.kind, error });
  }
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(
  userId: string,
  limit = 20,
): Promise<{ items: NotificationView[]; unreadCount: number }> {
  const take = Math.min(Math.max(1, Math.trunc(limit) || 20), 50);
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      read: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

/**
 * Marks the caller's own notifications read — the given ids, or all of
 * them. `userId` is in the `where`, so a stranger's id in `ids` matches
 * nothing rather than being checked afterwards.
 */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
