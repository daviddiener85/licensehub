-- CreateEnum
CREATE TYPE "SupplierUrgency" AS ENUM ('NORMAL', 'URGENT', 'VERY_URGENT');

-- CreateEnum
CREATE TYPE "OrderCommentSource" AS ENUM ('ADMIN', 'SUPPLIER');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "supplierUrgency" "SupplierUrgency" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "OrderComment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "source" "OrderCommentSource" NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_supplierUrgency_idx" ON "Application"("supplierUrgency");

-- CreateIndex
CREATE INDEX "OrderComment_applicationId_createdAt_idx" ON "OrderComment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderComment_source_idx" ON "OrderComment"("source");

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
