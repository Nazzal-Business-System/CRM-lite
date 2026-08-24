import { z } from "zod";
import {
  ACTIVITY_TYPES,
  COMPANY_SIZES,
  COMPANY_SOURCES,
  DECISION_ROLES,
  EVIDENCE_CATEGORIES,
  HYPOTHESIS_STATUSES,
  IMPORT_ENTITIES,
  OPPORTUNITY_STAGES,
  PREFERRED_CHANNELS,
  QUALIFICATION_MAX,
  QUALIFICATION_MIN,
  TASK_STATUSES,
} from "./crm";

function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => emptyToNull(value));

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max);

const dateTimeValue = z.string().transform((value, ctx) => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid date." });
    return z.NEVER;
  }
  return new Date(parsed).toISOString();
});

const optionalDateTime = z
  .union([dateTimeValue, z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value == null || value === "") {
      return null;
    }
    return value;
  });

const scoreSchema = z
  .number()
  .int()
  .min(QUALIFICATION_MIN, `Score must be ${QUALIFICATION_MIN}–${QUALIFICATION_MAX}.`)
  .max(QUALIFICATION_MAX, `Score must be ${QUALIFICATION_MIN}–${QUALIFICATION_MAX}.`)
  .nullable()
  .optional();

export const moneyInputSchema = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) {
      return undefined;
    }
    if (value == null || value === "") {
      return null;
    }
    const numeric =
      typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    if (!Number.isFinite(numeric) || numeric < 0) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid amount.",
      });
      return z.NEVER;
    }
    return numeric.toFixed(2);
  });

export const probabilitySchema = z
  .number()
  .int()
  .min(0, "Probability must be between 0 and 100.")
  .max(100, "Probability must be between 0 and 100.");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional().default(""),
});

export const companyListQuerySchema = paginationQuerySchema.extend({
  sector: z.string().trim().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  ownerId: z.string().optional(),
  sort: z
    .enum(["name", "priority", "qualificationScore", "updatedAt", "createdAt"])
    .default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

export const companyWriteSchema = z.object({
  name: requiredText(180, "Company name is required."),
  website: optionalText(300),
  sector: optionalText(120),
  companySize: z.enum(COMPANY_SIZES).optional().default("UNKNOWN"),
  locations: optionalText(500),
  source: z.enum(COMPANY_SOURCES).optional().default("RESEARCH"),
  companyFit: scoreSchema,
  problemPotential: scoreSchema,
  decisionMakerAccess: scoreSchema,
  ownerId: z.string().nullable().optional(),
  generalNotes: optionalText(8000),
});

export const createCompanySchema = companyWriteSchema;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = companyWriteSchema.partial().extend({
  name: requiredText(180, "Company name is required.").optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const evidenceWriteSchema = z.object({
  title: requiredText(180, "A short summary is required."),
  details: requiredText(8000, "Evidence details are required."),
  category: z.enum(EVIDENCE_CATEGORIES).nullable().optional(),
  sourceUrl: optionalText(500),
  sourceName: optionalText(180),
  observedAt: optionalDateTime,
});

export const createEvidenceSchema = evidenceWriteSchema;
export type CreateEvidenceInput = z.infer<typeof createEvidenceSchema>;
export const updateEvidenceSchema = evidenceWriteSchema.partial();
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;

export const hypothesisWriteSchema = z.object({
  statement: requiredText(500, "Hypothesis statement is required."),
  status: z.enum(HYPOTHESIS_STATUSES).optional().default("UNTESTED"),
  supportingContext: optionalText(4000),
});

export const createHypothesisSchema = hypothesisWriteSchema;
export type CreateHypothesisInput = z.infer<typeof createHypothesisSchema>;
export const updateHypothesisSchema = hypothesisWriteSchema.partial();
export type UpdateHypothesisInput = z.infer<typeof updateHypothesisSchema>;

export const contactListQuerySchema = paginationQuerySchema.extend({
  companyId: z.string().optional(),
  decisionRole: z.enum(DECISION_ROLES).optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const contactWriteSchema = z.object({
  companyId: z.string().min(1, "Company is required."),
  name: requiredText(160, "Contact name is required."),
  jobTitle: optionalText(160),
  decisionRole: z.enum(DECISION_ROLES).optional().default("UNKNOWN"),
  email: z
    .union([z.email("Enter a valid email address."), z.literal(""), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      return emptyToNull(value)?.toLowerCase() ?? null;
    }),
  phone: optionalText(40),
  linkedInUrl: optionalText(400),
  preferredChannel: z.enum(PREFERRED_CHANNELS).optional().default("EMAIL"),
  notes: optionalText(4000),
  isPrimary: z.boolean().optional().default(false),
});

export const createContactSchema = contactWriteSchema;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export const updateContactSchema = contactWriteSchema.partial().extend({
  companyId: z.string().min(1).optional(),
  name: requiredText(160, "Contact name is required.").optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const opportunityListQuerySchema = paginationQuerySchema.extend({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  ownerId: z.string().optional(),
  companyId: z.string().optional(),
  view: z.enum(["list", "board"]).optional(),
});
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;

export const opportunityWriteSchema = z.object({
  companyId: z.string().min(1, "Company is required."),
  name: requiredText(180, "Opportunity name is required."),
  stage: z.enum(OPPORTUNITY_STAGES).optional().default("TARGET"),
  primaryContactId: z.string().nullable().optional(),
  summary: optionalText(4000),
  confirmedProblem: optionalText(4000),
  businessImpact: optionalText(4000),
  proposedSolution: optionalText(4000),
  estimatedValue: moneyInputSchema,
  probability: probabilitySchema.optional(),
  source: optionalText(120),
  ownerId: z.string().nullable().optional(),
  commissionRepresentativeId: z.string().nullable().optional(),
  expectedCloseDate: optionalDateTime,
  outcomeNotes: optionalText(4000),
  lostReason: optionalText(500),
});

export const createOpportunitySchema = opportunityWriteSchema;
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export const updateOpportunitySchema = opportunityWriteSchema.partial().extend({
  companyId: z.string().min(1).optional(),
  name: requiredText(180, "Opportunity name is required.").optional(),
});
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const nextTaskSchema = z.object({
  title: requiredText(180, "Follow-up title is required."),
  dueAt: dateTimeValue,
  description: optionalText(4000),
  ownerId: z.string().optional(),
});

export const activityListQuerySchema = paginationQuerySchema.extend({
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  ownerId: z.string().optional(),
});
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

export const createActivitySchema = z.object({
  companyId: z.string().min(1, "Company is required."),
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: dateTimeValue.optional(),
  summary: requiredText(4000, "Summary is required."),
  outcome: optionalText(4000),
  ownerId: z.string().optional(),
  nextTask: nextTaskSchema.optional(),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  type: z.enum(ACTIVITY_TYPES).optional(),
  occurredAt: dateTimeValue.optional(),
  summary: requiredText(4000, "Summary is required.").optional(),
  outcome: optionalText(4000),
  ownerId: z.string().optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const taskListQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(["mine", "all"]).optional().default("all"),
  status: z.enum(TASK_STATUSES).optional(),
  due: z.enum(["overdue", "today", "upcoming", "completed"]).optional(),
  ownerId: z.string().optional(),
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const createTaskSchema = z.object({
  title: requiredText(180, "Title is required."),
  description: optionalText(4000),
  dueAt: dateTimeValue,
  ownerId: z.string().min(1, "Owner is required."),
  companyId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(TASK_STATUSES).optional(),
  dueAt: dateTimeValue.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const researchListQuerySchema = paginationQuerySchema.extend({
  companyId: z.string().optional(),
  hypothesisStatus: z.enum(HYPOTHESIS_STATUSES).optional(),
});
export type ResearchListQuery = z.infer<typeof researchListQuerySchema>;

export const importParseQuerySchema = z.object({
  entity: z.enum(IMPORT_ENTITIES).default("COMPANIES"),
});

export const importCommitSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().positive(),
        included: z.boolean().default(true),
        values: z.record(z.string(), z.string().nullable()),
      }),
    )
    .min(1, "No rows to import."),
});
export type ImportCommitInput = z.infer<typeof importCommitSchema>;

export const COMPANY_IMPORT_COLUMNS = [
  "Company Name",
  "Website",
  "Sector",
  "Company Size",
  "Locations",
  "Source",
  "Company Fit",
  "Problem Potential",
  "Decision-Maker Access",
  "Owner Email",
  "General Notes",
  "Evidence Title",
  "Evidence Details",
  "Evidence Source URL",
  "Evidence Source Name",
  "Hypothesis Statement",
  "Hypothesis Context",
] as const;

export const CONTACT_IMPORT_COLUMNS = [
  "Company Name",
  "Name",
  "Job Title",
  "Decision Role",
  "Email",
  "Phone",
  "LinkedIn URL",
  "Preferred Channel",
  "Notes",
  "Primary",
] as const;
