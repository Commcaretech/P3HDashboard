-- CreateTable
CREATE TABLE "ExternalProgramme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programmeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL DEFAULT '',
    "ownership" TEXT NOT NULL DEFAULT 'Imported',
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL,
    "lastSyncAt" DATETIME NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "ExternalProgramme_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sourceUpdatedAt" DATETIME,
    CONSTRAINT "ExternalOccurrence_externalId_fkey" FOREIGN KEY ("externalId") REFERENCES "ExternalProgramme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgrammeSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "scope" JSONB NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Running',
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ProgrammeSyncLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- Additive column; retain the existing table and relationships.
ALTER TABLE "Programme" ADD COLUMN "suitabilityReviewed" BOOLEAN NOT NULL DEFAULT false;

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
