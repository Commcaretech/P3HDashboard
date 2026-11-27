-- Monthly check-in reminders; last recorded contact per caregiver, null until staff record one.
ALTER TABLE "Person" ADD COLUMN "lastContactedAt" DATETIME;
