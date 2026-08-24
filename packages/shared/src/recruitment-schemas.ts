import { z } from "zod";
import {
  RECRUITMENT_ROLE_TYPES,
  RECRUITMENT_STAGES,
} from "./recruitment";

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

const optionalDateTime = z
  .union([z.string().datetime(), z.literal(""), z.null()])
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

export const recruitmentListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  stage: z.enum(RECRUITMENT_STAGES).optional(),
  roleType: z.enum(RECRUITMENT_ROLE_TYPES).optional(),
  source: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RecruitmentListQuery = z.infer<typeof recruitmentListQuerySchema>;

export const recruitmentWriteSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(160),
  email: optionalText(180),
  phone: optionalText(60),
  linkedInUrl: optionalText(400),
  location: optionalText(160),
  source: z.string().trim().min(1, "Source is required.").max(120),
  roleType: z.enum(RECRUITMENT_ROLE_TYPES),
  stage: z.enum(RECRUITMENT_STAGES),
  experienceSummary: optionalText(4000),
  notes: optionalText(4000),
  nextAction: optionalText(400),
  nextActionDate: optionalDateTime,
  compensationNotes: optionalText(1000),
  rejectionReason: optionalText(1000),
});

export const createRecruitmentCandidateSchema = recruitmentWriteSchema;
export const updateRecruitmentCandidateSchema = recruitmentWriteSchema.partial();

export type CreateRecruitmentCandidateInput = z.infer<
  typeof createRecruitmentCandidateSchema
>;
export type UpdateRecruitmentCandidateInput = z.infer<
  typeof updateRecruitmentCandidateSchema
>;

export interface RecruitmentCandidateSummary {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedInUrl: string | null;
  location: string | null;
  source: string;
  roleType: (typeof RECRUITMENT_ROLE_TYPES)[number];
  stage: (typeof RECRUITMENT_STAGES)[number];
  nextAction: string | null;
  nextActionDate: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface RecruitmentCandidateDetail extends RecruitmentCandidateSummary {
  experienceSummary: string | null;
  notes: string | null;
  compensationNotes: string | null;
  rejectionReason: string | null;
  createdBy: { id: string; name: string; email: string };
}

export interface RecruitmentMetrics {
  total: number;
  toContact: number;
  inProcess: number;
  interviews: number;
  offers: number;
  hired: number;
  byStage: Array<{ stage: (typeof RECRUITMENT_STAGES)[number]; count: number }>;
}
