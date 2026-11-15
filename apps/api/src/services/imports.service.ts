import {
  COMPANY_IMPORT_COLUMNS,
  COMPANY_SIZE_IMPORT_VALUES,
  COMPANY_SIZE_LABELS,
  COMPANY_SOURCE_IMPORT_VALUES,
  COMPANY_SOURCE_LABELS,
  computeQualification,
  CONTACT_IMPORT_COLUMNS,
  DECISION_ROLE_LABELS,
  emptyToNull,
  normalizeCompanyName,
  normalizeWebsiteDomain,
  parseCompanySize,
  parseCompanySource,
  parseDecisionRole,
  parseOptionalEmail,
  parseOptionalScore,
  parseOptionalUrl,
  parsePreferredChannel,
  PREFERRED_CHANNEL_LABELS,
  type CompanySize,
  type CompanySource,
  type DecisionRole,
  type ImportCommitInput,
  type ImportEntity,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportResult,
  type PreferredChannel,
  type AuthUser,
  hasPermission,
  PERMISSION_KEYS,
} from "@nbs/shared";
import ExcelJS from "exceljs";
import { marketContext } from "../lib/market-context";
import { assertMarketOwnerEligibility } from "../lib/market-access";
import { prisma } from "../lib/prisma";
import { AppError, badRequest } from "../lib/errors";
import { logger } from "../lib/logger";
import { rowsFromSpreadsheet } from "../lib/spreadsheet";
import { findCompanyDuplicates } from "./companies.service";
import { writeAuditLog } from "./audit.service";
import { createNotification } from "./notifications.service";

import { COUNTRY_CODES } from "@nbs/shared";
import { listSalesMarkets, validateCompanyTerritory } from "./markets.service";

async function importTerritory(values: Record<string, string | null>, messages: string[]) {
  try {
    return await validateCompanyTerritory(cell(values, "Country Code"), cell(values, "Sales Market"));
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 400) throw error;
    messages.push(...(error.fields ? Object.values(error.fields).flat() : [error.message]));
    return null;
  }
}

function cell(values: Record<string, string | null>, header: string): string {
  const raw = values[header];
  if (raw == null) {
    return "";
  }
  return emptyToNull(String(raw)) ?? "";
}

function pushParseError(
  messages: string[],
  error: string | null,
): void {
  if (error) {
    messages.push(error);
  }
}

function isBlockingMessage(message: string): boolean {
  return (
    message.includes("required") ||
    message.includes("unsupported") ||
    message.includes("must be") ||
    message.includes("not found") ||
    message.includes("no active CRM user")
  );
}

function rowMessage(
  entity: "COMPANIES" | "CONTACTS",
  companyNumber: number,
  message: string,
): string {
  const label = entity === "CONTACTS" ? "Contact" : "Company";
  return `${label} ${companyNumber} — ${message}`;
}

function truthy(raw: string): boolean { return ["1", "true", "yes", "y"].includes(raw.trim().toLowerCase()); }
function validatePrimary(raw: string, messages: string[]) {
  if (raw && !["1", "0", "true", "false", "yes", "no", "y", "n"].includes(raw.trim().toLowerCase())) messages.push("Primary: must be Yes, No or blank.");
}
function companyNameIndex<T extends { nameNormalized: string }>(companies: T[]) {
  const result=new Map<string,T[]>();for(const company of companies)result.set(company.nameNormalized,[...(result.get(company.nameNormalized)??[]),company]);return result;
}

async function validateImportOwnerEmail(raw: string, messages: string[], marketCode?: string): Promise<void> {
  const ownerEmail = parseOptionalEmail(raw, "Owner Email");
  pushParseError(messages, ownerEmail.error);
  if (ownerEmail.error || !ownerEmail.value) {
    return;
  }
  const owner = await prisma.user.findFirst({
    where: { email: ownerEmail.value, isActive: true },
    select: { id: true },
  });
  if (!owner) {
    messages.push(`Owner Email: no active CRM user matches "${ownerEmail.value}"`);
  } else if (marketContext.getStore()?.actor() && owner.id !== marketContext.getStore()!.actor()!.id && !hasPermission(marketContext.getStore()!.actor()!.permissions, PERMISSION_KEYS.OWNERSHIP_ASSIGN)) {
    messages.push("Owner Email: must be your own account.");
  } else if (marketCode) {
    try { await assertMarketOwnerEligibility(prisma, owner.id, marketCode); }
    catch (error) {
      if (!(error instanceof AppError) || error.status !== 400) throw error;
      messages.push("Owner Email: must be eligible for the selected market.");
    }
  }
}

async function resolveImportOwnerId(
  ownerEmailRaw: string,
  importerUserId: string,
  messages: string[],
): Promise<string | null> {
  const ownerEmail = parseOptionalEmail(ownerEmailRaw, "Owner Email");
  pushParseError(messages, ownerEmail.error);
  if (ownerEmail.error) {
    return null;
  }
  if (!ownerEmail.value) {
    return importerUserId;
  }

  const owner = await prisma.user.findFirst({
    where: { email: ownerEmail.value, isActive: true },
    select: { id: true },
  });
  if (!owner) {
    messages.push(`Owner Email: no active CRM user matches "${ownerEmail.value}"`);
    return null;
  }
  return owner.id;
}

async function rowsFromBuffer(
  filename: string,
  buffer: Buffer,
  entity: ImportEntity,
): Promise<Record<string, string | null>[]> {
  try {
    return await rowsFromSpreadsheet(filename, buffer, entity);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("IMPORT_HEADERS:")) throw badRequest(error.message.slice("IMPORT_HEADERS:".length).trim());
    if (error instanceof Error && error.message === "FILE_TYPE") {
      throw badRequest("Upload a .csv or .xlsx file.");
    }
    logger.error({ err: error, filename }, "Import spreadsheet parse failed");
    throw badRequest(
      "The file could not be read. Use the CRM template headers in the first row, then CSV or XLSX data rows.",
    );
  }
}

async function previewCompanies(
  filename: string,
  rawRows: Record<string, string | null>[],
): Promise<ImportPreview> {
  const existing = await prisma.company.findMany({
    select: { name: true, nameNormalized: true, websiteDomain: true },
  });
  const names = new Map(existing.map((row) => [row.nameNormalized, row.name]));
  const domains = new Map(
    existing
      .filter((row) => row.websiteDomain)
      .map((row) => [row.websiteDomain as string, row.name]),
  );
  const seenNames = new Map<string, number>();
  const seenDomains = new Map<string, number>();
  const rows: ImportPreviewRow[] = [];

  for (const [index, values] of rawRows.entries()) {
    const messages: string[] = [];
    const name = cell(values, "Company Name");
    if (!name) {
      messages.push("Company name is required.");
    }

    const territory = await importTerritory(values, messages);
    const rowNumber = index + 1;
    pushParseError(messages, parseCompanySize(cell(values, "Company Size")).error);
    pushParseError(messages, parseCompanySource(cell(values, "Source")).error);
    const fit = parseOptionalScore(cell(values, "Company Fit"), "Company Fit");
    const problem = parseOptionalScore(
      cell(values, "Problem Potential"),
      "Problem Potential",
    );
    const access = parseOptionalScore(
      cell(values, "Decision-Maker Access"),
      "Decision-Maker Access",
    );
    pushParseError(messages, fit.error);
    pushParseError(messages, problem.error);
    pushParseError(messages, access.error);
    pushParseError(messages, parseOptionalUrl(cell(values, "Website"), "Website").error);
    await validateImportOwnerEmail(cell(values, "Owner Email"), messages, territory?.salesMarketCode);
    pushParseError(
      messages,
      parseOptionalUrl(cell(values, "Evidence Source URL"), "Evidence Source URL").error,
    );

    if (fit.value == null && !fit.error) {
      messages.push(
        "Company Fit blank — Qualification and Priority stay Not scored until Fit and Problem Potential are set.",
      );
    } else if (problem.value == null && !problem.error) {
      messages.push(
        "Problem Potential blank — Qualification and Priority stay Not scored until Fit and Problem Potential are set.",
      );
    } else if (access.value == null && !access.error) {
      messages.push(
        "Decision-Maker Access blank — Priority uses Fit + Problem Potential for now; Access pending until known.",
      );
    }

    const website = cell(values, "Website");
    const sector = cell(values, "Sector");
    const nameNormalized = name ? normalizeCompanyName(name) : "";
    const websiteDomain = normalizeWebsiteDomain(website || null);

    if (name && !website) {
      messages.push("Website is missing.");
    }
    if (name && !sector) {
      messages.push("Sector is missing.");
    }

    if (nameNormalized) {
      const previous = seenNames.get(nameNormalized);
      if (previous) {
        messages.push(`Duplicate company name in this file (company ${previous}).`);
      } else {
        seenNames.set(nameNormalized, rowNumber);
      }
    }
    if (websiteDomain) {
      const previous = seenDomains.get(websiteDomain);
      if (previous) {
        messages.push(`Duplicate website in this file (company ${previous}).`);
      } else {
        seenDomains.set(websiteDomain, rowNumber);
      }
    }

    if (nameNormalized) {
      const match =
        names.get(nameNormalized) ??
        (websiteDomain ? domains.get(websiteDomain) : undefined);
      if (match) {
        messages.push(`Possible duplicate of ${match}.`);
      }
    }

    const invalid = messages.some(isBlockingMessage);
    const warning = !invalid && messages.length > 0;

    rows.push({
      rowNumber,
      status: invalid ? "INVALID" : warning ? "WARNING" : "READY",
      included: !invalid,
      values,
      messages: messages.map((message) => rowMessage("COMPANIES", rowNumber, message)),
    });
  }

  return {
    entity: "COMPANIES",
    filename,
    rows,
    counts: {
      total: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      warning: rows.filter((row) => row.status === "WARNING").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
    },
  };
}

async function previewContacts(
  filename: string,
  rawRows: Record<string, string | null>[],
): Promise<ImportPreview> {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, nameNormalized: true },
  });
  const companyByName = companyNameIndex(companies);
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = [];

  for (const [index, values] of rawRows.entries()) {
    const messages: string[] = [];
    const companyName = cell(values, "Company Name");
    const name = cell(values, "Name");
    if (!companyName) {
      messages.push("Company name is required.");
    }
    if (!name) {
      messages.push("Contact name is required.");
    }

    const matches = companyByName.get(normalizeCompanyName(companyName)) ?? [];
    const company = matches.length === 1 ? matches[0] : undefined;
    if (matches.length > 1) messages.push("Company Name: must match exactly one accessible company; multiple matches found.");
    validatePrimary(cell(values,"Primary"),messages);
    if (companyName && !company) {
      messages.push("Company was not found in your accessible markets. Import companies first or check the exact name and market access.");
    }

    pushParseError(messages, parseDecisionRole(cell(values, "Decision Role")).error);
    pushParseError(messages, parsePreferredChannel(cell(values, "Preferred Channel")).error);
    pushParseError(messages, parseOptionalEmail(cell(values, "Email"), "Email").error);
    pushParseError(messages, parseOptionalUrl(cell(values, "LinkedIn URL"), "LinkedIn URL").error);

    const email = parseOptionalEmail(cell(values, "Email"), "Email").value ?? "";

    const keys = [`${company?.id ?? companyName}:name:${name.toLowerCase()}`, ...(email ? [`${company?.id ?? companyName}:email:${email}`] : [])];
    if (keys.some(key=>seen.has(key))) messages.push("Duplicate contact in this file.");
    if (name) keys.forEach(key=>seen.add(key));

    if (company && name) {
      const existing = await prisma.contact.findFirst({
        where: {
          companyId: company.id,
          OR: [
            email ? { email: { equals: email, mode: "insensitive" } } : { id: "__never__" },
            { name: { equals: name, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        messages.push("Possible duplicate contact at this company.");
      }
    }

    const rowNumber = index + 1;
    const invalid = messages.some(isBlockingMessage);

    rows.push({
      rowNumber,
      status: invalid ? "INVALID" : messages.length > 0 ? "WARNING" : "READY",
      included: !invalid,
      values,
      messages: messages.map((message) => rowMessage("CONTACTS", rowNumber, message)),
    });
  }

  return {
    entity: "CONTACTS",
    filename,
    rows,
    counts: {
      total: rows.length,
      ready: rows.filter((row) => row.status === "READY").length,
      warning: rows.filter((row) => row.status === "WARNING").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
    },
  };
}

export async function parseImportFile(
  entity: ImportEntity,
  filename: string,
  buffer: Buffer,
): Promise<ImportPreview> {
  const rawRows = await rowsFromBuffer(filename, buffer, entity);
  if (rawRows.length === 0) {
    throw badRequest("The file did not contain any data rows.");
  }
  if (entity === "CONTACTS") {
    return previewContacts(filename, rawRows);
  }
  return previewCompanies(filename, rawRows);
}

export async function commitImport(
  entity: ImportEntity,
  input: ImportCommitInput,
  actor: AuthUser,
): Promise<ImportResult> {
  const userId = actor.id;
  const result: ImportResult = {
    entity,
    total: input.rows.length,
    created: 0,
    skipped: 0,
    invalid: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  };

  if (entity === "COMPANIES") {
    const seenInBatch = new Set<string>();
    for (const row of input.rows) {
      if (!row.included) {
        result.skipped += 1;
        continue;
      }
      const messages: string[] = [];
      const name = cell(row.values, "Company Name");
      if (!name) {
        result.invalid += 1;
        result.errors.push({ rowNumber: row.rowNumber, message: "Company name is required." });
        continue;
      }
      const territory = await importTerritory(row.values, messages);
      if (!territory) { result.invalid++; result.errors.push({rowNumber:row.rowNumber,message:rowMessage("COMPANIES",row.rowNumber,messages.join(" "))}); continue; }
      const nameNormalized = normalizeCompanyName(name);
      const websiteDomain = normalizeWebsiteDomain(cell(row.values, "Website") || null);
      const batchKey = `${nameNormalized}::${websiteDomain ?? ""}`;
      if (seenInBatch.has(batchKey)) {
        result.duplicates += 1;
        continue;
      }
      const duplicates = await findCompanyDuplicates({ nameNormalized, websiteDomain });
      if (duplicates.length > 0) {
        result.duplicates += 1;
        continue;
      }
      seenInBatch.add(batchKey);

      const companyFit = parseOptionalScore(cell(row.values, "Company Fit"), "Company Fit");
      const problemPotential = parseOptionalScore(
        cell(row.values, "Problem Potential"),
        "Problem Potential",
      );
      const decisionMakerAccess = parseOptionalScore(
        cell(row.values, "Decision-Maker Access"),
        "Decision-Maker Access",
      );
      const companySize = parseCompanySize(cell(row.values, "Company Size"));
      const source = parseCompanySource(cell(row.values, "Source"));
      const website = parseOptionalUrl(cell(row.values, "Website"), "Website");
      const evidenceUrl = parseOptionalUrl(
        cell(row.values, "Evidence Source URL"),
        "Evidence Source URL",
      );
      pushParseError(messages, companyFit.error);
      pushParseError(messages, problemPotential.error);
      pushParseError(messages, decisionMakerAccess.error);
      pushParseError(messages, companySize.error);
      pushParseError(messages, source.error);
      pushParseError(messages, website.error);
      pushParseError(messages, evidenceUrl.error);
      const ownerId = await resolveImportOwnerId(
        cell(row.values, "Owner Email"),
        userId,
        messages,
      );
      if (
        ownerId &&
        ownerId !== userId &&
        !hasPermission(actor.permissions, PERMISSION_KEYS.OWNERSHIP_ASSIGN)
      ) {
        messages.push("Owner Email: must be your own account");
      }

      if (ownerId && territory) {
        try { await assertMarketOwnerEligibility(prisma,ownerId,territory.salesMarketCode); }
        catch(error) { if (!(error instanceof AppError) || error.status !== 400) throw error; messages.push("Owner Email: must be eligible for the selected market."); }
      }
      if (messages.some(isBlockingMessage) || !ownerId || !territory) {
        result.invalid += 1;
        result.errors.push({
          rowNumber: row.rowNumber,
          message: rowMessage("COMPANIES", row.rowNumber, messages[0] ?? "Invalid row."),
        });
        continue;
      }

      const qualification = computeQualification(
        companyFit.value,
        problemPotential.value,
        decisionMakerAccess.value,
      );

      try {
        const company = await prisma.company.create({
          data: {
            ...territory,
            name,
            nameNormalized,
            website: website.value,
            websiteDomain,
            sector: cell(row.values, "Sector") || null,
            companySize: (companySize.value ?? "UNKNOWN") as CompanySize,
            locations: cell(row.values, "Locations") || null,
            source: (source.value ?? "RESEARCH") as CompanySource,
            companyFit: companyFit.value,
            problemPotential: problemPotential.value,
            decisionMakerAccess: decisionMakerAccess.value,
            qualificationScore: qualification.qualificationScore,
            priority: qualification.priority,
            ownerId,
            generalNotes: cell(row.values, "General Notes") || null,
          },
        });

        const evidenceTitle = cell(row.values, "Evidence Title");
        const evidenceDetails = cell(row.values, "Evidence Details");
        if (evidenceTitle && evidenceDetails) {
          await prisma.researchEvidence.create({
            data: {
              companyId: company.id,
              title: evidenceTitle,
              details: evidenceDetails,
              sourceUrl: evidenceUrl.value,
              sourceName: cell(row.values, "Evidence Source Name") || null,
              createdById: userId,
            },
          });
        }

        const hypothesis = cell(row.values, "Hypothesis Statement");
        if (hypothesis) {
          await prisma.hypothesis.create({
            data: {
              companyId: company.id,
              statement: hypothesis,
              supportingContext: cell(row.values, "Hypothesis Context") || null,
              createdById: userId,
              status: "UNTESTED",
            },
          });
        }

        await writeAuditLog({ actorUserId: userId, action: "COMPANY_CREATED", entityType: "COMPANY", entityId: company.id, entityLabel: company.name, metadata: { ownerId, source: "IMPORT", importRow: row.rowNumber } });
        if (ownerId !== userId) {
          await createNotification({ recipientUserId: ownerId, type: "COMPANY_ASSIGNED", title: "Company assigned to you", message: `${company.name} was assigned to you through an import.`, titleAr: "تم تعيين شركة لك", messageAr: `تم تعيين ${company.name} لك من خلال الاستيراد.`, entityType: "COMPANY", entityId: company.id, link: `/companies/${company.id}` });
        }

        result.created += 1;
      } catch (error) {
        logger.error({ err: error, rowNumber: row.rowNumber }, "Import company row failed");
        result.failed += 1;
        result.errors.push({
          rowNumber: row.rowNumber,
          message: rowMessage("COMPANIES", row.rowNumber, "This row could not be imported."),
        });
      }
    }
    await writeAuditLog({ actorUserId: userId, action: result.failed > 0 ? "IMPORT_COMPLETED_WITH_ERRORS" : "IMPORT_COMPLETED", entityType: "IMPORT", entityLabel: "Companies import", metadata: { ...result, errors: result.errors.slice(0, 20) } });
    return result;
  }

  const companies = await prisma.company.findMany({
    select: { id: true, nameNormalized: true },
  });
  const companyByName = companyNameIndex(companies);

  for (const row of input.rows) {
    if (!row.included) {
      result.skipped += 1;
      continue;
    }
    const companyName = cell(row.values, "Company Name");
    const name = cell(row.values, "Name");
    const matches = companyByName.get(normalizeCompanyName(companyName)) ?? [];
    const companyId = matches.length === 1 ? matches[0]!.id : undefined;
    if (!companyId || !name) {
      result.invalid += 1;
      result.errors.push({
        rowNumber: row.rowNumber,
        message: rowMessage("CONTACTS",row.rowNumber,!companyId ? matches.length>1 ? "Company Name: must match exactly one accessible company; multiple matches found." : "Company was not found in your accessible markets." : "Contact name is required."),
      });
      continue;
    }

    const emailParsed = parseOptionalEmail(cell(row.values, "Email"), "Email");
    if (emailParsed.error) {
      result.invalid += 1;
      result.errors.push({
        rowNumber: row.rowNumber,
        message: rowMessage("CONTACTS", row.rowNumber, emailParsed.error),
      });
      continue;
    }
    const email = emailParsed.value;
    const existing = await prisma.contact.findFirst({
      where: {
        companyId,
        OR: [
          email ? { email: { equals: email, mode: "insensitive" } } : { id: "__never__" },
          { name: { equals: name, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    const messages: string[] = [];
    validatePrimary(cell(row.values,"Primary"), messages);
    const decisionRole = parseDecisionRole(cell(row.values, "Decision Role"));
    const preferredChannel = parsePreferredChannel(cell(row.values, "Preferred Channel"));
    const linkedIn = parseOptionalUrl(cell(row.values, "LinkedIn URL"), "LinkedIn URL");
    pushParseError(messages, decisionRole.error);
    pushParseError(messages, preferredChannel.error);
    pushParseError(messages, linkedIn.error);
    if (messages.some(isBlockingMessage)) {
      result.invalid += 1;
      result.errors.push({
        rowNumber: row.rowNumber,
        message: rowMessage("CONTACTS", row.rowNumber, messages[0] ?? "Invalid row."),
      });
      continue;
    }

    try {
      const contact = await prisma.contact.create({
        data: {
          companyId,
          name,
          jobTitle: cell(row.values, "Job Title") || null,
          decisionRole: (decisionRole.value ?? "UNKNOWN") as DecisionRole,
          email,
          phone: cell(row.values, "Phone") || null,
          linkedInUrl: linkedIn.value,
          preferredChannel: (preferredChannel.value ?? "EMAIL") as PreferredChannel,
          notes: cell(row.values, "Notes") || null,
          isPrimary: truthy(cell(row.values, "Primary")),
        },
      });
      await writeAuditLog({ actorUserId: userId, action: "CONTACT_CREATED", entityType: "CONTACT", entityId: contact.id, entityLabel: contact.name, metadata: { companyId, source: "IMPORT", importRow: row.rowNumber } });
      result.created += 1;
    } catch {
      result.failed += 1;
      result.errors.push({
        rowNumber: row.rowNumber,
        message: rowMessage("CONTACTS", row.rowNumber, "This row could not be imported."),
      });
    }
  }

  await writeAuditLog({ actorUserId: userId, action: result.failed > 0 ? "IMPORT_COMPLETED_WITH_ERRORS" : "IMPORT_COMPLETED", entityType: "IMPORT", entityLabel: "Contacts import", metadata: { ...result, errors: result.errors.slice(0, 20) } });
  return result;
}

export async function buildTemplateWorkbook(entity: ImportEntity): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(entity === "CONTACTS" ? "Contacts" : "Companies");
  const columns = entity === "CONTACTS" ? CONTACT_IMPORT_COLUMNS : COMPANY_IMPORT_COLUMNS;
  sheet.addRow([...columns]);
  sheet.getRow(1).font = { bold: true };
  columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = 24;
  });

  const lastRow = 200;
  const addList = (header: string, values: readonly string[]) => {
    const col = (columns as readonly string[]).indexOf(header) + 1;
    if (col < 1) {
      return;
    }
    const validation: ExcelJS.DataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${values.join(",")}"`],
      showErrorMessage: true,
      error: "Use a value from the template list.",
    };
    for (let row = 2; row <= lastRow; row += 1) {
      sheet.getCell(row, col).dataValidation = validation;
    }
  };

  if (entity === "COMPANIES") {
    const references = workbook.addWorksheet("Territory codes", { state: "hidden" });
    const markets = await listSalesMarkets();
    COUNTRY_CODES.forEach((code, i) => { references.getCell(i + 1, 1).value = code; });
    markets.forEach((market, i) => { references.getCell(i + 1, 2).value = market.code; });
    workbook.definedNames.add(`'Territory codes'!$A$1:$A$${COUNTRY_CODES.length}`, "CountryCodes");
    if (markets.length) workbook.definedNames.add(`'Territory codes'!$B$1:$B$${markets.length}`, "SalesMarkets");
    for (const [header, reference] of [["Country Code", "CountryCodes"], ["Sales Market", "SalesMarkets"]]) {
      if (reference === "SalesMarkets" && !markets.length) continue;
      const column = (columns as readonly string[]).indexOf(header!) + 1;
      for (let row = 2; row <= lastRow; row++) sheet.getCell(row, column).dataValidation = {
        type: "list", allowBlank: false, formulae: [reference!], showErrorMessage: true,
        error: "Choose an explicit country or configured sales market code.",
      };
    }
    addList("Company Size", COMPANY_SIZE_IMPORT_VALUES);
    addList("Source", COMPANY_SOURCE_IMPORT_VALUES);
  } else {
    addList("Decision Role", Object.values(DECISION_ROLE_LABELS));
    addList("Preferred Channel", Object.values(PREFERRED_CHANNEL_LABELS));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const COMPANY_AI_PROMPT = `You are preparing structured company research for NBS CRM.

Return a spreadsheet that matches this import structure exactly. Use these column headers, in this order:

${COMPANY_IMPORT_COLUMNS.join(" | ")}

Rules:
- File format: CSV or XLSX.
- Company Name, Country Code and Sales Market are required.
- Country Code is the actual location, using an ISO alpha-2 code (JO, GB, US, etc.).
- Sales Market is an explicitly chosen operational territory code, initially JO, UK, US or OTHER. UK is a market; GB is the country code. Never infer or default market from country.
- Optional columns may be left blank; missing optional fields are valid.
- Company Size must be one of: ${Object.values(COMPANY_SIZE_LABELS).join(", ")}.
- Source must be one of: ${Object.values(COMPANY_SOURCE_LABELS).join(", ")}.
- Company Fit, Problem Potential, and Decision-Maker Access are optional whole numbers from 1 to 5. Leave them blank when public evidence is insufficient. Never invent scores. Decision-Maker Access is often unknown before outreach — leave it blank rather than guessing.
- Do not supply Qualification Score or Priority. The CRM calculates them:
  - All three scores: Qualification = Fit + Problem Potential + Decision-Maker Access (13–15 High, 9–12 Medium, 3–8 Low).
  - Fit + Problem Potential only: Priority is preliminary from their sum of 2–10 (9–10 High, 6–8 Medium, 2–5 Low); Qualification shows as Access pending until Decision-Maker Access is known.
  - Missing Fit or Problem Potential: Not scored.
- Owner Email must be an existing active NBS CRM user's email when provided. Leave blank to assign ownership to the CRM user who imports the file.
- Evidence Title and Evidence Details are publicly observed facts only (branches, hiring, warehouse expansion, visible technology, distribution complexity).
- Hypothesis Statement is an NBS inference from evidence, not a confirmed customer problem. Every imported hypothesis is Untested.
- Never mark public research, AI output, or unverified information as customer-confirmed.
- Do not fabricate customers, revenue, pipeline values, opportunities, follow-ups, activities, or quotes.

Return only tabular data that can be imported into NBS CRM.`;

export const CONTACT_AI_PROMPT = `You are preparing structured contact data for NBS CRM.

Return a spreadsheet that matches this import structure exactly. Use these column headers, in this order:

${CONTACT_IMPORT_COLUMNS.join(" | ")}

Rules:
- File format: CSV or XLSX.
- Company Name must match an existing company already in NBS CRM.
- Name is required.
- Decision Role must be one of: ${Object.values(DECISION_ROLE_LABELS).join(", ")}.
- Job titles such as CEO or Operations Manager belong in Job Title, not Decision Role.
- Preferred Channel must be one of: ${Object.values(PREFERRED_CHANNEL_LABELS).join(", ")}.
- Primary should be Yes or blank.
- Do not invent emails, phone numbers, or LinkedIn URLs if they are not known.
- Do not treat public research as customer-confirmed information.

Return only tabular data that can be imported into NBS CRM.`;

export async function buildImportPrompt(entity: ImportEntity): Promise<string> {
  if(entity === "CONTACTS") return CONTACT_AI_PROMPT + "\nCompany Name must identify exactly one company visible to the importing user. Never create a company or infer an association. No country/market columns are accepted for contacts; access comes from the linked company.";
  const codes=(await listSalesMarkets()).map(m=>m.code);
  return COMPANY_AI_PROMPT.replace("initially JO, UK, US or OTHER",codes.length ? "authorized for this user: " + codes.join(", ") : "none currently authorized for this user (do not generate import rows)") + "\nOnly use the authorized sales-market codes above. Never default to Jordan. Customer countries are independent ISO country codes and may differ from the operational territory.";
}
export function buildTemplateCsv(entity: ImportEntity): Buffer {
  const columns=entity === "CONTACTS" ? CONTACT_IMPORT_COLUMNS : COMPANY_IMPORT_COLUMNS;
  return Buffer.from("\uFEFF"+columns.map(column=>'"'+column.replaceAll('"','""')+'"').join(",")+"\r\n","utf8");
}
