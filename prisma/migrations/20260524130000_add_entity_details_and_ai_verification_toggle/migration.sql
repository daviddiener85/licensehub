ALTER TABLE "RetentionSetting"
ADD COLUMN "aiDocumentVerificationEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Application"
ADD COLUMN "entityDisplayName" TEXT,
ADD COLUMN "entityRegistrationNumber" TEXT,
ADD COLUMN "representativeFullName" TEXT,
ADD COLUMN "representativeCapacity" TEXT;
