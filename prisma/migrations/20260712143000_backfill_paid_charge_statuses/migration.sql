UPDATE "Charge" AS c
SET
  status = 'PAID',
  "paidAt" = COALESCE(c."paidAt", NOW())
WHERE
  c.status = 'PENDING'
  AND c.reason LIKE 'QUOTE_V%'
  AND EXISTS (
    SELECT 1
    FROM "Payment" AS p
    WHERE p."applicationId" = c."applicationId"
      AND p.status = 'CONFIRMED'
      AND p.type = 'BASE_FEE'
      AND p."chargeId" IS NULL
  );

UPDATE "Charge" AS c
SET
  status = 'PAID',
  "paidAt" = COALESCE(c."paidAt", NOW())
WHERE
  c.status = 'PENDING'
  AND EXISTS (
    SELECT 1
    FROM "Payment" AS p
    WHERE p."chargeId" = c.id
      AND p.status = 'CONFIRMED'
  );
