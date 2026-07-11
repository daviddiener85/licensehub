ALTER TABLE "Application"
ADD COLUMN "referralSource" TEXT,
ADD COLUMN "referralContact" TEXT,
ADD COLUMN "sendCompletedDocumentsToReferrer" BOOLEAN NOT NULL DEFAULT false;
