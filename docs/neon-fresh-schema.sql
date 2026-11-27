-- P3H Dashboard fresh PostgreSQL schema from codex/p3h-dashboard-completion (9027b85).
-- Run against a new, empty Neon database only. For existing Supabase data,
-- restore the PostgreSQL backup instead. See docs/neon-vercel-migration.md.
-- After running this file, register each migration with Prisma per the guide.
BEGIN;
SET LOCAL search_path TO public;
DO $p3h$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'f', 'v', 'm', 'S')
    ) THEN
        RAISE EXCEPTION 'P3H bootstrap requires an empty public schema';
    END IF;
END
$p3h$;

-- 202610120001_initial
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Staff',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "alias" TEXT NOT NULL DEFAULT '',
    "dob" TIMESTAMP(3),
    "centre" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "race" TEXT NOT NULL DEFAULT '',
    "workingStatus" TEXT NOT NULL DEFAULT '',
    "preferredLanguage" TEXT NOT NULL DEFAULT '',
    "onboardingDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "mobility" TEXT NOT NULL DEFAULT '',
    "hearing" TEXT NOT NULL DEFAULT '',
    "eyesight" TEXT NOT NULL DEFAULT '',
    "dietaryPreference" TEXT NOT NULL DEFAULT '',
    "foodAllergies" TEXT NOT NULL DEFAULT '',
    "education" TEXT NOT NULL DEFAULT '',
    "primaryCondition" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "rawImport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareRelationship" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,

    CONSTRAINT "CareRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalCondition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MedicalCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLanguage" (
    "personId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'Spoken / understood',

    CONSTRAINT "PersonLanguage_pkey" PRIMARY KEY ("personId","languageId")
);

-- CreateTable
CREATE TABLE "PersonInterest" (
    "personId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,

    CONSTRAINT "PersonInterest_pkey" PRIMARY KEY ("personId","interestId")
);

-- CreateTable
CREATE TABLE "PersonCondition" (
    "personId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PersonCondition_pkey" PRIMARY KEY ("personId","conditionId")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "assessedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "mobility" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "centre" TEXT NOT NULL DEFAULT '',
    "day" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "frequency" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "registrationStatus" TEXT NOT NULL DEFAULT 'Open',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeLanguage" (
    "programmeId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,

    CONSTRAINT "ProgrammeLanguage_pkey" PRIMARY KEY ("programmeId","languageId")
);

-- CreateTable
CREATE TABLE "ProgrammeInterest" (
    "programmeId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,

    CONSTRAINT "ProgrammeInterest_pkey" PRIMARY KEY ("programmeId","interestId")
);

-- CreateTable
CREATE TABLE "ProgrammeCondition" (
    "programmeId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,

    CONSTRAINT "ProgrammeCondition_pkey" PRIMARY KEY ("programmeId","conditionId")
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Registered',

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportScheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SupportScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantApplication" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "applicationDate" TIMESTAMP(3),
    "submissionDate" TIMESTAMP(3),
    "approvalDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Not Applied',
    "amount" DOUBLE PRECISION,
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT,
    "title" TEXT NOT NULL,
    "personId" TEXT,
    "grantId" TEXT,
    "type" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "assignedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "username" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("username")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_memberId_key" ON "Person"("memberId");

-- CreateIndex
CREATE INDEX "Person_kind_status_idx" ON "Person"("kind", "status");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "Person_centre_idx" ON "Person"("centre");

-- CreateIndex
CREATE INDEX "CareRelationship_recipientId_idx" ON "CareRelationship"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "CareRelationship_memberId_recipientId_key" ON "CareRelationship"("memberId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_name_key" ON "Interest"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCondition_name_key" ON "MedicalCondition"("name");

-- CreateIndex
CREATE INDEX "PersonLanguage_languageId_idx" ON "PersonLanguage"("languageId");

-- CreateIndex
CREATE INDEX "PersonInterest_interestId_idx" ON "PersonInterest"("interestId");

-- CreateIndex
CREATE INDEX "PersonCondition_conditionId_idx" ON "PersonCondition"("conditionId");

-- CreateIndex
CREATE INDEX "Assessment_personId_idx" ON "Assessment"("personId");

-- CreateIndex
CREATE INDEX "Programme_status_centre_idx" ON "Programme"("status", "centre");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_personId_programmeId_key" ON "Participation"("personId", "programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportScheme_name_key" ON "SupportScheme"("name");

-- CreateIndex
CREATE INDEX "GrantApplication_status_nextReviewDate_idx" ON "GrantApplication"("status", "nextReviewDate");

-- CreateIndex
CREATE INDEX "GrantApplication_personId_idx" ON "GrantApplication"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_sourceKey_key" ON "Alert"("sourceKey");

-- CreateIndex
CREATE INDEX "Alert_status_dueDate_idx" ON "Alert"("status", "dueDate");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_timestamp_idx" ON "AuditLog"("entityType", "entityId", "timestamp");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_idx" ON "ImportRow"("batchId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareRelationship" ADD CONSTRAINT "CareRelationship_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareRelationship" ADD CONSTRAINT "CareRelationship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLanguage" ADD CONSTRAINT "PersonLanguage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLanguage" ADD CONSTRAINT "PersonLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonInterest" ADD CONSTRAINT "PersonInterest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonInterest" ADD CONSTRAINT "PersonInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCondition" ADD CONSTRAINT "PersonCondition_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonCondition" ADD CONSTRAINT "PersonCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "MedicalCondition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeLanguage" ADD CONSTRAINT "ProgrammeLanguage_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeLanguage" ADD CONSTRAINT "ProgrammeLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeInterest" ADD CONSTRAINT "ProgrammeInterest_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeInterest" ADD CONSTRAINT "ProgrammeInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeCondition" ADD CONSTRAINT "ProgrammeCondition_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeCondition" ADD CONSTRAINT "ProgrammeCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "MedicalCondition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantApplication" ADD CONSTRAINT "GrantApplication_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SupportScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantApplication" ADD CONSTRAINT "GrantApplication_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantApplication" ADD CONSTRAINT "GrantApplication_assignedId_fkey" FOREIGN KEY ("assignedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_assignedId_fkey" FOREIGN KEY ("assignedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 202610120002_staff_workflows
ALTER TABLE "User" ADD COLUMN "allCentres" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "UserCentre" ("userId" TEXT NOT NULL, "centre" TEXT NOT NULL, PRIMARY KEY ("userId", "centre"), CONSTRAINT "UserCentre_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "UserCentre_centre_idx" ON "UserCentre"("centre");
ALTER TABLE "Person" ADD COLUMN "assignedId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Person_assignedId_status_updatedAt_idx" ON "Person"("assignedId", "status", "updatedAt");
ALTER TABLE "Alert" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
CREATE INDEX "Alert_assignedId_status_idx" ON "Alert"("assignedId", "status");
CREATE INDEX "Alert_status_snoozedUntil_idx" ON "Alert"("status", "snoozedUntil");
ALTER TABLE "ImportBatch" ADD COLUMN "createdCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "updatedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "errorCount" INTEGER NOT NULL DEFAULT 0;

-- 202610260001_follow_up_notifications
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "recipientBirthdays" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
ALTER TABLE "Person" ADD COLUMN "contactNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GrantApplication" ADD COLUMN "followUpDays" INTEGER;
ALTER TABLE "GrantApplication" ADD COLUMN "followUpMonths" INTEGER;
ALTER TABLE "GrantApplication" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GrantApplication" ADD COLUMN "resolvedAt" TIMESTAMP;
ALTER TABLE "GrantApplication" ADD COLUMN "overrideReason" TEXT NOT NULL DEFAULT '';
CREATE TABLE "FollowUp" (
 "id" TEXT NOT NULL PRIMARY KEY, "alertId" TEXT NOT NULL,
 "grantId" TEXT NOT NULL, "completedBy" TEXT NOT NULL,
 "completedAt" TIMESTAMP NOT NULL, "outcome" TEXT NOT NULL,
 "notes" TEXT NOT NULL DEFAULT '', "resolved" BOOLEAN NOT NULL DEFAULT false,
 "nextDate" TIMESTAMP,
 CONSTRAINT "FollowUp_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FollowUp_alertId_key" ON "FollowUp"("alertId");
CREATE INDEX "FollowUp_grantId_completedAt_idx" ON "FollowUp"("grantId", "completedAt");
CREATE TABLE "NotificationDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "notificationKey" TEXT NOT NULL,
 "userId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'Daily digest',
 "scheduledDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'Pending',
 "payload" JSONB, "reminderIds" JSONB, "providerMessageId" TEXT, "lastAttempt" TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 0,
 "failureReason" TEXT, "leaseUntil" TIMESTAMP, "leaseToken" TEXT,
 "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NotificationDelivery_notificationKey_key" ON "NotificationDelivery"("notificationKey");
CREATE INDEX "NotificationDelivery_status_scheduledDate_idx" ON "NotificationDelivery"("status", "scheduledDate");

ALTER TABLE "GrantApplication" ADD COLUMN "followUpFrequency" TEXT NOT NULL DEFAULT 'Automatic';
ALTER TABLE "Alert" ADD COLUMN "activeFollowUpKey" TEXT;
CREATE UNIQUE INDEX "Alert_activeFollowUpKey_key" ON "Alert"("activeFollowUpKey");

ALTER TABLE "Alert" ADD COLUMN "autoDismissed" BOOLEAN NOT NULL DEFAULT false;

-- 202611040001_programme_sync
-- AlterTable
ALTER TABLE "Programme" ADD COLUMN     "suitabilityReviewed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExternalProgramme" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL DEFAULT '',
    "ownership" TEXT NOT NULL DEFAULT 'Imported',
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "ExternalProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOccurrence" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRecordIds" JSONB NOT NULL,
    "date" TEXT,
    "day" TEXT NOT NULL DEFAULT '',
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "recurrence" TEXT NOT NULL DEFAULT '',
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeSyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "scope" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Running',
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProgrammeSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeSyncLock" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeSyncLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProgramme_programmeId_key" ON "ExternalProgramme"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalProgramme_source_sourceKey_key" ON "ExternalProgramme"("source", "sourceKey");

-- CreateIndex
CREATE INDEX "ExternalOccurrence_date_status_idx" ON "ExternalOccurrence"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOccurrence_externalId_sourceKey_key" ON "ExternalOccurrence"("externalId", "sourceKey");

-- CreateIndex
CREATE INDEX "ProgrammeSyncRun_startedAt_idx" ON "ProgrammeSyncRun"("startedAt");

-- AddForeignKey
ALTER TABLE "ExternalProgramme" ADD CONSTRAINT "ExternalProgramme_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOccurrence" ADD CONSTRAINT "ExternalOccurrence_externalId_fkey" FOREIGN KEY ("externalId") REFERENCES "ExternalProgramme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 202611040002_programme_review
-- AlterTable
ALTER TABLE "ExternalProgramme" ADD COLUMN     "eligibilityRulesVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "groupingStatus" TEXT NOT NULL DEFAULT 'Unverified',
ADD COLUMN     "reviewFingerprint" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ExternalOccurrence" ADD COLUMN     "calendarVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eligibilityStatus" TEXT NOT NULL DEFAULT 'unverified',
ADD COLUMN     "independentSession" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reasonCodes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recommendationEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedulingStatus" TEXT NOT NULL DEFAULT 'not_checked',
ADD COLUMN     "sourceActivityName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "timetableVisible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProgrammeSyncRun" ADD COLUMN     "diagnostics" JSONB;

-- CreateTable
CREATE TABLE "ProgrammeReview" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending Review',
    "audience" TEXT NOT NULL DEFAULT '',
    "languageAssessment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "interestAssessment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "mobilityAssessment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "conditionAssessment" TEXT NOT NULL DEFAULT 'Not Assessed',
    "accessibility" TEXT NOT NULL DEFAULT '',
    "intensity" TEXT NOT NULL DEFAULT 'Not Assessed',
    "staffNotes" TEXT NOT NULL DEFAULT '',
    "issues" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT,
    "reviewedByName" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeReview_programmeId_key" ON "ProgrammeReview"("programmeId");

-- CreateIndex
CREATE INDEX "ProgrammeReview_status_idx" ON "ProgrammeReview"("status");

-- AddForeignKey
ALTER TABLE "ProgrammeReview" ADD CONSTRAINT "ProgrammeReview_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prior explicit legacy approvals require a review under the new assessment workflow.
INSERT INTO "ProgrammeReview" ("id","programmeId","status","issues","updatedAt")
SELECT 'legacy-review-' || "id", "id", 'Needs Recheck', '["Review the legacy approval using the new suitability workflow"]', CURRENT_TIMESTAMP
FROM "Programme" WHERE "suitabilityReviewed" = true
AND EXISTS (SELECT 1 FROM "ExternalProgramme" WHERE "programmeId" = "Programme"."id");

-- Persist the initial queue state for all other existing imported programmes.
INSERT INTO "ProgrammeReview" ("id","programmeId","status","issues","updatedAt")
SELECT 'legacy-review-' || "id", "id", 'Pending Review', '[]', CURRENT_TIMESTAMP
FROM "Programme" WHERE "suitabilityReviewed" = false
AND EXISTS (SELECT 1 FROM "ExternalProgramme" WHERE "programmeId" = "Programme"."id");

-- 202611040003_interest_suggestions
-- Additive metadata only; existing data and reviews remain unchanged.
ALTER TABLE "Programme" ADD COLUMN "interestTagsReviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalProgramme" ADD COLUMN "programmeType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "visibilityKnown" BOOLEAN NOT NULL DEFAULT false;
-- The v2 contract requires explicit source visibility. Legacy false defaults remain unknown.
UPDATE "ExternalOccurrence" SET "visibilityKnown" = true
WHERE "externalId" IN (SELECT "id" FROM "ExternalProgramme" WHERE "eligibilityRulesVersion" = 2);

-- 202611040004_workspace_maintenance
-- Additive coordination for a non-blocking daily in-app reminder fallback.
CREATE TABLE "MaintenanceState" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "lastCompletedDate" TEXT NOT NULL DEFAULT '',
 "lastCompletedAt" TIMESTAMP(3),
 "leaseUntil" TIMESTAMP(3),
 "leaseToken" TEXT
);

-- 202611130001_surveys_outcomes
-- Additive survey storage. Existing records and assessment tables are unchanged.
CREATE TABLE "SurveyImportBatch" (
 "id" TEXT NOT NULL PRIMARY KEY, "filename" TEXT NOT NULL, "language" TEXT NOT NULL,
 "centre" TEXT NOT NULL, "uploadedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "status" TEXT NOT NULL DEFAULT 'Completed', "summary" JSONB NOT NULL
);
CREATE TABLE "SurveyResponse" (
 "id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL, "sourceResponseId" TEXT NOT NULL DEFAULT '', "rowNumber" INTEGER NOT NULL,
 "centre" TEXT NOT NULL, "language" TEXT NOT NULL, "submittedName" TEXT NOT NULL, "cleanedName" TEXT NOT NULL,
 "timestampText" TEXT NOT NULL, "surveyDate" TIMESTAMP(3), "dobText" TEXT NOT NULL DEFAULT '', "dob" TIMESTAMP(3),
 "phaseText" TEXT NOT NULL DEFAULT '', "phase" TEXT NOT NULL DEFAULT 'Needs Review',
 "personId" TEXT, "confirmedMemberId" TEXT, "matchStatus" TEXT NOT NULL DEFAULT 'Unmatched',
 "rawAnswers" JSONB NOT NULL, "answers" JSONB NOT NULL, "method" TEXT NOT NULL, "warnings" JSONB NOT NULL,
 "physical" DOUBLE PRECISION, "psychological" DOUBLE PRECISION, "social" DOUBLE PRECISION, "environment" DOUBLE PRECISION, "overall" DOUBLE PRECISION, "zbi" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SurveyResponse_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SurveyImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SurveyResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "SurveyIdentityReview" (
 "id" TEXT NOT NULL PRIMARY KEY, "responseId" TEXT NOT NULL, "personId" TEXT, "memberId" TEXT,
 "action" TEXT NOT NULL, "method" TEXT NOT NULL DEFAULT 'Staff confirmation', "reviewedBy" TEXT NOT NULL,
 "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT NOT NULL DEFAULT '',
 CONSTRAINT "SurveyIdentityReview_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "PersonAlias" (
 "id" TEXT NOT NULL PRIMARY KEY, "personId" TEXT NOT NULL, "text" TEXT NOT NULL, "normalized" TEXT NOT NULL,
 "verified" BOOLEAN NOT NULL DEFAULT true, "verifiedBy" TEXT NOT NULL,
 "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "source" TEXT NOT NULL DEFAULT 'Staff verification',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonAlias_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SurveyImportBatch_centre_createdAt_idx" ON "SurveyImportBatch"("centre", "createdAt");
CREATE UNIQUE INDEX "SurveyResponse_sourceKey_key" ON "SurveyResponse"("sourceKey");
CREATE INDEX "SurveyResponse_centre_matchStatus_surveyDate_idx" ON "SurveyResponse"("centre", "matchStatus", "surveyDate");
CREATE INDEX "SurveyResponse_personId_method_surveyDate_idx" ON "SurveyResponse"("personId", "method", "surveyDate");
CREATE INDEX "SurveyIdentityReview_responseId_reviewedAt_idx" ON "SurveyIdentityReview"("responseId", "reviewedAt");
CREATE UNIQUE INDEX "PersonAlias_personId_normalized_key" ON "PersonAlias"("personId", "normalized");
CREATE INDEX "PersonAlias_normalized_verified_idx" ON "PersonAlias"("normalized", "verified");

-- 202611130002_record_trash
-- Recoverable Trash; existing records remain intact and start outside Trash.
ALTER TABLE "Person" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Person" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");
ALTER TABLE "Programme" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Programme" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Programme_deletedAt_idx" ON "Programme"("deletedAt");
ALTER TABLE "GrantApplication" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrantApplication" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "GrantApplication_deletedAt_idx" ON "GrantApplication"("deletedAt");
ALTER TABLE "SurveyResponse" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "SurveyResponse" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "SurveyResponse_deletedAt_idx" ON "SurveyResponse"("deletedAt");

-- 202611230001_survey_name_corrections
ALTER TABLE "SurveyResponse" ADD COLUMN "correctedName" TEXT;

-- 202611230002_caritahub_identity_stage
-- Keep identifiers available only to the restricted identity-review workflow.
BEGIN;
CREATE TABLE "SurveyIdentityStage" (
 "responseId" TEXT NOT NULL PRIMARY KEY,
 "submittedName" TEXT NOT NULL,
 "cleanedName" TEXT NOT NULL,
 "correctedName" TEXT,
 "dobText" TEXT NOT NULL,
 "dob" TIMESTAMP(3),
 "nameHistory" JSONB NOT NULL,
 CONSTRAINT "SurveyIdentityStage_responseId_fkey" FOREIGN KEY ("responseId")
   REFERENCES "SurveyResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "SurveyIdentityStage" ("responseId", "submittedName", "cleanedName", "correctedName", "dobText", "dob", "nameHistory")
SELECT "id", "submittedName", "cleanedName", "correctedName", "dobText", "dob", '[]'
FROM "SurveyResponse";

UPDATE "SurveyResponse" SET "submittedName" = '', "cleanedName" = '',
 "correctedName" = NULL, "dobText" = '', "dob" = NULL;
COMMIT;

-- 202611240001_ncss_matched_csv
ALTER TABLE "SurveyResponse" ADD COLUMN "importMode" TEXT NOT NULL DEFAULT 'Legacy';
CREATE INDEX "SurveyResponse_confirmedMemberId_surveyDate_idx" ON "SurveyResponse"("confirmedMemberId", "surveyDate");
CREATE INDEX "SurveyResponse_sourceResponseId_idx" ON "SurveyResponse"("sourceResponseId");

COMMIT;
