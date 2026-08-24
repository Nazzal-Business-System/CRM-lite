export const COMPANY_SIZES = [
  "UNKNOWN",
  "SOLO",
  "SMALL",
  "MEDIUM",
  "LARGE",
  "ENTERPRISE",
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number];

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  UNKNOWN: "Unknown",
  SOLO: "Solo",
  SMALL: "2–10",
  MEDIUM: "11–50",
  LARGE: "51–200",
  ENTERPRISE: "201+",
};

export const COMPANY_SOURCES = [
  "RESEARCH",
  "REFERRAL",
  "INBOUND",
  "EVENT",
  "EXISTING",
  "OTHER",
] as const;

export type CompanySource = (typeof COMPANY_SOURCES)[number];

export const COMPANY_SOURCE_LABELS: Record<CompanySource, string> = {
  RESEARCH: "Research",
  REFERRAL: "Referral",
  INBOUND: "Inbound",
  EVENT: "Event",
  EXISTING: "Existing relationship",
  OTHER: "Other",
};

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const QUALIFICATION_MIN = 1;
export const QUALIFICATION_MAX = 5;
export const QUALIFICATION_TOTAL_MAX = 15;

export const PRIORITY_THRESHOLDS = {
  HIGH_MIN: 13,
  MEDIUM_MIN: 9,
} as const;

/** Fit + Problem Potential only (Access still unknown). Max 10. */
export const PRELIMINARY_PRIORITY_THRESHOLDS = {
  HIGH_MIN: 9,
  MEDIUM_MIN: 6,
} as const;

export function computeQualification(
  companyFit: number | null | undefined,
  problemPotential: number | null | undefined,
  decisionMakerAccess: number | null | undefined,
): {
  qualificationScore: number | null;
  priority: Priority | null;
  accessPending: boolean;
} {
  if (companyFit == null || problemPotential == null) {
    return { qualificationScore: null, priority: null, accessPending: false };
  }

  if (decisionMakerAccess == null) {
    const preliminaryScore = companyFit + problemPotential;
    const priority: Priority =
      preliminaryScore >= PRELIMINARY_PRIORITY_THRESHOLDS.HIGH_MIN
        ? "HIGH"
        : preliminaryScore >= PRELIMINARY_PRIORITY_THRESHOLDS.MEDIUM_MIN
          ? "MEDIUM"
          : "LOW";
    return {
      qualificationScore: preliminaryScore,
      priority,
      accessPending: true,
    };
  }

  const qualificationScore =
    companyFit + problemPotential + decisionMakerAccess;

  const priority: Priority =
    qualificationScore >= PRIORITY_THRESHOLDS.HIGH_MIN
      ? "HIGH"
      : qualificationScore >= PRIORITY_THRESHOLDS.MEDIUM_MIN
        ? "MEDIUM"
        : "LOW";

  return { qualificationScore, priority, accessPending: false };
}

export function formatQualificationLabel(
  score: number | null | undefined,
  accessPending = false,
): string {
  if (score == null) {
    return "Not scored";
  }
  if (accessPending) {
    return `${score} / 15 · Access pending`;
  }
  return `${score}/15`;
}

export const QUALIFICATION_ACCESS_PENDING_HINT =
  "Priority is based on Fit + Problem Potential until Decision-Maker Access is known.";

export const HYPOTHESIS_STATUSES = [
  "UNTESTED",
  "PARTIALLY_VALIDATED",
  "VALIDATED",
  "REJECTED",
] as const;

export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export const HYPOTHESIS_STATUS_LABELS: Record<HypothesisStatus, string> = {
  UNTESTED: "Untested",
  PARTIALLY_VALIDATED: "Partially validated",
  VALIDATED: "Validated",
  REJECTED: "Rejected",
};

export const EVIDENCE_CATEGORIES = [
  "GROWTH",
  "OPERATIONS",
  "TECHNOLOGY",
  "LOCATIONS",
  "HIRING",
  "DISTRIBUTION",
  "OTHER",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  GROWTH: "Growth",
  OPERATIONS: "Operations",
  TECHNOLOGY: "Technology",
  LOCATIONS: "Locations",
  HIRING: "Hiring",
  DISTRIBUTION: "Distribution",
  OTHER: "Other",
};

export const DECISION_ROLES = [
  "DECISION_MAKER",
  "INFLUENCER",
  "CHAMPION",
  "TECHNICAL",
  "USER",
  "GATEKEEPER",
  "UNKNOWN",
] as const;

export type DecisionRole = (typeof DECISION_ROLES)[number];

export const DECISION_ROLE_LABELS: Record<DecisionRole, string> = {
  DECISION_MAKER: "Decision maker",
  INFLUENCER: "Influencer",
  CHAMPION: "Champion",
  TECHNICAL: "Technical",
  USER: "User",
  GATEKEEPER: "Gatekeeper",
  UNKNOWN: "Unknown",
};

export const PREFERRED_CHANNELS = [
  "EMAIL",
  "PHONE",
  "WHATSAPP",
  "LINKEDIN",
  "OTHER",
] as const;

export type PreferredChannel = (typeof PREFERRED_CHANNELS)[number];

export const PREFERRED_CHANNEL_LABELS: Record<PreferredChannel, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  LINKEDIN: "LinkedIn",
  OTHER: "Other",
};

export const OPPORTUNITY_STAGES = [
  "TARGET",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  TARGET: "Target",
  CONTACTED: "Contacted",
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  DISCOVERY: "Discovery",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

export const STAGE_PROBABILITY_DEFAULTS: Record<OpportunityStage, number> = {
  TARGET: 5,
  CONTACTED: 10,
  ENGAGED: 20,
  QUALIFIED: 35,
  DISCOVERY: 50,
  PROPOSAL: 65,
  NEGOTIATION: 80,
  WON: 100,
  LOST: 0,
};

export const OPEN_OPPORTUNITY_STAGES = OPPORTUNITY_STAGES.filter(
  (stage) => stage !== "WON" && stage !== "LOST",
);

export const QUALIFIED_PLUS_STAGES: readonly OpportunityStage[] = [
  "QUALIFIED",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
];

export function isClosedStage(stage: OpportunityStage): boolean {
  return stage === "WON" || stage === "LOST";
}

export const ACTIVITY_TYPES = [
  "CALL",
  "EMAIL",
  "LINKEDIN",
  "WHATSAPP",
  "MEETING",
  "FOLLOW_UP",
  "NOTE",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  LINKEDIN: "LinkedIn",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
  FOLLOW_UP: "Follow-up",
  NOTE: "Note",
};

export const TASK_STATUSES = ["OPEN", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const IMPORT_ENTITIES = ["COMPANIES", "CONTACTS"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const IMPORT_ENTITY_LABELS: Record<ImportEntity, string> = {
  COMPANIES: "Companies",
  CONTACTS: "Contacts",
};

export const IMPORT_ROW_STATUSES = [
  "READY",
  "WARNING",
  "INVALID",
] as const;

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export function scoreToPriority(score: number): Priority {
  if (score >= PRIORITY_THRESHOLDS.HIGH_MIN) {
    return "HIGH";
  }
  if (score >= PRIORITY_THRESHOLDS.MEDIUM_MIN) {
    return "MEDIUM";
  }
  return "LOW";
}

export function defaultProbabilityForStage(stage: OpportunityStage): number {
  return STAGE_PROBABILITY_DEFAULTS[stage];
}

export function computeWeightedValue(
  estimatedValue: string | number | null | undefined,
  probability: number,
): string | null {
  if (estimatedValue == null || estimatedValue === "") {
    return null;
  }
  const amount =
    typeof estimatedValue === "number"
      ? estimatedValue
      : Number(estimatedValue);
  if (!Number.isFinite(amount)) {
    return null;
  }
  return ((amount * probability) / 100).toFixed(2);
}

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWebsiteDomain(
  website: string | null | undefined,
): string | null {
  if (!website) {
    return null;
  }

  const trimmed = website.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase();
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] || null;
  }
}
