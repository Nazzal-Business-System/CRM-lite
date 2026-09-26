import type { NotificationQuery, NotificationRecord, PaginatedResult } from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

function serializeNotification(row: {
  id: string;
  type: string;
  title: string;
  message: string;
  titleAr: string | null;
  messageAr: string | null;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return { ...row, readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

export async function createNotification(
  input: {
    recipientUserId: string;
    type: string;
    title: string;
    message: string;
    titleAr?: string | null;
    messageAr?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    link?: string | null;
  },
  db: DbClient = prisma,
) {
  return db.notification.create({ data: input });
}

export async function notifyUsersWithPermission(
  permissionKey: string,
  notification: Omit<Parameters<typeof createNotification>[0], "recipientUserId">,
  excludeUserId?: string,
  db: DbClient = prisma,
) {
  const recipients = await db.user.findMany({
    where: {
      isActive: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      role: { permissions: { some: { permission: { key: permissionKey } } } },
    },
    select: { id: true },
  });
  if (recipients.length > 0) {
    await db.notification.createMany({
      data: recipients.map(({ id }) => ({ recipientUserId: id, ...notification })),
    });
  }
}

export async function listNotifications(userId: string, query: NotificationQuery): Promise<PaginatedResult<NotificationRecord> & { unreadCount: number }> {
  const where = { recipientUserId: userId, ...(query.unreadOnly ? { readAt: null } : {}) };
  const { skip, take } = skipTake(query.page, query.pageSize);
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
  ]);
  return { items: rows.map(serializeNotification), total, page: query.page, pageSize: query.pageSize, unreadCount };
}

export async function markNotificationRead(userId: string, id: string) {
  const result = await prisma.notification.updateMany({
    where: { id, recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id, recipientUserId: userId } });
    if (!exists) throw notFound("Notification not found.");
  }
  return { ok: true };
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
  return { ok: true };
}
