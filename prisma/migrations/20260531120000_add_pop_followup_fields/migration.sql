-- Add POP follow-up scheduling fields for EFT reminder/cancel workflow
ALTER TABLE "Application"
  ADD COLUMN "popDueAt" TIMESTAMP(3),
  ADD COLUMN "lastPopReminderAt" TIMESTAMP(3),
  ADD COLUMN "popReminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "autoCancelOnNoPop" BOOLEAN NOT NULL DEFAULT true;
