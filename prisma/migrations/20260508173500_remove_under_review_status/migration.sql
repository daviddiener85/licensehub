UPDATE "Application"
SET "currentStatus" = 'PENDING_REVIEW'
WHERE "currentStatus" = 'UNDER_REVIEW';

UPDATE "Application"
SET "previousStatus" = 'PENDING_REVIEW'
WHERE "previousStatus" = 'UNDER_REVIEW';

UPDATE "StatusHistory"
SET "fromStatus" = 'PENDING_REVIEW'
WHERE "fromStatus" = 'UNDER_REVIEW';

UPDATE "StatusHistory"
SET "toStatus" = 'PENDING_REVIEW'
WHERE "toStatus" = 'UNDER_REVIEW';

UPDATE "SupplierEvent"
SET "action" = 'PENDING_REVIEW'
WHERE "action" = 'UNDER_REVIEW';

ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";

CREATE TYPE "ApplicationStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'DOCUMENTS_RESUBMIT_REQUIRED',
  'ADDITIONAL_CHARGE_RAISED',
  'APPROVED',
  'AT_SUPPLIER',
  'SUPPLIER_PRODUCED',
  'RETURNING_TO_LICENSE_HUB',
  'DOCUMENT_RETURNED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED'
);

ALTER TABLE "Application" ALTER COLUMN "currentStatus" DROP DEFAULT;

ALTER TABLE "Application"
  ALTER COLUMN "currentStatus" TYPE "ApplicationStatus"
  USING ("currentStatus"::text::"ApplicationStatus");

ALTER TABLE "Application"
  ALTER COLUMN "previousStatus" TYPE "ApplicationStatus"
  USING ("previousStatus"::text::"ApplicationStatus");

ALTER TABLE "StatusHistory"
  ALTER COLUMN "fromStatus" TYPE "ApplicationStatus"
  USING ("fromStatus"::text::"ApplicationStatus");

ALTER TABLE "StatusHistory"
  ALTER COLUMN "toStatus" TYPE "ApplicationStatus"
  USING ("toStatus"::text::"ApplicationStatus");

ALTER TABLE "SupplierEvent"
  ALTER COLUMN "action" TYPE "ApplicationStatus"
  USING ("action"::text::"ApplicationStatus");

ALTER TABLE "Application" ALTER COLUMN "currentStatus" SET DEFAULT 'DRAFT';

DROP TYPE "ApplicationStatus_old";
