import type {
  ActivityListQuery,
  ActivityRecord,
  CreateActivityInput,
  PaginatedResult,
  UpdateActivityInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake, userRefSelect } from "../lib/crm";
import { badRequest, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

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
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: activityInclude,
      orderBy: { occurredAt: "desc" },
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

export async function createActivity(userId: string, input: CreateActivityInput) {
  await assertRelations(
    input.companyId,
    input.contactId,
    input.opportunityId,
  );

  const ownerId = input.ownerId ?? userId;
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

    if (input.nextTask) {
      await tx.task.create({
        data: {
          title: input.nextTask.title,
          description: input.nextTask.description ?? null,
          dueAt: new Date(input.nextTask.dueAt),
          ownerId: input.nextTask.ownerId ?? ownerId,
          companyId: input.companyId,
          contactId: input.contactId ?? null,
          opportunityId: input.opportunityId ?? null,
        },
      });
    }

    return activity;
  });

  return serializeActivity(row);
}

export async function updateActivity(id: string, input: UpdateActivityInput) {
  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Activity not found.");
  }

  await assertRelations(
    existing.companyId,
    input.contactId === undefined ? existing.contactId : input.contactId,
    input.opportunityId === undefined ? existing.opportunityId : input.opportunityId,
  );

  const row = await prisma.activity.update({
    where: { id },
    data: {
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

  return serializeActivity(row);
}

export async function deleteActivity(id: string) {
  const existing = await prisma.activity.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Activity not found.");
  }
  await prisma.activity.delete({ where: { id } });
  return { ok: true };
}
