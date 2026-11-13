-- Additive survey storage. Existing records and assessment tables are unchanged.
CREATE TABLE "SurveyImportBatch" (
 "id" TEXT NOT NULL PRIMARY KEY, "filename" TEXT NOT NULL, "language" TEXT NOT NULL,
 "centre" TEXT NOT NULL, "uploadedBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "status" TEXT NOT NULL DEFAULT 'Completed', "summary" JSONB NOT NULL
);
CREATE TABLE "SurveyResponse" (
 "id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL, "sourceResponseId" TEXT NOT NULL DEFAULT '', "rowNumber" INTEGER NOT NULL,
 "centre" TEXT NOT NULL, "language" TEXT NOT NULL, "submittedName" TEXT NOT NULL, "cleanedName" TEXT NOT NULL,
 "timestampText" TEXT NOT NULL, "surveyDate" DATETIME, "dobText" TEXT NOT NULL DEFAULT '', "dob" DATETIME,
 "phaseText" TEXT NOT NULL DEFAULT '', "phase" TEXT NOT NULL DEFAULT 'Needs Review',
 "personId" TEXT, "confirmedMemberId" TEXT, "matchStatus" TEXT NOT NULL DEFAULT 'Unmatched',
 "rawAnswers" JSONB NOT NULL, "answers" JSONB NOT NULL, "method" TEXT NOT NULL, "warnings" JSONB NOT NULL,
 "physical" REAL, "psychological" REAL, "social" REAL, "environment" REAL, "overall" REAL, "zbi" INTEGER,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "SurveyResponse_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SurveyImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SurveyResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "SurveyIdentityReview" (
 "id" TEXT NOT NULL PRIMARY KEY, "responseId" TEXT NOT NULL, "personId" TEXT, "memberId" TEXT,
 "action" TEXT NOT NULL, "method" TEXT NOT NULL DEFAULT 'Staff confirmation', "reviewedBy" TEXT NOT NULL,
 "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT NOT NULL DEFAULT '',
 CONSTRAINT "SurveyIdentityReview_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "PersonAlias" (
 "id" TEXT NOT NULL PRIMARY KEY, "personId" TEXT NOT NULL, "text" TEXT NOT NULL, "normalized" TEXT NOT NULL,
 "verified" BOOLEAN NOT NULL DEFAULT true, "verifiedBy" TEXT NOT NULL,
 "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "source" TEXT NOT NULL DEFAULT 'Staff verification',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonAlias_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SurveyImportBatch_centre_createdAt_idx" ON "SurveyImportBatch"("centre", "createdAt");
CREATE UNIQUE INDEX "SurveyResponse_sourceKey_key" ON "SurveyResponse"("sourceKey");
CREATE INDEX "SurveyResponse_centre_matchStatus_surveyDate_idx" ON "SurveyResponse"("centre", "matchStatus", "surveyDate");
CREATE INDEX "SurveyResponse_personId_method_surveyDate_idx" ON "SurveyResponse"("personId", "method", "surveyDate");
CREATE INDEX "SurveyIdentityReview_responseId_reviewedAt_idx" ON "SurveyIdentityReview"("responseId", "reviewedAt");
CREATE UNIQUE INDEX "PersonAlias_personId_normalized_key" ON "PersonAlias"("personId", "normalized");
CREATE INDEX "PersonAlias_normalized_verified_idx" ON "PersonAlias"("normalized", "verified");
