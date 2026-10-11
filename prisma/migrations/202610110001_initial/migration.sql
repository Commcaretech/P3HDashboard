-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Staff',
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "alias" TEXT NOT NULL DEFAULT '',
    "dob" DATETIME,
    "centre" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "race" TEXT NOT NULL DEFAULT '',
    "workingStatus" TEXT NOT NULL DEFAULT '',
    "preferredLanguage" TEXT NOT NULL DEFAULT '',
    "onboardingDate" DATETIME,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CareRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    CONSTRAINT "CareRelationship_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CareRelationship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MedicalCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PersonLanguage" (
    "personId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'Spoken / understood',

    PRIMARY KEY ("personId", "languageId"),
    CONSTRAINT "PersonLanguage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonInterest" (
    "personId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,

    PRIMARY KEY ("personId", "interestId"),
    CONSTRAINT "PersonInterest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonCondition" (
    "personId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    PRIMARY KEY ("personId", "conditionId"),
    CONSTRAINT "PersonCondition_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "MedicalCondition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Assessment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProgrammeLanguage" (
    "programmeId" TEXT NOT NULL,
    "languageId" TEXT NOT NULL,

    PRIMARY KEY ("programmeId", "languageId"),
    CONSTRAINT "ProgrammeLanguage_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgrammeLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgrammeInterest" (
    "programmeId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,

    PRIMARY KEY ("programmeId", "interestId"),
    CONSTRAINT "ProgrammeInterest_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgrammeInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgrammeCondition" (
    "programmeId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,

    PRIMARY KEY ("programmeId", "conditionId"),
    CONSTRAINT "ProgrammeCondition_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgrammeCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "MedicalCondition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Registered',
    CONSTRAINT "Participation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Participation_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportScheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GrantApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "applicationDate" DATETIME,
    "submissionDate" DATETIME,
    "approvalDate" DATETIME,
    "expiryDate" DATETIME,
    "nextReviewDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Not Applied',
    "amount" REAL,
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GrantApplication_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SupportScheme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GrantApplication_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GrantApplication_assignedId_fkey" FOREIGN KEY ("assignedId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceKey" TEXT,
    "title" TEXT NOT NULL,
    "personId" TEXT,
    "grantId" TEXT,
    "type" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "assignedId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Alert_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Alert_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Alert_assignedId_fkey" FOREIGN KEY ("assignedId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME
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

