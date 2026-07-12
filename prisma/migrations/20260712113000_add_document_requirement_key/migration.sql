ALTER TABLE "Document" ADD COLUMN "requirementKey" TEXT;
CREATE INDEX "Document_applicationId_requirementKey_status_idx" ON "Document"("applicationId", "requirementKey", "status");

WITH ranked_supporting_documents AS (
  SELECT
    d."id",
    a."clientId",
    c."entityType",
    ROW_NUMBER() OVER (PARTITION BY d."applicationId" ORDER BY d."version" ASC) - 1 AS supporting_index
  FROM "Document" d
  INNER JOIN "Application" a ON a."id" = d."applicationId"
  INNER JOIN "Client" c ON c."id" = a."clientId"
  WHERE d."type" = 'OTHER'
)
UPDATE "Document" d
SET "requirementKey" = CASE
  WHEN ranked."entityType" = 'DECEASED_ESTATE' AND ranked.supporting_index % 2 = 0 THEN 'death-certificate'
  WHEN ranked."entityType" = 'DECEASED_ESTATE' AND ranked.supporting_index % 2 = 1 THEN 'executor-authority'
  WHEN ranked."entityType" = 'COMPANY_OR_TRUST' AND ranked.supporting_index % 2 = 0 THEN 'registration-or-trust-document'
  WHEN ranked."entityType" = 'COMPANY_OR_TRUST' AND ranked.supporting_index % 2 = 1 THEN 'representative-authority'
  WHEN ranked."entityType" = 'NON_SA_CITIZEN' AND ranked.supporting_index % 2 = 0 THEN 'traffic-register-document'
  WHEN ranked."entityType" = 'NON_SA_CITIZEN' AND ranked.supporting_index % 2 = 1 THEN 'passport-document'
  ELSE NULL
END
FROM ranked_supporting_documents ranked
WHERE d."id" = ranked."id";
