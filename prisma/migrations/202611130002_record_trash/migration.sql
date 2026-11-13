-- Recoverable Trash; existing records remain intact and start outside Trash.
ALTER TABLE "Person" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Person" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");
ALTER TABLE "Programme" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Programme" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "Programme_deletedAt_idx" ON "Programme"("deletedAt");
ALTER TABLE "GrantApplication" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "GrantApplication" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "GrantApplication_deletedAt_idx" ON "GrantApplication"("deletedAt");
ALTER TABLE "SurveyResponse" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "SurveyResponse" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "SurveyResponse_deletedAt_idx" ON "SurveyResponse"("deletedAt");
