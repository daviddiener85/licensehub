ALTER TABLE "Application"
ADD COLUMN IF NOT EXISTS "deceasedFullName" TEXT,
ADD COLUMN IF NOT EXISTS "deceasedIdNumber" TEXT;
