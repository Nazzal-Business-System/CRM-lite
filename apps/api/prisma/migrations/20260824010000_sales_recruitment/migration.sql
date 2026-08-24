-- CreateEnum
CREATE TYPE "RecruitmentRoleType" AS ENUM ('COMMISSION', 'PART_TIME', 'FULL_TIME', 'FREELANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('SOURCED', 'TO_CONTACT', 'CONTACTED', 'INTERESTED', 'INTERVIEW', 'EVALUATING', 'OFFER', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "recruitment_candidates" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "linkedInUrl" TEXT,
    "location" TEXT,
    "source" TEXT NOT NULL,
    "roleType" "RecruitmentRoleType" NOT NULL DEFAULT 'COMMISSION',
    "stage" "RecruitmentStage" NOT NULL DEFAULT 'SOURCED',
    "experienceSummary" TEXT,
    "notes" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "compensationNotes" TEXT,
    "rejectionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruitment_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recruitment_candidates_stage_idx" ON "recruitment_candidates"("stage");

-- CreateIndex
CREATE INDEX "recruitment_candidates_roleType_idx" ON "recruitment_candidates"("roleType");

-- CreateIndex
CREATE INDEX "recruitment_candidates_source_idx" ON "recruitment_candidates"("source");

-- CreateIndex
CREATE INDEX "recruitment_candidates_nextActionDate_idx" ON "recruitment_candidates"("nextActionDate");

-- CreateIndex
CREATE INDEX "recruitment_candidates_createdById_idx" ON "recruitment_candidates"("createdById");

-- CreateIndex
CREATE INDEX "recruitment_candidates_fullName_idx" ON "recruitment_candidates"("fullName");

-- AddForeignKey
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
