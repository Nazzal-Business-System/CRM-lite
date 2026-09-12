import type {
  CreateEvidenceInput,
  CreateHypothesisInput,
  HypothesisRecord,
  ResearchEvidenceRecord,
  ResearchListQuery,
  UpdateEvidenceInput,
  UpdateHypothesisInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake, userRefSelect } from "../lib/crm";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

function serializeEvidence(
  row: {
    id: string;
    companyId: string;
    company?: { name: string };
    title: string;
    details: string;
    category: ResearchEvidenceRecord["category"];
    sourceUrl: string | null;
    sourceName: string | null;
    observedAt: Date | null;
    createdBy: { id: string; name: string };
    createdAt: Date;
    updatedAt: Date;
  },
): ResearchEvidenceRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name,
    title: row.title,
    details: row.details,
    category: row.category,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    observedAt: row.observedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeHypothesis(row: {
  id: string;
  companyId: string;
  company?: { name: string };
  statement: string;
  status: HypothesisRecord["status"];
  supportingContext: string | null;
  createdBy: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): HypothesisRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name,
    statement: row.statement,
    status: row.status,
    supportingContext: row.supportingContext,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
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

export async function listEvidenceForCompany(companyId: string) {
  await requireCompany(companyId);
  const rows = await prisma.researchEvidence.findMany({
    where: { companyId },
    include: { createdBy: { select: userRefSelect } },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serializeEvidence);
}

export async function createEvidence(
  companyId: string,
  userId: string,
  input: CreateEvidenceInput,
) {
  await requireCompany(companyId);
  const row = await prisma.researchEvidence.create({
    data: {
      companyId,
      title: input.title,
      details: input.details,
      category: input.category ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceName: input.sourceName ?? null,
      observedAt: input.observedAt ? new Date(input.observedAt) : null,
      createdById: userId,
    },
    include: { createdBy: { select: userRefSelect } },
  });
  return serializeEvidence(row);
}

export async function updateEvidence(id: string, input: UpdateEvidenceInput) {
  const existing = await prisma.researchEvidence.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Evidence not found.");
  }

  const row = await prisma.researchEvidence.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.sourceName !== undefined ? { sourceName: input.sourceName } : {}),
      ...(input.observedAt !== undefined
        ? { observedAt: input.observedAt ? new Date(input.observedAt) : null }
        : {}),
    },
    include: { createdBy: { select: userRefSelect } },
  });
  return serializeEvidence(row);
}

export async function deleteEvidence(id: string) {
  const existing = await prisma.researchEvidence.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Evidence not found.");
  }
  await prisma.researchEvidence.delete({ where: { id } });
  return { ok: true };
}

export async function listHypothesesForCompany(companyId: string) {
  await requireCompany(companyId);
  const rows = await prisma.hypothesis.findMany({
    where: { companyId },
    include: { createdBy: { select: userRefSelect } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeHypothesis);
}

export async function createHypothesis(
  companyId: string,
  userId: string,
  input: CreateHypothesisInput,
) {
  await requireCompany(companyId);
  const row = await prisma.hypothesis.create({
    data: {
      companyId,
      statement: input.statement,
      status: input.status ?? "UNTESTED",
      supportingContext: input.supportingContext ?? null,
      createdById: userId,
    },
    include: { createdBy: { select: userRefSelect } },
  });
  return serializeHypothesis(row);
}

export async function updateHypothesis(id: string, input: UpdateHypothesisInput) {
  const existing = await prisma.hypothesis.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Hypothesis not found.");
  }
  const row = await prisma.hypothesis.update({
    where: { id },
    data: {
      ...(input.statement !== undefined ? { statement: input.statement } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.supportingContext !== undefined
        ? { supportingContext: input.supportingContext }
        : {}),
    },
    include: { createdBy: { select: userRefSelect } },
  });
  return serializeHypothesis(row);
}

export async function deleteHypothesis(id: string) {
  const existing = await prisma.hypothesis.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Hypothesis not found.");
  }
  await prisma.hypothesis.delete({ where: { id } });
  return { ok: true };
}

export async function listResearch(query: ResearchListQuery) {
  const search = query.search.trim();
  const { skip, take } = skipTake(query.page, query.pageSize);

  const evidenceWhere = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { details: { contains: search, mode: "insensitive" as const } },
            { company: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const hypothesisWhere = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.hypothesisStatus ? { status: query.hypothesisStatus } : {}),
    ...(search
      ? {
          OR: [
            { statement: { contains: search, mode: "insensitive" as const } },
            { company: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const evidenceOrderBy: Prisma.ResearchEvidenceOrderByWithRelationInput[] = [
    query.sort === "companyName"
      ? { company: { name: query.order } }
      : { [query.sort]: query.order },
    { id: "asc" },
  ];
  const hypothesisOrderBy: Prisma.HypothesisOrderByWithRelationInput[] = [
    query.sort === "companyName"
      ? { company: { name: query.order } }
      : { [query.sort]: query.order },
    { id: "asc" },
  ];

  const [evidence, evidenceTotal, hypotheses, hypothesisTotal] = await Promise.all([
    prisma.researchEvidence.findMany({
      where: evidenceWhere,
      include: {
        createdBy: { select: userRefSelect },
        company: { select: { name: true } },
      },
      orderBy: evidenceOrderBy,
      skip,
      take,
    }),
    prisma.researchEvidence.count({ where: evidenceWhere }),
    prisma.hypothesis.findMany({
      where: hypothesisWhere,
      include: {
        createdBy: { select: userRefSelect },
        company: { select: { name: true } },
      },
      orderBy: hypothesisOrderBy,
      skip,
      take,
    }),
    prisma.hypothesis.count({ where: hypothesisWhere }),
  ]);

  return {
    evidence: {
      items: evidence.map(serializeEvidence),
      total: evidenceTotal,
      page: query.page,
      pageSize: query.pageSize,
    },
    hypotheses: {
      items: hypotheses.map(serializeHypothesis),
      total: hypothesisTotal,
      page: query.page,
      pageSize: query.pageSize,
    },
  };
}
