import {
  RECRUITMENT_IN_PROCESS_STAGES,
  RECRUITMENT_STAGES,
  type CreateRecruitmentCandidateInput,
  type PaginatedResult,
  type RecruitmentCandidateDetail,
  type RecruitmentCandidateSummary,
  type RecruitmentListQuery,
  type RecruitmentMetrics,
  type UpdateRecruitmentCandidateInput,
} from "@nbs/shared";
import type { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

function serialize(
  row: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    linkedInUrl: string | null;
    location: string | null;
    source: string;
    roleType: RecruitmentCandidateSummary["roleType"];
    stage: RecruitmentCandidateSummary["stage"];
    experienceSummary: string | null;
    notes: string | null;
    nextAction: string | null;
    nextActionDate: Date | null;
    compensationNotes: string | null;
    rejectionReason: string | null;
    createdBy: { id: string; name: string; email: string };
    createdAt: Date;
    updatedAt: Date;
  },
  detailed = false,
): RecruitmentCandidateSummary | RecruitmentCandidateDetail {
  const base: RecruitmentCandidateSummary = {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    linkedInUrl: row.linkedInUrl,
    location: row.location,
    source: row.source,
    roleType: row.roleType,
    stage: row.stage,
    nextAction: row.nextAction,
    nextActionDate: row.nextActionDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (!detailed) {
    return base;
  }
  return {
    ...base,
    experienceSummary: row.experienceSummary,
    notes: row.notes,
    compensationNotes: row.compensationNotes,
    rejectionReason: row.rejectionReason,
    createdBy: row.createdBy,
  };
}

export async function getRecruitmentMetrics(): Promise<RecruitmentMetrics> {
  const grouped = await prisma.recruitmentCandidate.groupBy({
    by: ["stage"],
    _count: { _all: true },
  });
  const countFor = (stage: (typeof RECRUITMENT_STAGES)[number]) =>
    grouped.find((row) => row.stage === stage)?._count._all ?? 0;

  const byStage = RECRUITMENT_STAGES.map((stage) => ({
    stage,
    count: countFor(stage),
  }));

  return {
    total: byStage.reduce((sum, row) => sum + row.count, 0),
    toContact: countFor("TO_CONTACT"),
    inProcess: RECRUITMENT_IN_PROCESS_STAGES.reduce(
      (sum, stage) => sum + countFor(stage),
      0,
    ),
    interviews: countFor("INTERVIEW"),
    offers: countFor("OFFER"),
    hired: countFor("HIRED"),
    byStage,
  };
}

export async function listRecruitmentCandidates(
  query: RecruitmentListQuery,
): Promise<PaginatedResult<RecruitmentCandidateSummary>> {
  const search = query.search.trim();
  const where: Prisma.RecruitmentCandidateWhereInput = {
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.roleType ? { roleType: query.roleType } : {}),
    ...(query.source
      ? { source: { contains: query.source, mode: "insensitive" } }
      : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { location: { contains: search, mode: "insensitive" } },
            { source: { contains: search, mode: "insensitive" } },
            { nextAction: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const { skip, take } = skipTake(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.recruitmentCandidate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.recruitmentCandidate.count({ where }),
  ]);

  return {
    items: rows.map((row) => serialize(row)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getRecruitmentCandidate(
  id: string,
): Promise<RecruitmentCandidateDetail> {
  const row = await prisma.recruitmentCandidate.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  if (!row) {
    throw notFound("Candidate not found.");
  }
  return serialize(row, true) as RecruitmentCandidateDetail;
}

export async function createRecruitmentCandidate(
  input: CreateRecruitmentCandidateInput,
  userId: string,
): Promise<RecruitmentCandidateDetail> {
  const row = await prisma.recruitmentCandidate.create({
    data: {
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedInUrl: input.linkedInUrl ?? null,
      location: input.location ?? null,
      source: input.source,
      roleType: input.roleType,
      stage: input.stage,
      experienceSummary: input.experienceSummary ?? null,
      notes: input.notes ?? null,
      nextAction: input.nextAction ?? null,
      nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null,
      compensationNotes: input.compensationNotes ?? null,
      rejectionReason: input.rejectionReason ?? null,
      createdById: userId,
    },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return serialize(row, true) as RecruitmentCandidateDetail;
}

export async function updateRecruitmentCandidate(
  id: string,
  input: UpdateRecruitmentCandidateInput,
): Promise<RecruitmentCandidateDetail> {
  const existing = await prisma.recruitmentCandidate.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Candidate not found.");
  }

  const row = await prisma.recruitmentCandidate.update({
    where: { id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.linkedInUrl !== undefined ? { linkedInUrl: input.linkedInUrl } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.roleType !== undefined ? { roleType: input.roleType } : {}),
      ...(input.stage !== undefined ? { stage: input.stage } : {}),
      ...(input.experienceSummary !== undefined
        ? { experienceSummary: input.experienceSummary }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
      ...(input.nextActionDate !== undefined
        ? {
            nextActionDate: input.nextActionDate
              ? new Date(input.nextActionDate)
              : null,
          }
        : {}),
      ...(input.compensationNotes !== undefined
        ? { compensationNotes: input.compensationNotes }
        : {}),
      ...(input.rejectionReason !== undefined
        ? { rejectionReason: input.rejectionReason }
        : {}),
    },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
  return serialize(row, true) as RecruitmentCandidateDetail;
}

export async function deleteRecruitmentCandidate(id: string) {
  const existing = await prisma.recruitmentCandidate.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Candidate not found.");
  }
  await prisma.recruitmentCandidate.delete({ where: { id } });
  return { ok: true };
}
