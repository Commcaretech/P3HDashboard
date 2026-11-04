-- AlterTable
ALTER TABLE "ProgrammeSyncRun" ADD COLUMN "diagnostics" JSONB;

-- CreateTable
CREATE TABLE "ProgrammeReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "reviewedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgrammeReview_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "ExternalProgramme" ADD COLUMN "reviewFingerprint" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExternalProgramme" ADD COLUMN "eligibilityRulesVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExternalProgramme" ADD COLUMN "groupingStatus" TEXT NOT NULL DEFAULT 'Unverified';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "eligibilityStatus" TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "schedulingStatus" TEXT NOT NULL DEFAULT 'not_checked';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "recommendationEligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalOccurrence" ADD COLUMN "reasonCodes" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "sourceActivityName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "independentSession" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalOccurrence" ADD COLUMN "timetableVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalOccurrence" ADD COLUMN "calendarVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeReview_programmeId_key" ON "ProgrammeReview"("programmeId");

-- CreateIndex
CREATE INDEX "ProgrammeReview_status_idx" ON "ProgrammeReview"("status");

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
