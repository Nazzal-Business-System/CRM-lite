import type {
  ContactDetail,
  ContactListQuery,
  ContactSummary,
  CreateContactInput,
  PaginatedResult,
  UpdateContactInput,
} from "@nbs/shared";
import { Prisma } from "../generated/prisma/client";
import { skipTake } from "../lib/crm";
import { conflict, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

function serializeContact(row: {
  id: string;
  companyId: string;
  company: { name: string };
  name: string;
  jobTitle: string | null;
  decisionRole: ContactSummary["decisionRole"];
  email: string | null;
  phone: string | null;
  linkedInUrl: string | null;
  preferredChannel: ContactSummary["preferredChannel"];
  notes?: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ContactDetail {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    name: row.name,
    jobTitle: row.jobTitle,
    decisionRole: row.decisionRole,
    email: row.email,
    phone: row.phone,
    linkedInUrl: row.linkedInUrl,
    preferredChannel: row.preferredChannel,
    notes: row.notes ?? null,
    isPrimary: row.isPrimary,
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

async function assertNotDuplicate(
  companyId: string,
  name: string,
  email: string | null,
  excludeId?: string,
) {
  if (email) {
    const byEmail = await prisma.contact.findFirst({
      where: {
        companyId,
        email,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (byEmail) {
      throw conflict("A contact with this email already exists at this company.");
    }
  }

  const byName = await prisma.contact.findFirst({
    where: {
      companyId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (byName) {
    throw conflict("A contact with this name already exists at this company.");
  }
}

async function syncPrimary(companyId: string, contactId: string, isPrimary: boolean) {
  if (!isPrimary) {
    return;
  }
  await prisma.contact.updateMany({
    where: { companyId, id: { not: contactId } },
    data: { isPrimary: false },
  });
}

export async function listContacts(
  query: ContactListQuery,
): Promise<PaginatedResult<ContactSummary>> {
  const search = query.search.trim();
  const where: Prisma.ContactWhereInput = {
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.decisionRole ? { decisionRole: query.decisionRole } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { jobTitle: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const { skip, take } = skipTake(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { company: { select: { name: true } } },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      skip,
      take,
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    items: rows.map(serializeContact),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listContactOptions(companyId?: string) {
  return prisma.contact.findMany({
    where: companyId ? { companyId } : undefined,
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      companyId: true,
      jobTitle: true,
    },
  });
}

export async function getContact(id: string): Promise<ContactDetail> {
  const row = await prisma.contact.findUnique({
    where: { id },
    include: { company: { select: { name: true } } },
  });
  if (!row) {
    throw notFound("Contact not found.");
  }
  return serializeContact(row);
}

export async function createContact(input: CreateContactInput) {
  await requireCompany(input.companyId);
  await assertNotDuplicate(input.companyId, input.name, input.email ?? null);

  const row = await prisma.contact.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      jobTitle: input.jobTitle ?? null,
      decisionRole: input.decisionRole ?? "UNKNOWN",
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedInUrl: input.linkedInUrl ?? null,
      preferredChannel: input.preferredChannel ?? "EMAIL",
      notes: input.notes ?? null,
      isPrimary: input.isPrimary ?? false,
    },
    include: { company: { select: { name: true } } },
  });

  await syncPrimary(row.companyId, row.id, row.isPrimary);
  return serializeContact(row);
}

export async function updateContact(id: string, input: UpdateContactInput) {
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Contact not found.");
  }

  const companyId = input.companyId ?? existing.companyId;
  if (companyId !== existing.companyId) {
    await requireCompany(companyId);
  }

  const name = input.name ?? existing.name;
  const email = input.email === undefined ? existing.email : input.email;
  await assertNotDuplicate(companyId, name, email, id);

  const row = await prisma.contact.update({
    where: { id },
    data: {
      companyId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.decisionRole !== undefined ? { decisionRole: input.decisionRole } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.linkedInUrl !== undefined ? { linkedInUrl: input.linkedInUrl } : {}),
      ...(input.preferredChannel !== undefined
        ? { preferredChannel: input.preferredChannel }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
    },
    include: { company: { select: { name: true } } },
  });

  await syncPrimary(row.companyId, row.id, row.isPrimary);
  return serializeContact(row);
}

export async function deleteContact(id: string) {
  const existing = await prisma.contact.findUnique({
    where: { id },
    include: {
      _count: { select: { activities: true } },
    },
  });
  if (!existing) {
    throw notFound("Contact not found.");
  }

  if (existing._count.activities > 0) {
    throw conflict(
      "This contact cannot be deleted because it is linked to activity history.",
    );
  }

  await prisma.contact.delete({ where: { id } });
  return { ok: true };
}
