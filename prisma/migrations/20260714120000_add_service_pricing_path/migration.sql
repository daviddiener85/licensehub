ALTER TABLE "Service"
ADD COLUMN "requiresQuote" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Service"
SET "requiresQuote" = true
WHERE slug IN ('change-of-ownership', 'licence-renewal');
