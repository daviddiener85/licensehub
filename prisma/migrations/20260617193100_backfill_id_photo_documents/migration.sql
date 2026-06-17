INSERT INTO "Document" (
  "id",
  "applicationId",
  "type",
  "status",
  "version",
  "fileName",
  "mimeType",
  "fileSizeBytes",
  "storageKey",
  "createdAt"
)
SELECT
  CONCAT('idphoto_', SUBSTRING(MD5("applicationId"), 1, 16)),
  "applicationId",
  'ID_PHOTO'::"DocumentType",
  'PENDING'::"DocumentStatus",
  1,
  "idPhotoFileName",
  "idPhotoMimeType",
  "idPhotoSizeBytes",
  "idPhotoStorageKey",
  "submittedAt"
FROM "MandateFormSubmission"
ON CONFLICT ("applicationId", "type", "version") DO NOTHING;
