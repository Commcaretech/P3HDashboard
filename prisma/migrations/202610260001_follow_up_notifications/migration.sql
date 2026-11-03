ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "recipientBirthdays" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
ALTER TABLE "Person" ADD COLUMN "contactNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GrantApplication" ADD COLUMN "followUpDays" INTEGER;
ALTER TABLE "GrantApplication" ADD COLUMN "followUpMonths" INTEGER;
ALTER TABLE "GrantApplication" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GrantApplication" ADD COLUMN "resolvedAt" DATETIME;
ALTER TABLE "GrantApplication" ADD COLUMN "overrideReason" TEXT NOT NULL DEFAULT '';
CREATE TABLE "FollowUp" (
 "id" TEXT NOT NULL PRIMARY KEY, "alertId" TEXT NOT NULL,
 "grantId" TEXT NOT NULL, "completedBy" TEXT NOT NULL,
 "completedAt" DATETIME NOT NULL, "outcome" TEXT NOT NULL,
 "notes" TEXT NOT NULL DEFAULT '', "resolved" BOOLEAN NOT NULL DEFAULT false,
 "nextDate" DATETIME,
 CONSTRAINT "FollowUp_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FollowUp_alertId_key" ON "FollowUp"("alertId");
CREATE INDEX "FollowUp_grantId_completedAt_idx" ON "FollowUp"("grantId", "completedAt");
CREATE TABLE "NotificationDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "notificationKey" TEXT NOT NULL,
 "userId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'Daily digest',
 "scheduledDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'Pending',
 "payload" JSONB, "reminderIds" JSONB, "providerMessageId" TEXT, "lastAttempt" DATETIME, "attempts" INTEGER NOT NULL DEFAULT 0,
 "failureReason" TEXT, "leaseUntil" DATETIME, "leaseToken" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_DATETIME
);
CREATE UNIQUE INDEX "NotificationDelivery_notificationKey_key" ON "NotificationDelivery"("notificationKey");
CREATE INDEX "NotificationDelivery_status_scheduledDate_idx" ON "NotificationDelivery"("status", "scheduledDate");

ALTER TABLE "GrantApplication" ADD COLUMN "followUpFrequency" TEXT NOT NULL DEFAULT 'Automatic';
ALTER TABLE "Alert" ADD COLUMN "activeFollowUpKey" TEXT;
CREATE UNIQUE INDEX "Alert_activeFollowUpKey_key" ON "Alert"("activeFollowUpKey");

ALTER TABLE "Alert" ADD COLUMN "autoDismissed" BOOLEAN NOT NULL DEFAULT false;
