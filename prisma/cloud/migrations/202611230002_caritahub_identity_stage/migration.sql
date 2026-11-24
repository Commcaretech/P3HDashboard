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

