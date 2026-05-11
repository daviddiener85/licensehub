CREATE TABLE "MandateFormSubmission" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "signatureDataUrl" TEXT NOT NULL,
    "idPhotoFileName" TEXT NOT NULL,
    "idPhotoMimeType" TEXT NOT NULL,
    "idPhotoSizeBytes" INTEGER NOT NULL,
    "idPhotoStorageKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MandateFormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MandateFormSubmission_applicationId_key" ON "MandateFormSubmission"("applicationId");

ALTER TABLE "MandateFormSubmission" ADD CONSTRAINT "MandateFormSubmission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
