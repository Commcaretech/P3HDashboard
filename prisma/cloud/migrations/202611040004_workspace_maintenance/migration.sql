-- Additive coordination for a non-blocking daily in-app reminder fallback.
CREATE TABLE "MaintenanceState" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "lastCompletedDate" TEXT NOT NULL DEFAULT '',
 "lastCompletedAt" TIMESTAMP(3),
 "leaseUntil" TIMESTAMP(3),
 "leaseToken" TEXT
);
