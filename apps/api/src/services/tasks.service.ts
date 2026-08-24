import type {
  CreateTaskInput,
  PaginatedResult,
  TaskListQuery,
  TaskRecord,
  UpdateTaskInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { endOfDay, skipTake, startOfDay, userRefSelect } from "../lib/crm";
import { badRequest, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

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
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
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

export async function createTask(input: CreateTaskInput) {
  await assertTaskRelations(input);
  const owner = await prisma.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true },
  });
  if (!owner) {
    throw notFound("Owner not found.");
  }

  const row = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      dueAt: new Date(input.dueAt),
      ownerId: input.ownerId,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
    },
    include: taskInclude,
  });
  return serializeTask(row);
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Task not found.");
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

  return serializeTask(row);
}

export async function completeTask(id: string) {
  return updateTask(id, { status: "COMPLETED" });
}

export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Task not found.");
  }
  await prisma.task.delete({ where: { id } });
  return { ok: true };
}
