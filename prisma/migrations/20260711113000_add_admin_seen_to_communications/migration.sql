ALTER TABLE "Communication" ADD COLUMN "adminSeenAt" TIMESTAMP(3);

CREATE INDEX "Communication_applicationId_direction_adminSeenAt_idx" ON "Communication"("applicationId", "direction", "adminSeenAt");
