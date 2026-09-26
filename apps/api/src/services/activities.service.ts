import type {
  ActivityListQuery,
  ActivityRecord,
  CreateActivityInput,
  PaginatedResult,
  UpdateActivityInput,
  AuthUser,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake, userRefSelect } from "../lib/crm";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { conciseChanges, writeAuditLog } from "./audit.service";
import { createNotification } from "./notifications.service";
import { ownerForCreate } from "./ownership-policy";

function serializeActivity(row: {
  id: string;
  companyId: string;
  company: { name: string };
  contactId: string | null;
  contact: { name: string } | null;
  opportunityId: string | null;
  opportunity: { name: string } | null;
  type: ActivityRecord["type"];
  occurredAt: Date;
  summary: string;
  outcome: string | null;
  owner: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): ActivityRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    contactId: row.contactId,
    contactName: row.contact?.name ?? null,
    opportunityId: row.opportunityId,
    opportunityName: row.opportunity?.name ?? null,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    summary: row.summary,
    outcome: row.outcome,
    owner: row.owner,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const activityInclude = {
  company: { select: { name: true } },
  contact: { select: { name: true } },
  opportunity: { select: { name: true } },
  owner: { select: userRefSelect },
} as const;

async function assertRelations(
  companyId: string,
  contactId: string | null | undefined,
  opportunityId: string | null | undefined,
) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    throw notFound("Company not found.");
  }

  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { companyId: true },
    });
    if (!contact || contact.companyId !== companyId) {
      throw badRequest("Contact must belong to the selected company.");
    }
  }

  if (opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { companyId: true },
    });
    if (!opportunity || opportunity.companyId !== companyId) {
      throw badRequest("Opportunity must belong to the selected company.");
    }
  }
}

export async function listActivities(
  query: ActivityListQuery,
): Promise<PaginatedResult<ActivityRecord>> {
  const search = query.search.trim();
  const where: Prisma.ActivityWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.contactId ? { contactId: query.contactId } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(search
      ? {
          OR: [
            { summary: { contains: search, mode: "insensitive" } },
            { outcome: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { skip, take } = skipTake(query.page, query.pageSize);
  const orderBy: Prisma.ActivityOrderByWithRelationInput[] = [
    { [query.sort]: query.order },
    { id: "asc" },
  ];
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: activityInclude,
      orderBy,
      skip,
      take,
    }),
    prisma.activity.count({ where }),
  ]);

  return {
    items: rows.map(serializeActivity),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createActivity(actor: AuthUser, input: CreateActivityInput) {
  await assertRelations(
    input.companyId,
    input.contactId,
    input.opportunityId,
  );

  if (input.ownerId && input.ownerId !== actor.id) {
    throw forbidden("Activities can only be logged as the current user.");
  }
  const ownerId = actor.id;
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const row = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        opportunityId: input.opportunityId ?? null,
        type: input.type,
        occurredAt,
        summary: input.summary,
        outcome: input.outcome ?? null,
        ownerId,
      },
      include: activityInclude,
    });

    let nextTask: { id: string; title: string; ownerId: string } | null = null;
    if (input.nextTask) {
      const nextOwnerId = ownerForCreate(actor, input.nextTask.ownerId ?? actor.id) ?? actor.id;
      nextTask = await tx.task.create({
        data: {
          title: input.nextTask.title,
          description: input.nextTask.description ?? null,
          dueAt: new Date(input.nextTask.dueAt),
          ownerId: nextOwnerId,
          companyId: input.companyId,
          contactId: input.contactId ?? null,
          opportunityId: input.opportunityId ?? null,
        }, select: { id: true, title: true, ownerId: true },
      });
      await writeAuditLog({ actorUserId: actor.id, action: "TASK_CREATED", entityType: "TASK", entityId: nextTask.id, entityLabel: nextTask.title, metadata: { ownerId: nextTask.ownerId, createdFromActivityId: activity.id } }, tx);
      if (nextTask.ownerId !== actor.id) {
        await createNotification({ recipientUserId: nextTask.ownerId, type: "TASK_ASSIGNED", title: "Task assigned to you", message: `${nextTask.title} was assigned to you.`, titleAr: "تم تعيين مهمة لك", messageAr: `تم تعيين ${nextTask.title} لك.`, entityType: "TASK", entityId: nextTask.id, link: "/tasks" }, tx);
      }
    }

    await writeAuditLog({ actorUserId: actor.id, action: "ACTIVITY_CREATED", entityType: "ACTIVITY", entityId: activity.id, entityLabel: activity.summary, metadata: { companyId: activity.companyId, ownerId: activity.owner.id } }, tx);

    return activity;
  });

  return serializeActivity(row);
}

export async function updateActivity(id: string, input: UpdateActivityInput, actor: AuthUser) {
  const existing = await prisma.activity.findUnique({ where: { id }, include: { owner: { select: userRefSelect } } });
  if (!existing) {
    throw notFound("Activity not found.");
  }
  if (input.ownerId !== undefined && input.ownerId !== existing.ownerId) {
    throw forbidden("Activity ownership is attribution and cannot be reassigned.");
  }

  await assertRelations(
    input.companyId ?? existing.companyId,
    input.contactId === undefined ? existing.contactId : input.contactId,
    input.opportunityId === undefined ? existing.opportunityId : input.opportunityId,
  );

  const row = await prisma.activity.update({
    where: { id },
    data: {
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.opportunityId !== undefined
        ? { opportunityId: input.opportunityId }
        : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: new Date(input.occurredAt) }
        : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    },
    include: activityInclude,
  });

  const activity = serializeActivity(row);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "ACTIVITY_UPDATED",
    entityType: "ACTIVITY",
    entityId: id,
    entityLabel: activity.summary,
    changes: conciseChanges({ ...existing, owner: existing.owner.name }, { ...activity, owner: activity.owner.name }, ["companyId", "contactId", "opportunityId", "type", "occurredAt", "summary", "outcome", "owner"]),
  });
  return activity;
}

export async function deleteActivity(id: string, actorUserId: string) {
  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Activity not found.");
  }
  await prisma.activity.delete({ where: { id } });
  await writeAuditLog({ actorUserId, action: "ACTIVITY_DELETED", entityType: "ACTIVITY", entityId: id, entityLabel: existing.summary });
  return { ok: true };
}
