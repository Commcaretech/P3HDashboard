-- Additive metadata only; existing data and reviews remain unchanged.
ALTER TABLE "Programme" ADD COLUMN "interestTagsReviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExternalProgramme" ADD COLUMN "programmeType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ExternalOccurrence" ADD COLUMN "visibilityKnown" BOOLEAN NOT NULL DEFAULT false;
-- The v2 contract requires explicit source visibility. Legacy false defaults remain unknown.
UPDATE "ExternalOccurrence" SET "visibilityKnown" = true
WHERE "externalId" IN (SELECT "id" FROM "ExternalProgramme" WHERE "eligibilityRulesVersion" = 2);
