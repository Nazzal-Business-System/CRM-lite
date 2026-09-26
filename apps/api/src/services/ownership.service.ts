import {
  PERMISSION_KEYS,
  type OwnershipEntityType,
  type OwnershipRequestQuery,
  type OwnershipRequestRecord,
  type PaginatedResult,
  type AuthUser,
  hasPermission,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { conflict, forbidden, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { createNotification, notifyUsersWithPermission } from "./notifications.service";

type DbClient = typeof prisma | Prisma.TransactionClient;

const personSelect = { id: true, name: true } as const;

function linkFor(type: OwnershipEntityType, id: string) {
  return type === "COMPANY" ? `/companies/${id}` : type === "OPPORTUNITY" ? `/opportunities/${id}` : "/tasks";
}

function viewPermissionFor(type: OwnershipEntityType) {
  return type === "COMPANY"
    ? PERMISSION_KEYS.COMPANIES_VIEW
    : type === "OPPORTUNITY"
      ? PERMISSION_KEYS.OPPORTUNITIES_VIEW
      : PERMISSION_KEYS.TASKS_VIEW;
}

async function getAssignableRecord(db: DbClient, type: OwnershipEntityType, id: string) {
  if (type === "COMPANY") {
    const row = await db.company.findUnique({ where: { id }, select: { id: true, name: true, ownerId: true } });
    return row ? { id: row.id, label: row.name, ownerId: row.ownerId } : null;
  }
  if (type === "OPPORTUNITY") {
    const row = await db.opportunity.findUnique({ where: { id }, select: { id: true, name: true, ownerId: true } });
    return row ? { id: row.id, label: row.name, ownerId: row.ownerId } : null;
  }
  const row = await db.task.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true } });
  return row ? { id: row.id, label: row.title, ownerId: row.ownerId } : null;
}

async function setOwnerIfCurrent(db: Prisma.TransactionClient, type: OwnershipEntityType, id: string, currentOwnerId: string | null, ownerId: string) {
  const where = { id, ownerId: currentOwnerId };
  if (type === "COMPANY") return db.company.updateMany({ where, data: { ownerId } });
  if (type === "OPPORTUNITY") return db.opportunity.updateMany({ where, data: { ownerId } });
  return db.task.updateMany({ where: { id, ownerId: currentOwnerId ?? "__no_owner__" }, data: { ownerId } });
}

function serializeRequest(row: {
  id: string; entityType: OwnershipEntityType; entityId: string; entityLabel: string;
  requester: { id: string; name: string }; currentOwner: { id: string; name: string } | null;
  requestedOwner: { id: string; name: string }; status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: { id: string; name: string } | null; reviewedAt: Date | null; rejectionReason: string | null;
  createdAt: Date; updatedAt: Date;
}): OwnershipRequestRecord {
  return { ...row, reviewedAt: row.reviewedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

const requestInclude = {
  requester: { select: personSelect },
  currentOwner: { select: personSelect },
  requestedOwner: { select: personSelect },
  reviewedBy: { select: personSelect },
} as const;

export async function createOwnershipRequest(actor: AuthUser, entityType: OwnershipEntityType, entityId: string) {
  const actorUserId = actor.id;
  if (hasPermission(actor.permissions, PERMISSION_KEYS.OWNERSHIP_ASSIGN)) {
    throw conflict("You can assign ownership directly and do not need an approval request.");
  }
  const viewPermission = viewPermissionFor(entityType);
  if (!hasPermission(actor.permissions, viewPermission)) {
    throw forbidden("You do not have access to this record type.");
  }
  const [record, actorRecord] = await Promise.all([
    getAssignableRecord(prisma, entityType, entityId),
    prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, name: true, isActive: true } }),
  ]);
  if (!record) throw notFound("Assignable record not found.");
  if (!actorRecord?.isActive) throw forbidden();
  if (record.ownerId === actorUserId) throw conflict("You already own this record.");

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.ownershipRequest.create({
        data: {
          entityType,
          entityId,
          entityLabel: record.label,
          requesterUserId: actorUserId,
          currentOwnerId: record.ownerId,
          requestedOwnerId: actorUserId,
        },
        include: requestInclude,
      });
      await writeAuditLog({ actorUserId, action: "OWNERSHIP_REQUESTED", entityType, entityId, entityLabel: record.label, metadata: { currentOwnerId: record.ownerId, requestedOwnerId: actorUserId } }, tx);
      await notifyUsersWithPermission(
        PERMISSION_KEYS.OWNERSHIP_REQUESTS_MANAGE,
        { type: "OWNERSHIP_REQUESTED", title: "Ownership request", message: `${actorRecord.name} requested ownership of ${record.label}.`, titleAr: "طلب ملكية جديد", messageAr: `طلب ${actorRecord.name} ملكية ${record.label}.`, entityType, entityId, link: "/admin/ownership-requests" },
        actorUserId,
        tx,
      );
      return serializeRequest(request);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("An ownership request is already pending for this record.");
    }
    throw error;
  }
}

export async function getMyPendingOwnershipRequest(userId: string, entityType: OwnershipEntityType, entityId: string) {
  const row = await prisma.ownershipRequest.findFirst({
    where: { requesterUserId: userId, entityType, entityId, status: "PENDING" },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
  });
  return row ? serializeRequest(row) : null;
}

export async function listOwnershipRequests(query: OwnershipRequestQuery): Promise<PaginatedResult<OwnershipRequestRecord>> {
  const where = { ...(query.status ? { status: query.status } : {}), ...(query.entityType ? { entityType: query.entityType } : {}) };
  const { skip, take } = skipTake(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.ownershipRequest.findMany({ where, include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    prisma.ownershipRequest.count({ where }),
  ]);
  return { items: rows.map(serializeRequest), total, page: query.page, pageSize: query.pageSize };
}

export async function reviewOwnershipRequest(reviewerUserId: string, requestId: string, decision: "APPROVE" | "REJECT", rejectionReason?: string | null) {
  try {
    return await prisma.$transaction(async (tx) => {
    const request = await tx.ownershipRequest.findUnique({ where: { id: requestId }, include: requestInclude });
    if (!request) throw notFound("Ownership request not found.");
    if (request.status !== "PENDING") throw conflict("This ownership request has already been reviewed.");

    const requester = await tx.user.findUnique({
      where: { id: request.requesterUserId },
      select: { isActive: true, role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const requesterPermissions = requester?.role.permissions.map((entry) => entry.permission.key) ?? [];
    if (
      !requester?.isActive ||
      !requesterPermissions.includes(PERMISSION_KEYS.OWNERSHIP_REQUESTS_CREATE) ||
      !requesterPermissions.includes(viewPermissionFor(request.entityType))
    ) {
      throw conflict("The requester is no longer eligible to own this record.");
    }
    const record = await getAssignableRecord(tx, request.entityType, request.entityId);
    if (!record) throw conflict("The requested record no longer exists.");
    if (record.ownerId !== request.currentOwnerId) throw conflict("Ownership changed after this request was submitted. Review the current record before continuing.");

    if (decision === "APPROVE") {
      const changed = await setOwnerIfCurrent(tx, request.entityType, request.entityId, request.currentOwnerId, request.requestedOwnerId);
      if (changed.count !== 1) throw conflict("Ownership changed while this request was being reviewed.");
    }

    const updatedCount = await tx.ownershipRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedByUserId: reviewerUserId, reviewedAt: new Date(), rejectionReason: decision === "REJECT" ? rejectionReason ?? null : null },
    });
    if (updatedCount.count !== 1) throw conflict("This ownership request was reviewed by another administrator.");

    const action = decision === "APPROVE" ? "OWNERSHIP_REQUEST_APPROVED" : "OWNERSHIP_REQUEST_REJECTED";
    await writeAuditLog({
      actorUserId: reviewerUserId,
      action,
      entityType: request.entityType,
      entityId: request.entityId,
      entityLabel: request.entityLabel,
      metadata: { requestId: request.id, requesterUserId: request.requesterUserId, rejectionReason: decision === "REJECT" ? rejectionReason ?? null : null },
      changes: decision === "APPROVE" ? [{ field: "owner", before: request.currentOwner?.name ?? null, after: request.requestedOwner.name }] : [],
    }, tx);
    await createNotification({
      recipientUserId: request.requesterUserId,
      type: action,
      title: decision === "APPROVE" ? "Ownership request approved" : "Ownership request rejected",
      message: decision === "APPROVE" ? `Your ownership request for ${request.entityLabel} was approved.` : `Your ownership request for ${request.entityLabel} was rejected${rejectionReason ? `: ${rejectionReason}` : "."}`,
      titleAr: decision === "APPROVE" ? "تمت الموافقة على طلب الملكية" : "تم رفض طلب الملكية",
      messageAr: decision === "APPROVE" ? `تمت الموافقة على طلبك لملكية ${request.entityLabel}.` : `تم رفض طلبك لملكية ${request.entityLabel}${rejectionReason ? `: ${rejectionReason}` : "."}`,
      entityType: request.entityType,
      entityId: request.entityId,
      link: linkFor(request.entityType, request.entityId),
    }, tx);
    if (
      decision === "APPROVE" &&
      request.currentOwnerId &&
      request.currentOwnerId !== reviewerUserId &&
      request.currentOwnerId !== request.requesterUserId
    ) {
      await createNotification({
        recipientUserId: request.currentOwnerId,
        type: "OWNERSHIP_TRANSFERRED",
        title: "Record ownership changed",
        message: `${request.entityLabel} was reassigned to ${request.requestedOwner.name}.`,
        titleAr: "تغيّرت ملكية السجل",
        messageAr: `تمت إعادة تعيين ${request.entityLabel} إلى ${request.requestedOwner.name}.`,
        entityType: request.entityType,
        entityId: request.entityId,
        link: linkFor(request.entityType, request.entityId),
      }, tx);
    }
    const updated = await tx.ownershipRequest.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });
    return serializeRequest(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw conflict("This ownership request changed while it was being reviewed. Refresh and try again.");
    }
    throw error;
  }
}
