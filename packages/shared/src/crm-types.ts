import type {
  ActivityType,
  CompanySize,
  CompanySource,
  DecisionRole,
  EvidenceCategory,
  HypothesisStatus,
  ImportEntity,
  ImportRowStatus,
  OpportunityStage,
  PreferredChannel,
  Priority,
  TaskStatus,
} from "./crm";

export interface UserRef {
  id: string;
  name: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  website: string | null;
  sector: string | null;
  companySize: CompanySize;
  locations: string | null;
  source: CompanySource;
  qualificationScore: number | null;
  priority: Priority | null;
  accessPending: boolean;
  owner: UserRef | null;
  activeOpportunityCount: number;
  nextFollowUpAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetail extends CompanySummary {
  companyFit: number | null;
  problemPotential: number | null;
  decisionMakerAccess: number | null;
  generalNotes: string | null;
  contactCount: number;
  opportunityCount: number;
  openTaskCount: number;
}

export interface ResearchEvidenceRecord {
  id: string;
  companyId: string;
  companyName?: string;
  title: string;
  details: string;
  category: EvidenceCategory | null;
  sourceUrl: string | null;
  sourceName: string | null;
  observedAt: string | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface HypothesisRecord {
  id: string;
  companyId: string;
  companyName?: string;
  statement: string;
  status: HypothesisStatus;
  supportingContext: string | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface ContactSummary {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  jobTitle: string | null;
  decisionRole: DecisionRole;
  email: string | null;
  phone: string | null;
  linkedInUrl: string | null;
  preferredChannel: PreferredChannel;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDetail extends ContactSummary {
  notes: string | null;
}

export interface OpportunitySummary {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  stage: OpportunityStage;
  estimatedValue: string | null;
  probability: number;
  weightedValue: string | null;
  owner: UserRef | null;
  primaryContact: UserRef | null;
  nextFollowUpAt: string | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  updatedAt: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  summary: string | null;
  confirmedProblem: string | null;
  businessImpact: string | null;
  proposedSolution: string | null;
  source: string | null;
  commissionRepresentative: UserRef | null;
  outcomeNotes: string | null;
  lostReason: string | null;
  createdAt: string;
}

export interface ActivityRecord {
  id: string;
  companyId: string;
  companyName: string;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  type: ActivityType;
  occurredAt: string;
  summary: string;
  outcome: string | null;
  owner: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  status: TaskStatus;
  owner: UserRef;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardMetrics {
  totalCompanies: number;
  highPriorityCompanies: number;
  activeOpportunities: number;
  qualifiedPlusOpportunities: number;
  pipelineValue: string;
  weightedPipeline: string;
  wonCount: number;
  lostCount: number;
  overdueFollowUps: number;
}

export interface PipelineStageMetric {
  stage: OpportunityStage;
  count: number;
  value: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  pipelineByStage: PipelineStageMetric[];
  overdueTasks: TaskRecord[];
  dueTodayTasks: TaskRecord[];
  recentActivities: ActivityRecord[];
  priorityCompanies: CompanySummary[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  status: ImportRowStatus;
  included: boolean;
  values: Record<string, string | null>;
  messages: string[];
}

export interface ImportPreview {
  entity: ImportEntity;
  filename: string;
  rows: ImportPreviewRow[];
  counts: {
    total: number;
    ready: number;
    warning: number;
    invalid: number;
  };
}

export interface ImportResult {
  entity: ImportEntity;
  total: number;
  created: number;
  skipped: number;
  invalid: number;
  duplicates: number;
  failed: number;
  errors: Array<{ rowNumber: number; message: string }>;
}
