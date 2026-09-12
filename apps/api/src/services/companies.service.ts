import {
  computeQualification,
  normalizeCompanyName,
  normalizeWebsiteDomain,
  type CompanyListQuery,
  type CreateCompanyInput,
  type UpdateCompanyInput,
  type CompanyDetail,
  type CompanySummary,
  type PaginatedResult,
  type UserRef,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { conflict, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

const ownerSelect = { id: true, name: true } as const;

async function assertOwner(ownerId: string | null | undefined): Promise<string | null | undefined> {
  if (ownerId === undefined) {
    return undefined;
  }
  if (ownerId == null || ownerId === "") {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, isActive: true },
  });
  if (!user) {
    throw conflict("Selected owner was not found.");
  }
  return user.id;
}

async function assertUniqueCompany(
  nameNormalized: string,
  websiteDomain: string | null,
  excludeId?: string,
) {
  const duplicate = await prisma.company.findFirst({
    where: {
      AND: [
        excludeId ? { id: { not: excludeId } } : {},
        {
          OR: [
            { nameNormalized },
            websiteDomain ? { websiteDomain } : { id: "__never__" },
          ],
        },
      ],
    },
    select: { id: true, name: true, websiteDomain: true, nameNormalized: true },
  });

  if (!duplicate) {
    return;
  }

  if (duplicate.nameNormalized === nameNormalized) {
    throw conflict("A company with this name already exists.");
  }
  throw conflict("A company with this website already exists.");
}

function qualificationFrom(input: {
  companyFit?: number | null;
  problemPotential?: number | null;
  decisionMakerAccess?: number | null;
}) {
  return computeQualification(
    input.companyFit,
    input.problemPotential,
    input.decisionMakerAccess,
  );
}

const companyListSelect = {
  id: true,
  name: true,
  website: true,
  sector: true,
  companySize: true,
  locations: true,
  source: true,
  companyFit: true,
  problemPotential: true,
  decisionMakerAccess: true,
  qualificationScore: true,
  priority: true,
  owner: { select: ownerSelect },
  createdAt: true,
  updatedAt: true,
} as const;

type CompanyListRow = Prisma.CompanyGetPayload<{ select: typeof companyListSelect }>;

const PRIORITY_RANK: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
const SIZE_RANK: Record<CompanySummary["companySize"], number> = {
  UNKNOWN: 0,
  SOLO: 1,
  SMALL: 2,
  MEDIUM: 3,
  LARGE: 4,
  ENTERPRISE: 5,
};

/** Heal stale persisted priority/score so filters and display share one source of truth. */
async function syncStoredQualification(rows: CompanyListRow[]): Promise<void> {
  const updates = rows.flatMap((row) => {
    const next = computeQualification(
      row.companyFit,
      row.problemPotential,
      row.decisionMakerAccess,
    );
    if (
      row.priority === next.priority &&
      row.qualificationScore === next.qualificationScore
    ) {
      return [];
    }
    return [
      prisma.company.update({
        where: { id: row.id },
        data: {
          priority: next.priority,
          qualificationScore: next.qualificationScore,
        },
      }),
    ];
  });
  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

function buildCompanySearchWhere(query: CompanyListQuery): Prisma.CompanyWhereInput {
  const search = query.search.trim();
  return {
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.sector
      ? { sector: { contains: query.sector, mode: "insensitive" } }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sector: { contains: search, mode: "insensitive" } },
            { website: { contains: search, mode: "insensitive" } },
            { locations: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function compareCompanies(
  a: CompanySummary,
  b: CompanySummary,
  query: CompanyListQuery,
): number {
  const direction = query.order === "asc" ? 1 : -1;
  let result = 0;

  if (query.sort === "name") {
    result = a.name.localeCompare(b.name);
  } else if (query.sort === "priority") {
    if (a.priority == null || b.priority == null) {
      if (a.priority !== b.priority) return a.priority == null ? 1 : -1;
    } else result = (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0);
  } else if (query.sort === "qualificationScore") {
    if (a.qualificationScore == null || b.qualificationScore == null) {
      if (a.qualificationScore !== b.qualificationScore) return a.qualificationScore == null ? 1 : -1;
    } else result = a.qualificationScore - b.qualificationScore;
  } else if (query.sort === "companySize") {
    if (a.companySize === "UNKNOWN" || b.companySize === "UNKNOWN") {
      if (a.companySize !== b.companySize) return a.companySize === "UNKNOWN" ? 1 : -1;
    } else result = SIZE_RANK[a.companySize] - SIZE_RANK[b.companySize];
  } else if (query.sort === "nextFollowUpAt") {
    if (a.nextFollowUpAt == null || b.nextFollowUpAt == null) {
      if (a.nextFollowUpAt !== b.nextFollowUpAt) return a.nextFollowUpAt == null ? 1 : -1;
    } else result = Date.parse(a.nextFollowUpAt) - Date.parse(b.nextFollowUpAt);
  } else {
    result = Date.parse(query.sort === "createdAt" ? a.createdAt : a.updatedAt) -
      Date.parse(query.sort === "createdAt" ? b.createdAt : b.updatedAt);
  }
  return result === 0 ? a.name.localeCompare(b.name) : result * direction;
}

async function attachListMetrics(
  companies: Array<{
    id: string;
    name: string;
    website: string | null;
    sector: string | null;
    companySize: CompanySummary["companySize"];
    locations: string | null;
    source: CompanySummary["source"];
    companyFit: number | null;
    problemPotential: number | null;
    decisionMakerAccess: number | null;
    qualificationScore: number | null;
    priority: CompanySummary["priority"];
    owner: UserRef | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): Promise<CompanySummary[]> {
  if (companies.length === 0) {
    return [];
  }

  const ids = companies.map((company) => company.id);
  const [activeCounts, nextFollowUps, lastActivities] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ["companyId"],
      where: {
        companyId: { in: ids },
        stage: { notIn: ["WON", "LOST"] },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["companyId"],
      where: {
        companyId: { in: ids },
        status: "OPEN",
      },
      _min: { dueAt: true },
    }),
    prisma.activity.groupBy({
      by: ["companyId"],
      where: { companyId: { in: ids } },
      _max: { occurredAt: true },
    }),
  ]);

  const activeMap = new Map(
    activeCounts.map((row) => [row.companyId, row._count._all]),
  );
  const followUpMap = new Map(
    nextFollowUps
      .filter((row) => row.companyId)
      .map((row) => [row.companyId as string, row._min.dueAt]),
  );
  const activityMap = new Map(
    lastActivities.map((row) => [row.companyId, row._max.occurredAt]),
  );

  return companies.map((company) => {
    const qualification = computeQualification(
      company.companyFit,
      company.problemPotential,
      company.decisionMakerAccess,
    );
    return {
      id: company.id,
      name: company.name,
      website: company.website,
      sector: company.sector,
      companySize: company.companySize,
      locations: company.locations,
      source: company.source,
      qualificationScore: qualification.qualificationScore,
      priority: qualification.priority,
      accessPending: qualification.accessPending,
      owner: company.owner,
      activeOpportunityCount: activeMap.get(company.id) ?? 0,
      nextFollowUpAt: followUpMap.get(company.id)?.toISOString() ?? null,
      lastActivityAt: activityMap.get(company.id)?.toISOString() ?? null,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  });
}

export async function listCompanies(
  query: CompanyListQuery,
): Promise<PaginatedResult<CompanySummary>> {
  // Filter/sort by the same computeQualification() used for display — not a stale DB priority.
  const rows = await prisma.company.findMany({
    where: buildCompanySearchWhere(query),
    select: companyListSelect,
  });

  await syncStoredQualification(rows);

  const filtered = query.priority
    ? rows.filter(
        (row) =>
          computeQualification(
            row.companyFit,
            row.problemPotential,
            row.decisionMakerAccess,
          ).priority === query.priority,
      )
    : rows;

  const companies = await attachListMetrics(filtered);
  companies.sort((a, b) => compareCompanies(a, b, query));

  const total = companies.length;
  const { skip, take } = skipTake(query.page, query.pageSize);
  const pageRows = companies.slice(skip, skip + take);

  return {
    items: pageRows,
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listCompanyOptions(search = "") {
  return prisma.company.findMany({
    where: search.trim()
      ? { name: { contains: search.trim(), mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
    take: 30,
    select: { id: true, name: true },
  });
}

export async function getCompany(id: string): Promise<CompanyDetail> {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      owner: { select: ownerSelect },
      _count: {
        select: {
          contacts: true,
          opportunities: true,
          tasks: { where: { status: "OPEN" } },
        },
      },
    },
  });

  if (!company) {
    throw notFound("Company not found.");
  }

  const [summary] = await attachListMetrics([company]);

  return {
    ...summary!,
    companyFit: company.companyFit,
    problemPotential: company.problemPotential,
    decisionMakerAccess: company.decisionMakerAccess,
    generalNotes: company.generalNotes,
    contactCount: company._count.contacts,
    opportunityCount: company._count.opportunities,
    openTaskCount: company._count.tasks,
  };
}

export async function createCompany(input: CreateCompanyInput) {
  const nameNormalized = normalizeCompanyName(input.name);
  const websiteDomain = normalizeWebsiteDomain(input.website);
  const ownerId = await assertOwner(input.ownerId);
  const qualification = qualificationFrom(input);

  await assertUniqueCompany(nameNormalized, websiteDomain);

  const company = await prisma.company.create({
    data: {
      name: input.name.trim(),
      nameNormalized,
      website: input.website ?? null,
      websiteDomain,
      sector: input.sector ?? null,
      companySize: input.companySize ?? "UNKNOWN",
      locations: input.locations ?? null,
      source: input.source ?? "RESEARCH",
      companyFit: input.companyFit ?? null,
      problemPotential: input.problemPotential ?? null,
      decisionMakerAccess: input.decisionMakerAccess ?? null,
      qualificationScore: qualification.qualificationScore,
      priority: qualification.priority,
      ownerId: ownerId ?? null,
      generalNotes: input.generalNotes ?? null,
    },
  });

  return getCompany(company.id);
}

export async function updateCompany(id: string, input: UpdateCompanyInput) {
  const existing = await prisma.company.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Company not found.");
  }

  const name = input.name?.trim() ?? existing.name;
  const nameNormalized = normalizeCompanyName(name);
  const website =
    input.website === undefined ? existing.website : input.website;
  const websiteDomain = normalizeWebsiteDomain(website);
  const ownerId = await assertOwner(input.ownerId);

  if (
    nameNormalized !== existing.nameNormalized ||
    websiteDomain !== existing.websiteDomain
  ) {
    await assertUniqueCompany(nameNormalized, websiteDomain, id);
  }

  const companyFit =
    input.companyFit === undefined ? existing.companyFit : input.companyFit;
  const problemPotential =
    input.problemPotential === undefined
      ? existing.problemPotential
      : input.problemPotential;
  const decisionMakerAccess =
    input.decisionMakerAccess === undefined
      ? existing.decisionMakerAccess
      : input.decisionMakerAccess;
  const qualification = computeQualification(
    companyFit,
    problemPotential,
    decisionMakerAccess,
  );

  await prisma.company.update({
    where: { id },
    data: {
      name,
      nameNormalized,
      ...(input.website !== undefined ? { website, websiteDomain } : {}),
      ...(input.sector !== undefined ? { sector: input.sector } : {}),
      ...(input.companySize !== undefined ? { companySize: input.companySize } : {}),
      ...(input.locations !== undefined ? { locations: input.locations } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.companyFit !== undefined ? { companyFit: input.companyFit } : {}),
      ...(input.problemPotential !== undefined
        ? { problemPotential: input.problemPotential }
        : {}),
      ...(input.decisionMakerAccess !== undefined
        ? { decisionMakerAccess: input.decisionMakerAccess }
        : {}),
      qualificationScore: qualification.qualificationScore,
      priority: qualification.priority,
      ...(ownerId !== undefined ? { ownerId } : {}),
      ...(input.generalNotes !== undefined ? { generalNotes: input.generalNotes } : {}),
    },
  });

  return getCompany(id);
}

export async function deleteCompany(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          opportunities: true,
          activities: true,
          tasks: true,
        },
      },
    },
  });

  if (!company) {
    throw notFound("Company not found.");
  }

  const blockers: string[] = [];
  if (company._count.opportunities > 0) {
    blockers.push("opportunities");
  }
  if (company._count.activities > 0) {
    blockers.push("activities");
  }
  if (company._count.tasks > 0) {
    blockers.push("follow-ups");
  }

  if (blockers.length > 0) {
    throw conflict(
      `This company cannot be deleted because it has ${blockers.join(", ")}. Historical CRM records are preserved.`,
    );
  }

  await prisma.company.delete({ where: { id } });
  return { ok: true };
}

export async function findCompanyDuplicates(input: {
  nameNormalized: string;
  websiteDomain: string | null;
  excludeId?: string;
}) {
  return prisma.company.findMany({
    where: {
      AND: [
        input.excludeId ? { id: { not: input.excludeId } } : {},
        {
          OR: [
            { nameNormalized: input.nameNormalized },
            input.websiteDomain
              ? { websiteDomain: input.websiteDomain }
              : { id: "__never__" },
          ],
        },
      ],
    },
    select: { id: true, name: true },
    take: 5,
  });
}
