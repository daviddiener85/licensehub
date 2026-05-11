UPDATE "Application"
SET "currentStatus" = 'DISPATCHED'
WHERE "currentStatus" = 'DELIVERED';

UPDATE "Application"
SET "previousStatus" = 'DISPATCHED'
WHERE "previousStatus" = 'DELIVERED';

UPDATE "StatusHistory"
SET "fromStatus" = 'DISPATCHED'
WHERE "fromStatus" = 'DELIVERED';

UPDATE "StatusHistory"
SET "toStatus" = 'DISPATCHED'
WHERE "toStatus" = 'DELIVERED';

UPDATE "SupplierEvent"
SET "action" = 'DISPATCHED'
WHERE "action" = 'DELIVERED';

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

ALTER TABLE "Dispatch" DROP COLUMN "deliveredAt";

DROP TYPE "ApplicationStatus_old";
