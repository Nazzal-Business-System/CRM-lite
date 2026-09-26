import type {
  CreateTaskInput,
  PaginatedResult,
  TaskListQuery,
  TaskRecord,
  UpdateTaskInput,
  AuthUser,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { endOfDay, skipTake, startOfDay, userRefSelect } from "../lib/crm";
import { badRequest, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { conciseChanges, writeAuditLog } from "./audit.service";
import { createNotification } from "./notifications.service";
import { assertOwnerUpdateAllowed, ownerForCreate } from "./ownership-policy";

const taskInclude = {
  owner: { select: userRefSelect },
  company: { select: { name: true } },
  contact: { select: { name: true } },
  opportunity: { select: { name: true } },
} as const;

function serializeTask(row: {
  id: string;
  title: string;
  description: string | null;
  dueAt: Date;
  status: TaskRecord["status"];
  owner: { id: string; name: string };
  companyId: string | null;
  company: { name: string } | null;
  contactId: string | null;
  contact: { name: string } | null;
  opportunityId: string | null;
  opportunity: { name: string } | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    owner: row.owner,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    contactId: row.contactId,
    contactName: row.contact?.name ?? null,
    opportunityId: row.opportunityId,
    opportunityName: row.opportunity?.name ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertTaskRelations(input: {
  companyId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
}) {
  if (input.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true },
    });
    if (!company) {
      throw notFound("Company not found.");
    }
  }

  if (input.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { companyId: true },
    });
    if (!contact) {
      throw notFound("Contact not found.");
    }
    if (input.companyId && contact.companyId !== input.companyId) {
      throw badRequest("Contact must belong to the selected company.");
    }
  }

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { companyId: true },
    });
    if (!opportunity) {
      throw notFound("Opportunity not found.");
    }
    if (input.companyId && opportunity.companyId !== input.companyId) {
      throw badRequest("Opportunity must belong to the selected company.");
    }
  }
}

async function assertActiveOwner(ownerId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { isActive: true },
  });
  if (!owner?.isActive) {
    throw badRequest("Owner must be an active CRM user.");
  }
}

export async function listTasks(
  query: TaskListQuery,
  currentUserId: string,
): Promise<PaginatedResult<TaskRecord>> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const search = query.search.trim();

  const dueFilter: Prisma.TaskWhereInput =
    query.due === "overdue"
      ? { status: "OPEN", dueAt: { lt: todayStart } }
      : query.due === "today"
        ? { status: "OPEN", dueAt: { gte: todayStart, lte: todayEnd } }
        : query.due === "upcoming"
          ? { status: "OPEN", dueAt: { gt: todayEnd } }
          : query.due === "completed"
            ? { status: "COMPLETED" }
            : {};

  const where: Prisma.TaskWhereInput = {
    ...dueFilter,
    ...(query.status ? { status: query.status } : {}),
    ...(query.scope === "mine" ? { ownerId: currentUserId } : {}),
    ...(query.ownerId && query.scope !== "mine" ? { ownerId: query.ownerId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.contactId ? { contactId: query.contactId } : {}),
    ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { skip, take } = skipTake(query.page, query.pageSize);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
    { [query.sort]: query.order },
    { id: "asc" },
  ];
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy,
      skip,
      take,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    items: rows.map(serializeTask),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createTask(input: CreateTaskInput, actor: AuthUser) {
  await assertTaskRelations(input);
  const ownerId = ownerForCreate(actor, input.ownerId);
  if (!ownerId) throw badRequest("Owner is required.");
  await assertActiveOwner(ownerId);

  const row = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      dueAt: new Date(input.dueAt),
      ownerId,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
    },
    include: taskInclude,
  });
  const task = serializeTask(row);
  await writeAuditLog({ actorUserId: actor.id, action: "TASK_CREATED", entityType: "TASK", entityId: task.id, entityLabel: task.title, metadata: { ownerId: task.owner.id } });
  if (task.owner.id !== actor.id) {
    await createNotification({ recipientUserId: task.owner.id, type: "TASK_ASSIGNED", title: "Task assigned to you", message: `${task.title} was assigned to you.`, titleAr: "تم تعيين مهمة لك", messageAr: `تم تعيين ${task.title} لك.`, entityType: "TASK", entityId: task.id, link: "/tasks" });
  }
  return task;
}

export async function updateTask(id: string, input: UpdateTaskInput, actor: AuthUser) {
  const existing = await prisma.task.findUnique({ where: { id }, include: { owner: { select: userRefSelect } } });
  if (!existing) {
    throw notFound("Task not found.");
  }
  if (input.ownerId !== undefined) {
    assertOwnerUpdateAllowed(actor, existing.ownerId, input.ownerId);
    await assertActiveOwner(input.ownerId);
  }

  await assertTaskRelations({
    companyId: input.companyId === undefined ? existing.companyId : input.companyId,
    contactId: input.contactId === undefined ? existing.contactId : input.contactId,
    opportunityId:
      input.opportunityId === undefined ? existing.opportunityId : input.opportunityId,
  });

  const nextStatus = input.status ?? existing.status;
  const completedAt =
    nextStatus === "COMPLETED"
      ? existing.completedAt ?? new Date()
      : nextStatus === "OPEN"
        ? null
        : existing.completedAt;

  const row = await prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.opportunityId !== undefined
        ? { opportunityId: input.opportunityId }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      completedAt,
    },
    include: taskInclude,
  });

  const task = serializeTask(row);
  const changes = conciseChanges(
    { ...existing, owner: existing.owner.name },
    { ...task, owner: task.owner.name },
    ["title", "description", "dueAt", "status", "owner", "companyId", "contactId", "opportunityId", "completedAt"],
  );
  const ownerChanged = existing.ownerId !== task.owner.id;
  const statusChanged = existing.status !== task.status;
  await writeAuditLog({ actorUserId: actor.id, action: ownerChanged ? "TASK_OWNER_CHANGED" : statusChanged ? (task.status === "COMPLETED" ? "TASK_COMPLETED" : "TASK_REOPENED") : "TASK_UPDATED", entityType: "TASK", entityId: id, entityLabel: task.title, changes });
  if (ownerChanged && task.owner.id !== actor.id) {
    await createNotification({ recipientUserId: task.owner.id, type: "TASK_ASSIGNED", title: "Task assigned to you", message: `${task.title} was assigned to you.`, titleAr: "تم تعيين مهمة لك", messageAr: `تم تعيين ${task.title} لك.`, entityType: "TASK", entityId: id, link: "/tasks" });
  }
  if (ownerChanged && existing.owner.id !== actor.id) {
    await createNotification({ recipientUserId: existing.owner.id, type: "TASK_REASSIGNED", title: "Task reassigned", message: `${task.title} was reassigned.`, titleAr: "تمت إعادة تعيين المهمة", messageAr: `تمت إعادة تعيين ${task.title}.`, entityType: "TASK", entityId: id, link: "/tasks" });
  }
  return task;
}

export async function completeTask(id: string, actor: AuthUser) {
  return updateTask(id, { status: "COMPLETED" }, actor);
}

export async function deleteTask(id: string, actorUserId: string) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Task not found.");
  }
  await prisma.task.delete({ where: { id } });
  await writeAuditLog({ actorUserId, action: "TASK_DELETED", entityType: "TASK", entityId: id, entityLabel: existing.title });
  return { ok: true };
}
