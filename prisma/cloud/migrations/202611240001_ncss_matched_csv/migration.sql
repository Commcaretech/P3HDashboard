ALTER TABLE "SurveyResponse" ADD COLUMN "importMode" TEXT NOT NULL DEFAULT 'Legacy';
CREATE INDEX "SurveyResponse_confirmedMemberId_surveyDate_idx" ON "SurveyResponse"("confirmedMemberId", "surveyDate");
CREATE INDEX "SurveyResponse_sourceResponseId_idx" ON "SurveyResponse"("sourceResponseId");
