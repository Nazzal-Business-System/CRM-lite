import {
  defaultProbabilityForStage,
  isClosedStage,
  type CreateOpportunityInput,
  type OpportunityDetail,
  type OpportunityListQuery,
  type OpportunityStage,
  type OpportunitySummary,
  type PaginatedResult,
  type UpdateOpportunityInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { decimalToString, skipTake, userRefSelect, weightedFrom } from "../lib/crm";
import { badRequest, conflict, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

function serializeOpportunity(
  row: {
    id: string;
    companyId: string;
    company: { name: string };
    name: string;
    stage: OpportunityStage;
    estimatedValue: { toFixed(digits: number): string } | null;
    probability: number;
    owner: { id: string; name: string } | null;
    primaryContact: { id: string; name: string } | null;
    expectedCloseDate: Date | null;
    closedAt: Date | null;
    updatedAt: Date;
    summary?: string | null;
    confirmedProblem?: string | null;
    businessImpact?: string | null;
    proposedSolution?: string | null;
    source?: string | null;
    commissionRepresentative?: { id: string; name: string } | null;
    outcomeNotes?: string | null;
    lostReason?: string | null;
    createdAt?: Date;
  },
  nextFollowUpAt: string | null = null,
): OpportunityDetail {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    name: row.name,
    stage: row.stage,
    estimatedValue: decimalToString(row.estimatedValue),
    probability: row.probability,
    weightedValue: weightedFrom(row.estimatedValue, row.probability),
    owner: row.owner,
    primaryContact: row.primaryContact,
    nextFollowUpAt,
    expectedCloseDate: row.expectedCloseDate?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    summary: row.summary ?? null,
    confirmedProblem: row.confirmedProblem ?? null,
    businessImpact: row.businessImpact ?? null,
    proposedSolution: row.proposedSolution ?? null,
    source: row.source ?? null,
    commissionRepresentative: row.commissionRepresentative ?? null,
    outcomeNotes: row.outcomeNotes ?? null,
    lostReason: row.lostReason ?? null,
    createdAt: row.createdAt?.toISOString() ?? row.updatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    throw notFound("Company not found.");
  }
}

async function requireContactInCompany(
  contactId: string | null | undefined,
  companyId: string,
): Promise<string | null | undefined> {
  if (contactId === undefined) {
    return undefined;
  }
  if (contactId == null || contactId === "") {
    return null;
  }
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, companyId: true },
  });
  if (!contact || contact.companyId !== companyId) {
    throw badRequest("Primary contact must belong to the selected company.");
  }
  return contact.id;
}

function stagePatch(
  nextStage: OpportunityStage,
  current: { stage: OpportunityStage; probability: number; lostReason: string | null },
  inputProbability?: number,
  inputLostReason?: string | null,
) {
  const probability =
    inputProbability ??
    (nextStage !== current.stage
      ? defaultProbabilityForStage(nextStage)
      : current.probability);

  if (nextStage === "LOST") {
    const lostReason = inputLostReason ?? current.lostReason;
    if (!lostReason) {
      throw badRequest("A lost reason is required when an opportunity is marked Lost.", {
        lostReason: ["A lost reason is required."],
      });
    }
    return {
      stage: nextStage,
      probability: 0,
      lostReason,
      closedAt: current.stage === "LOST" ? undefined : new Date(),
    };
  }

  if (nextStage === "WON") {
    return {
      stage: nextStage,
      probability: 100,
      lostReason: null,
      closedAt: current.stage === "WON" ? undefined : new Date(),
    };
  }

  return {
    stage: nextStage,
    probability,
    lostReason: null,
    closedAt: isClosedStage(current.stage) ? null : undefined,
  };
}

export async function listOpportunities(
  query: OpportunityListQuery,
): Promise<PaginatedResult<OpportunitySummary>> {
  const search = query.search.trim();
  const where: Prisma.OpportunityWhereInput = {
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            { summary: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const board = query.view === "board";
  const { skip, take } = skipTake(query.page, query.pageSize);

  const [rows, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        company: { select: { name: true } },
        owner: { select: userRefSelect },
        primaryContact: { select: userRefSelect },
      },
      orderBy: [{ updatedAt: "desc" }],
      ...(board ? {} : { skip, take }),
    }),
    prisma.opportunity.count({ where }),
  ]);

  const ids = rows.map((row) => row.id);
  const nextFollowUps =
    ids.length === 0
      ? []
      : await prisma.task.groupBy({
          by: ["opportunityId"],
          where: { opportunityId: { in: ids }, status: "OPEN" },
          _min: { dueAt: true },
        });
  const followMap = new Map(
    nextFollowUps
      .filter((row) => row.opportunityId)
      .map((row) => [row.opportunityId as string, row._min.dueAt]),
  );

  return {
    items: rows.map((row) =>
      serializeOpportunity(row, followMap.get(row.id)?.toISOString() ?? null),
    ),
    total,
    page: query.page,
    pageSize: board ? Math.max(total, 1) : query.pageSize,
  };
}

export async function getOpportunity(id: string): Promise<OpportunityDetail> {
  const row = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      company: { select: { name: true } },
      owner: { select: userRefSelect },
      primaryContact: { select: userRefSelect },
      commissionRepresentative: { select: userRefSelect },
    },
  });
  if (!row) {
    throw notFound("Opportunity not found.");
  }

  const next = await prisma.task.aggregate({
    where: { opportunityId: id, status: "OPEN" },
    _min: { dueAt: true },
  });

  return serializeOpportunity(row, next._min.dueAt?.toISOString() ?? null);
}

export async function createOpportunity(input: CreateOpportunityInput) {
  await requireCompany(input.companyId);
  const primaryContactId = await requireContactInCompany(
    input.primaryContactId,
    input.companyId,
  );
  const stage = input.stage ?? "TARGET";
  const patch = stagePatch(
    stage,
    { stage: "TARGET", probability: defaultProbabilityForStage("TARGET"), lostReason: null },
    input.probability,
    input.lostReason,
  );

  const row = await prisma.opportunity.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      stage: patch.stage,
      probability: patch.probability,
      lostReason: patch.lostReason,
      closedAt: patch.closedAt ?? null,
      primaryContactId: primaryContactId ?? null,
      summary: input.summary ?? null,
      confirmedProblem: input.confirmedProblem ?? null,
      businessImpact: input.businessImpact ?? null,
      proposedSolution: input.proposedSolution ?? null,
      estimatedValue: input.estimatedValue ?? null,
      source: input.source ?? null,
      ownerId: input.ownerId ?? null,
      commissionRepresentativeId: input.commissionRepresentativeId ?? null,
      expectedCloseDate: input.expectedCloseDate
        ? new Date(input.expectedCloseDate)
        : null,
      outcomeNotes: input.outcomeNotes ?? null,
    },
  });

  return getOpportunity(row.id);
}

export async function updateOpportunity(id: string, input: UpdateOpportunityInput) {
  const existing = await prisma.opportunity.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Opportunity not found.");
  }

  const companyId = input.companyId ?? existing.companyId;
  if (companyId !== existing.companyId) {
    await requireCompany(companyId);
  }

  const primaryContactId = await requireContactInCompany(
    input.primaryContactId,
    companyId,
  );

  const nextStage = input.stage ?? existing.stage;
  const patch = stagePatch(
    nextStage,
    {
      stage: existing.stage,
      probability: existing.probability,
      lostReason: existing.lostReason,
    },
    input.probability,
    input.lostReason,
  );

  await prisma.opportunity.update({
    where: { id },
    data: {
      companyId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      stage: patch.stage,
      probability: patch.probability,
      lostReason: patch.lostReason,
      ...(patch.closedAt !== undefined ? { closedAt: patch.closedAt } : {}),
      ...(primaryContactId !== undefined ? { primaryContactId } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.confirmedProblem !== undefined
        ? { confirmedProblem: input.confirmedProblem }
        : {}),
      ...(input.businessImpact !== undefined
        ? { businessImpact: input.businessImpact }
        : {}),
      ...(input.proposedSolution !== undefined
        ? { proposedSolution: input.proposedSolution }
        : {}),
      ...(input.estimatedValue !== undefined
        ? { estimatedValue: input.estimatedValue }
        : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      ...(input.commissionRepresentativeId !== undefined
        ? { commissionRepresentativeId: input.commissionRepresentativeId }
        : {}),
      ...(input.expectedCloseDate !== undefined
        ? {
            expectedCloseDate: input.expectedCloseDate
              ? new Date(input.expectedCloseDate)
              : null,
          }
        : {}),
      ...(input.outcomeNotes !== undefined ? { outcomeNotes: input.outcomeNotes } : {}),
    },
  });

  return getOpportunity(id);
}

export async function deleteOpportunity(id: string) {
  const existing = await prisma.opportunity.findUnique({
    where: { id },
    include: { _count: { select: { activities: true, tasks: true } } },
  });
  if (!existing) {
    throw notFound("Opportunity not found.");
  }
  if (existing._count.activities > 0 || existing._count.tasks > 0) {
    throw conflict(
      "This opportunity cannot be deleted because it has activities or follow-ups.",
    );
  }
  await prisma.opportunity.delete({ where: { id } });
  return { ok: true };
}
