export const RECRUITMENT_ROLE_TYPES = [
  "COMMISSION",
  "PART_TIME",
  "FULL_TIME",
  "FREELANCE",
  "OTHER",
] as const;

export type RecruitmentRoleType = (typeof RECRUITMENT_ROLE_TYPES)[number];

export const RECRUITMENT_ROLE_TYPE_LABELS: Record<RecruitmentRoleType, string> = {
  COMMISSION: "Commission-based",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
  FREELANCE: "Freelance / Contract",
  OTHER: "Other",
};

export const RECRUITMENT_STAGES = [
  "SOURCED",
  "TO_CONTACT",
  "CONTACTED",
  "INTERESTED",
  "INTERVIEW",
  "EVALUATING",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

export type RecruitmentStage = (typeof RECRUITMENT_STAGES)[number];

export const RECRUITMENT_STAGE_LABELS: Record<RecruitmentStage, string> = {
  SOURCED: "Sourced",
  TO_CONTACT: "To Contact",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  INTERVIEW: "Interview",
  EVALUATING: "Evaluating",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export const RECRUITMENT_IN_PROCESS_STAGES: readonly RecruitmentStage[] = [
  "CONTACTED",
  "INTERESTED",
  "INTERVIEW",
  "EVALUATING",
];
