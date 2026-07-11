CREATE TABLE "RetentionPurge" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "storagePaths" JSONB NOT NULL,
    "databaseDeletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPurge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionPurge_applicationId_key" ON "RetentionPurge"("applicationId");
CREATE INDEX "RetentionPurge_createdAt_idx" ON "RetentionPurge"("createdAt");
