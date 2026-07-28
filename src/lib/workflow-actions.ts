"use server";

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApplicationStatus,
  ClientEntityType,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  DocumentStatus,
  DocumentType,
  OrderCommentSource,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  SupplierUrgency,
  UserRole,
} from "@/generated/prisma/client";
import { clientIdMandatePdfLabel } from "@/lib/client-identity";
import { createMandatePdf } from "@/lib/mandate-pdf";
import { initializePaystackTransaction, isPaystackConfigured, paystackCallbackUrl } from "@/lib/paystack";
import { appBaseUrl, requestBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { markChargesPaidForConfirmedPayment } from "@/lib/payment-confirmation";
import { calculateRetentionEligibleAt } from "@/lib/retention";
import { deleteQueuedFiles, storagePathsForApplication } from "@/lib/retention-purge";
import {
  documentRequirementsForApplication,
  supportingDocumentForRequirement,
  supportingRequirementForDocument,
  supportingRequirementsForEntityType,
  supportingRequirementsForService,
} from "@/lib/entity-requirements";
import { documentLabel } from "@/lib/documents";
import { findActiveServiceBySlug } from "@/lib/services";
import {
  supplierReturnEvidenceRequirementKeys,
} from "@/lib/supplier-evidence";
import { isMetaProviderEnabled, sendMetaWhatsAppTemplate, sendMetaWhatsAppText } from "@/lib/whatsapp-meta";
import sharp from "sharp";

// Bound native image-processing memory on the 512 MB production instance.
sharp.cache(false);
sharp.concurrency(1);

export type PublicIntakeSubmissionState = {
  status: "idle" | "success" | "error";
  message: string;
  redirectTo?: string;
};

type MandatePdfApplication = {
  id: string;
  publicToken: string;
  service: {
    name: string;
  };
  entityDisplayName: string | null;
  entityRegistrationNumber: string | null;
  deceasedFullName: string | null;
  deceasedIdNumber: string | null;
  registrationNumber: string | null;
  vin: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColour: string | null;
  client: {
    firstName: string;
    surname: string;
    southAfricanIdEncrypted: string;
    entityType: ClientEntityType;
  };
};

type ApplicationBaseRowInput = {
  id: string;
  publicToken: string;
  clientId: string;
  serviceId: string;
  currentStatus: ApplicationStatus;
  registrationNumber: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear?: number | null;
  vehicleColour?: string | null;
  vin: string | null;
  referralSource?: string | null;
  referralContact?: string | null;
  sendCompletedDocumentsToReferrer?: boolean;
  entityDisplayName?: string | null;
  entityRegistrationNumber?: string | null;
  deceasedFullName?: string | null;
  deceasedIdNumber?: string | null;
  representativeFullName?: string | null;
  representativeCapacity?: string | null;
};

const mandatePdfApplicationSelect = {
  id: true,
  publicToken: true,
  service: {
    select: {
      name: true,
    },
  },
  entityDisplayName: true,
  entityRegistrationNumber: true,
  registrationNumber: true,
  deceasedFullName: true,
  deceasedIdNumber: true,
  vin: true,
  vehicleMake: true,
  vehicleModel: true,
  vehicleColour: true,
  client: {
    select: {
      firstName: true,
      surname: true,
      southAfricanIdEncrypted: true,
      entityType: true,
    },
  },
};

let applicationColumnNamesPromise: Promise<Set<string>> | null = null;
let applicationStatusValuesPromise: Promise<void> | null = null;

async function applicationColumnNames() {
  applicationColumnNamesPromise ??= prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Application'
  `.then((columns) => new Set(columns.map((column) => column.column_name)));

  return applicationColumnNamesPromise;
}

function filterApplicationColumnData(columns: Set<string>, data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => columns.has(key)));
}

async function ensureApplicationStatusValues() {
  applicationStatusValuesPromise ??= (async () => {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'AWAITING_ADMIN_QUOTE'`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'QUOTE_PENDING_CLIENT_APPROVAL'`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'QUOTE_APPROVED_AWAITING_PAYMENT'`,
    );
  })();

  return applicationStatusValuesPromise;
}

async function createApplicationBaseRow(input: ApplicationBaseRowInput) {
  const now = new Date();
  await ensureApplicationStatusValues();

  await prisma.$executeRaw`
    INSERT INTO "Application" (
      "id",
      "publicToken",
      "clientId",
      "serviceId",
      "currentStatus",
      "registrationNumber",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "vehicleColour",
      "vin",
      "referralSource",
      "referralContact",
      "sendCompletedDocumentsToReferrer",
      "entityDisplayName",
      "entityRegistrationNumber",
      "deceasedFullName",
      "deceasedIdNumber",
      "representativeFullName",
      "representativeCapacity",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${input.id},
      ${input.publicToken},
      ${input.clientId},
      ${input.serviceId},
      CAST(${input.currentStatus}::text AS "ApplicationStatus"),
      ${input.registrationNumber},
      ${input.vehicleMake},
      ${input.vehicleModel},
      ${input.vehicleYear ?? null},
      ${input.vehicleColour ?? null},
      ${input.vin},
      ${input.referralSource ?? null},
      ${input.referralContact ?? null},
      ${input.sendCompletedDocumentsToReferrer ?? false},
      ${input.entityDisplayName ?? null},
      ${input.entityRegistrationNumber ?? null},
      ${input.deceasedFullName ?? null},
      ${input.deceasedIdNumber ?? null},
      ${input.representativeFullName ?? null},
      ${input.representativeCapacity ?? null},
      ${now},
      ${now}
    )
  `;
}

async function actorIdFor(role: UserRole) {
  const user = await prisma.user.findFirst({
    where: { role },
    select: { id: true },
  });

  return user?.id ?? null;
}

function getApplicationId(formData: FormData) {
  const applicationId = formData.get("applicationId");

  if (typeof applicationId !== "string" || applicationId.length === 0) {
    throw new Error("applicationId is required.");
  }

  return applicationId;
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

const imageUploadTypes = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;
const documentUploadTypes = [...imageUploadTypes, "application/pdf"] as const;
const maxUploadSizeBytes = 12 * 1024 * 1024;

function assertUploadSize(file: File, label: string) {
  if (file.size > maxUploadSizeBytes) {
    throw new Error(`${label} must be smaller than 12MB.`);
  }
}

function getSignatureDataUrl(formData: FormData) {
  const signatureDataUrl = formData.get("signatureDataUrl");

  if (typeof signatureDataUrl !== "string" || !signatureDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("A phone signature is required before submitting the mandate form.");
  }

  return signatureDataUrl;
}

function getIdPhoto(formData: FormData) {
  const idPhoto = formData.get("idPhoto");

  if (!(idPhoto instanceof File) || idPhoto.size === 0) {
    throw new Error("An ID photo is required before submitting the mandate form.");
  }

  if (!imageUploadTypes.includes(idPhoto.type as (typeof imageUploadTypes)[number])) {
    throw new Error("The ID photo must be an image file.");
  }

  assertUploadSize(idPhoto, "The ID photo");

  return idPhoto;
}

function getOptionalIdPhoto(formData: FormData) {
  const idPhoto = formData.get("idPhoto");

  if (!(idPhoto instanceof File) || idPhoto.size === 0) {
    return null;
  }

  if (!imageUploadTypes.includes(idPhoto.type as (typeof imageUploadTypes)[number])) {
    throw new Error("The ID photo must be an image file.");
  }

  assertUploadSize(idPhoto, "The ID photo");

  return idPhoto;
}

function isImageFile(file: File | null) {
  return Boolean(file && imageUploadTypes.includes(file.type as (typeof imageUploadTypes)[number]));
}

function getRequiredFile(formData: FormData, fieldName: string, label: string, allowedTypes: string[]) {
  const file = formData.get(fieldName);

  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${label} is required.`);
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`${label} must be one of the accepted file types.`);
  }

  assertUploadSize(file, label);

  return file;
}

function getOptionalFile(formData: FormData, fieldName: string, label: string, allowedTypes: string[]) {
  const file = formData.get(fieldName);

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`${label} must be one of the accepted file types.`);
  }

  assertUploadSize(file, label);

  return file;
}

async function normalizeUploadedImage(file: File) {
  const inputBytes = Buffer.from(await file.arrayBuffer());

  try {
    const output = await sharp(inputBytes)
      .rotate()
      .resize({
        width: 1600,
        height: 2200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: output.data,
      mimeType: "image/jpeg",
      fileName: `${safeFileName(file.name || "photo").replace(/\.[^.]+$/, "")}.jpg`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unsupported image format") || message.includes("vips") || message.includes("sharp")) {
      throw new Error("The uploaded image could not be processed. Please upload a JPG or PNG image.");
    }

    throw error;
  }
}

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function getProofDocumentDate(formData: FormData) {
  const value = formData.get("proofDocumentDate");

  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Proof of address document date is required.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Proof of address document date is invalid.");
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setHours(0, 0, 0, 0);

  if (date < threeMonthsAgo) {
    throw new Error("Proof of address must be dated within the last 3 months.");
  }

  return date;
}

async function saveUploadedDocument(
  applicationId: string,
  file: File,
  type: DocumentType,
  uploadFolder: string,
  proofDocumentDate?: Date,
) {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", uploadFolder, applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}-${safeFileName(file.name || type.toLowerCase())}`;
  const isImage = imageUploadTypes.includes(file.type as (typeof imageUploadTypes)[number]);
  const normalized = isImage ? await normalizeUploadedImage(file) : null;
  const bytes = normalized?.bytes ?? Buffer.from(await file.arrayBuffer());
  const mimeType = normalized?.mimeType ?? file.type;
  const storedFileName = normalized ? `${randomUUID()}-${normalized.fileName}` : fileName;

  await writeFile(path.join(uploadDirectory, storedFileName), bytes);

  await prisma.document.upsert({
    where: {
      applicationId_type_version: {
        applicationId,
        type,
        version: 1,
      },
    },
    update: {
      status: DocumentStatus.PENDING,
      fileName: normalized?.fileName ?? (file.name || fileName),
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${storedFileName}`,
      proofDocumentDate,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      applicationId,
      type,
      status: DocumentStatus.PENDING,
      version: 1,
      fileName: normalized?.fileName ?? (file.name || fileName),
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${storedFileName}`,
      proofDocumentDate,
    },
  });
}

async function saveAdditionalSupportingDocuments(
  applicationId: string,
  uploads: Array<{ file: File; requirementKey: string }>,
) {
  const validUploads = uploads.filter(({ file }) => file instanceof File && file.size > 0);

  if (validUploads.length === 0) {
    return;
  }

  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "client-documents", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const existingOtherDocuments = await prisma.document.findMany({
    where: {
      applicationId,
      type: DocumentType.OTHER,
    },
    select: { version: true },
    orderBy: { version: "desc" },
    take: 1,
  });
  let nextVersion = (existingOtherDocuments[0]?.version ?? 0) + 1;

  for (const { file, requirementKey } of validUploads) {
    const fileName = `${randomUUID()}-${safeFileName(file.name || "supporting-document")}`;
    const isImage = imageUploadTypes.includes(file.type as (typeof imageUploadTypes)[number]);
    const normalized = isImage ? await normalizeUploadedImage(file) : null;
    const bytes = normalized?.bytes ?? Buffer.from(await file.arrayBuffer());
    const mimeType = normalized?.mimeType ?? (file.type || "application/octet-stream");
    const storedFileName = normalized ? `${randomUUID()}-${normalized.fileName}` : fileName;
    const storageKey = `/uploads/client-documents/${applicationId}/${storedFileName}`;

    await writeFile(path.join(uploadDirectory, storedFileName), bytes);

    await prisma.document.create({
      data: {
        applicationId,
        type: DocumentType.OTHER,
        requirementKey,
        status: DocumentStatus.PENDING,
        version: nextVersion,
        fileName: normalized?.fileName ?? (file.name || fileName),
        mimeType,
        fileSizeBytes: bytes.length,
        storageKey,
      },
    });

    nextVersion += 1;
  }
}

async function saveSupplierReturnEvidenceDocument(
  applicationId: string,
  file: File,
  requirementKey: string,
) {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "supplier-evidence", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}-${safeFileName(file.name || "supplier-evidence")}`;
  const isImage = imageUploadTypes.includes(file.type as (typeof imageUploadTypes)[number]);
  const normalized = isImage ? await normalizeUploadedImage(file) : null;
  const bytes = normalized?.bytes ?? Buffer.from(await file.arrayBuffer());
  const mimeType = normalized?.mimeType ?? (file.type || "application/octet-stream");
  const storedFileName = normalized ? `${randomUUID()}-${normalized.fileName}` : fileName;
  const storageKey = `/uploads/supplier-evidence/${applicationId}/${storedFileName}`;

  await writeFile(path.join(uploadDirectory, storedFileName), bytes);

  const existingEvidence = await prisma.document.findFirst({
    where: {
      applicationId,
      type: DocumentType.OTHER,
      requirementKey,
    },
    select: { id: true },
  });

  if (existingEvidence) {
    await prisma.document.update({
      where: { id: existingEvidence.id },
      data: {
        status: DocumentStatus.ACCEPTED,
        fileName: normalized?.fileName ?? (file.name || fileName),
        mimeType,
        fileSizeBytes: bytes.length,
        storageKey,
        rejectionReason: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
    return;
  }

  const latestOtherDocument = await prisma.document.findFirst({
    where: {
      applicationId,
      type: DocumentType.OTHER,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestOtherDocument?.version ?? 0) + 1;

  await prisma.document.create({
    data: {
      applicationId,
      type: DocumentType.OTHER,
      requirementKey,
      status: DocumentStatus.ACCEPTED,
      version: nextVersion,
      fileName: normalized?.fileName ?? (file.name || fileName),
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey,
      reviewedById: null,
      reviewedAt: null,
    },
  });
}

async function saveAdminUploadedDocument(
  applicationId: string,
  file: File,
  type: DocumentType,
  uploadFolder: string,
  proofDocumentDate?: Date,
  requirementKey?: string | null,
) {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", uploadFolder, applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}-${safeFileName(file.name || type.toLowerCase())}`;
  const isImage = imageUploadTypes.includes(file.type as (typeof imageUploadTypes)[number]);
  const normalized = isImage ? await normalizeUploadedImage(file) : null;
  const bytes = normalized?.bytes ?? Buffer.from(await file.arrayBuffer());
  const mimeType = normalized?.mimeType ?? (file.type || "application/octet-stream");
  const storedFileName = normalized ? `${randomUUID()}-${normalized.fileName}` : fileName;

  await writeFile(path.join(uploadDirectory, storedFileName), bytes);

  if (type === DocumentType.OTHER) {
    const latestOtherDocument = await prisma.document.findFirst({
      where: {
        applicationId,
        type: DocumentType.OTHER,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latestOtherDocument?.version ?? 0) + 1;

    await prisma.document.create({
      data: {
        applicationId,
        type,
        requirementKey: requirementKey ?? null,
        status: DocumentStatus.ACCEPTED,
        version: nextVersion,
        fileName: normalized?.fileName ?? (file.name || fileName),
        mimeType,
        fileSizeBytes: bytes.length,
        storageKey: `/uploads/${uploadFolder}/${applicationId}/${storedFileName}`,
        proofDocumentDate,
        reviewedById: await actorIdFor(UserRole.ADMIN),
        reviewedAt: new Date(),
      },
    });

    return;
  }

  await prisma.document.upsert({
    where: {
      applicationId_type_version: {
        applicationId,
        type,
        version: 1,
      },
    },
    update: {
      status: DocumentStatus.ACCEPTED,
      fileName: normalized?.fileName ?? (file.name || fileName),
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${storedFileName}`,
      proofDocumentDate,
      rejectionReason: null,
      reviewedById: await actorIdFor(UserRole.ADMIN),
      reviewedAt: new Date(),
    },
    create: {
      applicationId,
      type,
      status: DocumentStatus.ACCEPTED,
      version: 1,
      fileName: normalized?.fileName ?? (file.name || fileName),
      mimeType,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${storedFileName}`,
      proofDocumentDate,
      reviewedById: await actorIdFor(UserRole.ADMIN),
      reviewedAt: new Date(),
    },
  });
}

async function maybeVerifyUploadedDocumentsWithAi(options: {
  applicationId: string;
  registrationNumber: string;
  identityNumber: string;
  entityDisplayName: string | null;
  entityRegistrationNumber: string | null;
  files: File[];
}) {
  const setting = await prisma.retentionSetting.findUnique({
    where: { id: "default" },
    select: { aiDocumentVerificationEnabled: true },
  });

  if (!setting?.aiDocumentVerificationEnabled) {
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    await appendStatusHistoryNote(
      options.applicationId,
      null,
      "AI document verification is enabled, but OPENAI_API_KEY is not configured.",
    );
    return;
  }

  const comparableRegistration = normalizeComparable(options.registrationNumber);
  const comparableIdentity = normalizeComparable(options.identityNumber);
  const comparableEntityRegistration = normalizeComparable(options.entityRegistrationNumber);
  const comparableEntityName = normalizeComparable(options.entityDisplayName);

  const results = await Promise.all(
    options.files
      .filter((file) => file instanceof File && file.size > 0)
      .slice(0, 8)
      .map(async (file) => {
        try {
          return {
            fileName: file.name || "uploaded-file",
            result: await runOpenAiDocumentCheck(file),
            error: null,
          };
        } catch (error) {
          return {
            fileName: file.name || "uploaded-file",
            result: null,
            error: error instanceof Error ? error.message : "Unknown AI verification error.",
          };
        }
      }),
  );

  const issues: string[] = [];

  for (const item of results) {
    if (item.error) {
      issues.push(`${item.fileName}: ${item.error}`);
      continue;
    }

    const result = item.result;
    if (!result) {
      continue;
    }

    const detectedReg = normalizeComparable(result.detectedRegistrationNumber);
    const detectedId = normalizeComparable(result.detectedIdentityNumber);
    const detectedEntityName = normalizeComparable(result.detectedOwnerOrEntityName);

    if (detectedReg && comparableRegistration && detectedReg !== comparableRegistration) {
      issues.push(`${item.fileName}: registration mismatch detected (${result.detectedRegistrationNumber}).`);
    }

    if (detectedId && comparableIdentity && detectedId !== comparableIdentity) {
      issues.push(`${item.fileName}: identity mismatch detected (${result.detectedIdentityNumber}).`);
    }

    if (comparableEntityRegistration && detectedId && detectedId !== comparableEntityRegistration) {
      issues.push(`${item.fileName}: entity/registration reference does not match entered value.`);
    }

    if (comparableEntityName && detectedEntityName && !detectedEntityName.includes(comparableEntityName)) {
      issues.push(`${item.fileName}: entity name appears different from entered details.`);
    }

    for (const concern of result.concerns) {
      issues.push(`${item.fileName}: ${concern}`);
    }
  }

  if (issues.length === 0) {
    await appendStatusHistoryNote(options.applicationId, null, "AI document verification completed with no warnings.");
    return;
  }

  await appendStatusHistoryNote(
    options.applicationId,
    null,
    `AI document verification warnings: ${issues.slice(0, 6).join(" | ")}`,
  );
}

async function saveMandateIdPhoto(applicationId: string, idPhoto: File) {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "mandate-forms", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}-${safeFileName(idPhoto.name || "id-photo")}`;
  const idPhotoBytes = Buffer.from(await idPhoto.arrayBuffer());
  const storageKey = `/uploads/mandate-forms/${applicationId}/${fileName}`;

  await writeFile(path.join(uploadDirectory, fileName), idPhotoBytes);

  return {
    fileName,
    idPhotoBytes,
    storageKey,
  };
}

async function saveMandateIdPhotoDocument(
  applicationId: string,
  idPhoto: File,
  savedIdPhoto: Awaited<ReturnType<typeof saveMandateIdPhoto>>,
) {
  await prisma.document.upsert({
    where: {
      applicationId_type_version: {
        applicationId,
        type: DocumentType.ID_PHOTO,
        version: 1,
      },
    },
    update: {
      status: DocumentStatus.PENDING,
      fileName: idPhoto.name || savedIdPhoto.fileName,
      mimeType: idPhoto.type || "application/octet-stream",
      fileSizeBytes: idPhoto.size,
      storageKey: savedIdPhoto.storageKey,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      applicationId,
      type: DocumentType.ID_PHOTO,
      status: DocumentStatus.PENDING,
      version: 1,
      fileName: idPhoto.name || savedIdPhoto.fileName,
      mimeType: idPhoto.type || "application/octet-stream",
      fileSizeBytes: idPhoto.size,
      storageKey: savedIdPhoto.storageKey,
    },
  });
}

function storageKeyPath(storageKey: string) {
  const relativePath = storageKey.replace(/^\/+/, "");

  if (!relativePath.startsWith("uploads/")) {
    throw new Error("Unsupported storage key.");
  }

  return path.join(process.cwd(), "public", relativePath);
}

async function writeMandatePdf(
  application: MandatePdfApplication,
  signatureDataUrl: string,
  idPhotoBytes?: Buffer,
  idPhotoMimeType?: string,
) {
  const applicationId = application.id;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "mandate-forms", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const pdfBytes = await createMandatePdf({
    serviceName: application.service.name,
    clientName: `${application.client.firstName} ${application.client.surname}`,
    clientIdLabel: clientIdMandatePdfLabel(application.client.southAfricanIdEncrypted),
    entityType: application.client.entityType,
    entityDisplayName: application.entityDisplayName,
    entityRegistrationNumber: application.entityRegistrationNumber,
    deceasedFullName: application.deceasedFullName,
    deceasedIdNumber: application.deceasedIdNumber,
    date: new Date(),
    registrationNumber: application.registrationNumber,
    vin: application.vin,
    make: application.vehicleMake,
    model: application.vehicleModel,
    colour: application.vehicleColour,
    signatureDataUrl,
    idPhotoBytes,
    idPhotoMimeType,
  });
  const pdfStorageKey = `/uploads/mandate-forms/${applicationId}/mandate-form.pdf`;

  await writeFile(path.join(uploadDirectory, "mandate-form.pdf"), pdfBytes);

  await prisma.document.upsert({
    where: {
      applicationId_type_version: {
        applicationId,
        type: DocumentType.MANDATE_FORM,
        version: 1,
      },
    },
    update: {
      status: DocumentStatus.PENDING,
      fileName: "mandate-form.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: pdfBytes.length,
      storageKey: pdfStorageKey,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    },
    create: {
      applicationId,
      type: DocumentType.MANDATE_FORM,
      status: DocumentStatus.PENDING,
      version: 1,
      fileName: "mandate-form.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: pdfBytes.length,
      storageKey: pdfStorageKey,
    },
  });
}

async function transitionApplication(
  applicationId: string,
  toStatus: ApplicationStatus,
  options: {
    actorId?: string | null;
    note?: string;
    data?: Record<string, unknown>;
  } = {},
) {
  await ensureApplicationStatusValues();
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { currentStatus: true },
  });
  const applicationColumns = await applicationColumnNames();
  const transitionData = filterApplicationColumnData(applicationColumns, options.data ?? {});

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      currentStatus: toStatus,
      previousStatus: application.currentStatus,
      ...transitionData,
    },
    select: {
      id: true,
      currentStatus: true,
    },
  });

  await prisma.statusHistory.create({
    data: {
      applicationId,
      fromStatus: application.currentStatus,
      toStatus,
      changedById: options.actorId,
      note: options.note,
    },
  });

  return updated;
}

function nextStatusAfterPaymentConfirmation(application: {
  currentStatus: ApplicationStatus;
  previousStatus: ApplicationStatus | null;
}) {
  if (application.currentStatus === ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT) {
    return ApplicationStatus.PENDING_REVIEW;
  }

  if (application.currentStatus === ApplicationStatus.ADDITIONAL_CHARGE_RAISED) {
    return application.previousStatus ?? ApplicationStatus.PENDING_REVIEW;
  }

  return null;
}

function refreshWorkflowPages() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/supplier");
  revalidatePath("/client/[token]", "page");
}

async function dispatchWhatsAppCommunication(communication: {
  id: string;
  recipientAddress: string;
  body: string;
  template?: {
    name: string;
    languageCode?: string;
    bodyParameters: ReadonlyArray<{ type: "text"; text: string }>;
  };
}) {
  if (!isMetaProviderEnabled()) {
    return;
  }

  try {
    const result = communication.template
      ? await sendMetaWhatsAppTemplate({
          to: communication.recipientAddress,
          name: communication.template.name,
          languageCode: communication.template.languageCode,
          bodyParameters: communication.template.bodyParameters,
        })
      : await sendMetaWhatsAppText({
          to: communication.recipientAddress,
          body: communication.body,
          previewUrl: true,
        });

    await prisma.communication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        providerPayload: result.raw,
        errorMessage: null,
        failedAt: null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Meta dispatch error";

    await prisma.communication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.FAILED,
        failedAt: new Date(),
        errorMessage,
        providerPayload: communication.template
          ? ({ mode: "template", template: communication.template, error: errorMessage } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    console.error("WhatsApp dispatch failed:", error);
  }
}


async function appendStatusHistoryNote(applicationId: string, actorId: string | null, note: string) {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { currentStatus: true },
  });

  await prisma.statusHistory.create({
    data: {
      applicationId,
      fromStatus: application.currentStatus,
      toStatus: application.currentStatus,
      changedById: actorId,
      note,
    },
  });
}

async function auditLabelForDocument(applicationId: string, documentId: string) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      fileName: true,
      version: true,
      requirementKey: true,
      application: {
        select: {
          client: {
            select: {
              entityType: true,
            },
          },
        },
      },
    },
  });

  if (document.type !== DocumentType.OTHER) {
    return documentLabel(document.type, document.fileName);
  }

  const supportingDocuments = await prisma.document.findMany({
    where: {
      applicationId,
      type: DocumentType.OTHER,
    },
    select: { id: true, type: true, version: true, requirementKey: true },
    orderBy: { version: "asc" },
  });
  const requirementForIndex = supportingRequirementForDocument(
    document,
    document.application.client.entityType,
    supportingDocuments,
  );

  return requirementForIndex?.label ?? documentLabel(document.type, document.fileName);
}

function getRequiredString(formData: FormData, fieldName: string, label: string) {
  const value = formData.get(fieldName);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName);

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanVehicleIdentifier(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

type LicenceDiskExtraction = {
  /**
   * Stored on the application as registrationNumber for legacy reasons, but this value must be the
   * licence disk's vehicle register number, not the licence plate/licence number.
   */
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  confidence: number;
  needsManualReview: boolean;
};

type DocumentAiCheckResult = {
  documentType: string;
  detectedOwnerOrEntityName: string;
  detectedRegistrationNumber: string;
  detectedIdentityNumber: string;
  concerns: string[];
};

function outputTextFromOpenAiResponse(response: unknown) {
  if (!response || typeof response !== "object") {
    return "";
  }

  if ("output_text" in response && typeof response.output_text === "string") {
    return response.output_text;
  }

  if (!("output" in response) || !Array.isArray(response.output)) {
    return "";
  }

  return response.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item) || !Array.isArray(item.content)) {
        return [];
      }

      return (item.content as unknown[]).flatMap((content: unknown) => {
        if (!content || typeof content !== "object") {
          return [];
        }

        if ("text" in content && typeof content.text === "string") {
          return [content.text];
        }

        return [];
      });
    })
    .join("\n");
}

function normalizeComparable(value: string | null | undefined) {
  return (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function runOpenAiDocumentCheck(file: File): Promise<DocumentAiCheckResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!file.type.startsWith("image/")) {
    return {
      documentType: file.name || "document",
      detectedOwnerOrEntityName: "",
      detectedRegistrationNumber: "",
      detectedIdentityNumber: "",
      concerns: ["Skipped by AI verifier because this file is not an image."],
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  const model = process.env.OPENAI_LICENSE_DISK_MODEL || "gpt-5-mini";
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Inspect this uploaded application document and extract likely identifying details. " +
                  "Return JSON only and include any uncertainty in concerns. Do not guess unreadable values.",
              },
              {
                type: "input_image",
                image_url: dataUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "application_document_check",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                documentType: { type: "string" },
                detectedOwnerOrEntityName: { type: "string" },
                detectedRegistrationNumber: { type: "string" },
                detectedIdentityNumber: { type: "string" },
                concerns: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "documentType",
                "detectedOwnerOrEntityName",
                "detectedRegistrationNumber",
                "detectedIdentityNumber",
                "concerns",
              ],
            },
          },
        },
      }),
    }),
    25_000,
    "OpenAI document verification timed out.",
  );

  if (!response.ok) {
    throw new Error(`OpenAI document verification failed with ${response.status}.`);
  }

  const body = (await response.json()) as unknown;
  const outputText = outputTextFromOpenAiResponse(body);
  return JSON.parse(outputText) as DocumentAiCheckResult;
}

async function extractLicenceDiskWithOpenAi(file: File): Promise<LicenceDiskExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  const model = process.env.OPENAI_LICENSE_DISK_MODEL || "gpt-5-mini";
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Extract vehicle details from this South African vehicle licence disk photo. " +
                  "Return JSON only. If a field is unclear, use an empty string and set needsManualReview to true. " +
                  "For registrationNumber, extract the VEHICLE REGISTER NUMBER only. It is labelled 'Veh. register no.' or 'Vrt.registernr.' on the disk. " +
                  "Across South African provinces, wording and layout may differ; still choose the vehicle register/register no. field, not the licence/licence plate field. " +
                  "Do NOT use the licence plate/licence number labelled 'Licence no.' or 'Lisensienr.' for registrationNumber. " +
                  "For example, if the disk shows 'Licence no. DG80YBZN' and 'Veh. register no. WGJ776W', return registrationNumber as 'WGJ776W'. " +
                  "Do not guess the register number, VIN/chassis, make, or model from partial unreadable text.",
              },
              {
                type: "input_image",
                image_url: dataUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "licence_disk_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                registrationNumber: {
                  type: "string",
                  description:
                    "Vehicle register number from the licence disk, labelled 'Veh. register no.' or 'Vrt.registernr.'. This is not the licence plate/licence number.",
                },
                vin: {
                  type: "string",
                  description: "VIN or chassis number from the licence disk.",
                },
                make: {
                  type: "string",
                  description: "Vehicle make, for example TOYOTA.",
                },
                model: {
                  type: "string",
                  description: "Vehicle model, for example COROLLA.",
                },
                confidence: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Overall extraction confidence from 0 to 100.",
                },
                needsManualReview: {
                  type: "boolean",
                  description: "True when any key vehicle field is unclear or missing.",
                },
              },
              required: ["registrationNumber", "vin", "make", "model", "confidence", "needsManualReview"],
            },
          },
        },
      }),
    }),
    20_000,
    "OpenAI licence disk scan timed out.",
  );

  if (!response.ok) {
    throw new Error(`OpenAI licence disk scan failed with ${response.status}.`);
  }

  const body = (await response.json()) as unknown;
  const outputText = outputTextFromOpenAiResponse(body);
  const parsed = JSON.parse(outputText) as LicenceDiskExtraction;

  return {
    registrationNumber: cleanVehicleIdentifier(parsed.registrationNumber || ""),
    vin: cleanVehicleIdentifier(parsed.vin || ""),
    make: (parsed.make || "").trim().toUpperCase(),
    model: (parsed.model || "").trim().toUpperCase(),
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
    needsManualReview: Boolean(parsed.needsManualReview),
  };
}

export async function scanLicenceDiskPhoto(_previousState: unknown, formData: FormData) {
  const file = formData.get("licenceDiskPhoto");

  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Choose a licence disk photo before scanning.",
      fields: { registrationNumber: "", vin: "", make: "", model: "" },
      confidence: 0,
    };
  }

  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return {
      status: "error",
      message: "The licence disk photo must be a JPG or PNG image.",
      fields: { registrationNumber: "", vin: "", make: "", model: "" },
      confidence: 0,
    };
  }

  try {
    const extraction = await extractLicenceDiskWithOpenAi(file);
    const fields = {
      registrationNumber: extraction.registrationNumber,
      vin: extraction.vin,
      make: extraction.make,
      model: extraction.model,
    };
    const populatedFieldCount = Object.values(fields).filter(Boolean).length;
    const needsManualReview = extraction.needsManualReview || populatedFieldCount < 2;

    return {
      status: populatedFieldCount > 0 && !needsManualReview ? "success" : "needs-review",
      message:
        populatedFieldCount > 0
          ? "AI scanned the licence disk. Please confirm or correct the values below."
          : "AI could not read the vehicle details clearly. Please enter them manually from the licence disk.",
      fields,
      confidence: extraction.confidence,
    };
  } catch {
    return {
      status: "error",
      message:
        "The AI licence disk scan is not available or could not read the image. Please enter the vehicle details manually.",
      fields: { registrationNumber: "", vin: "", make: "", model: "" },
      confidence: 0,
    };
  }
}

function getRequiredCheckbox(formData: FormData, fieldName: string, label: string) {
  if (formData.get(fieldName) !== "on") {
    throw new Error(`${label} is required.`);
  }
}

function getSelectedServiceSlug(formData: FormData) {
  const value = getOptionalString(formData, "serviceSlug");

  return value ?? "duplicate-certificate";
}

function getSupplierUrgency(formData: FormData) {
  const value = getOptionalString(formData, "supplierUrgency");

  if (value === SupplierUrgency.URGENT || value === SupplierUrgency.VERY_URGENT) {
    return value;
  }

  return SupplierUrgency.NORMAL;
}

async function createOrderComment(
  applicationId: string,
  source: OrderCommentSource,
  authorName: string,
  body: string | null,
) {
  const comment = body?.trim();

  if (!comment) {
    return;
  }

  await prisma.orderComment.create({
    data: {
      applicationId,
      source,
      authorName,
      body: comment,
    },
  });
}

function getClientEntityType(formData: FormData) {
  const value = formData.get("entityType");

  if (
    value !== ClientEntityType.PRIVATE_OWNER &&
    value !== ClientEntityType.DECEASED_ESTATE &&
    value !== ClientEntityType.COMPANY_OR_TRUST &&
    value !== ClientEntityType.NON_SA_CITIZEN
  ) {
    throw new Error("A valid entity type is required.");
  }

  return value;
}

function getOwnershipEntityType(formData: FormData) {
  const value = formData.get("ownershipType");

  if (value === "private-owner") {
    return ClientEntityType.PRIVATE_OWNER;
  }

  if (value === "deceased-estate") {
    return ClientEntityType.DECEASED_ESTATE;
  }

  if (value === "company-or-trust") {
    return ClientEntityType.COMPANY_OR_TRUST;
  }

  if (value === "non-sa-citizen") {
    return ClientEntityType.NON_SA_CITIZEN;
  }

  throw new Error("A valid ownership type is required.");
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      surname: "Not supplied",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    surname: parts.at(-1) ?? "Not supplied",
  };
}

function clientIdHash(identifier: string) {
  return createHash("sha256").update(identifier.replace(/\s+/g, "").toUpperCase()).digest("hex");
}

async function nextApplicationId() {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    const id = `LH-${year}-${suffix}`;
    const existing = await prisma.application.findUnique({ where: { id }, select: { id: true } });

    if (!existing) {
      return id;
    }
  }

  throw new Error("Could not allocate a unique application number.");
}

export async function createClientApplicationLink(formData: FormData) {
  const entityType = getClientEntityType(formData);
  const firstName = getRequiredString(formData, "firstName", "First name");
  const surname = getRequiredString(formData, "surname", "Surname");
  const identityNumber = getRequiredString(formData, "identityNumber", "ID or passport number");
  const cellphone = getRequiredString(formData, "cellphone", "Cellphone");
  const email = getRequiredString(formData, "email", "Email");
  const deliveryAddressLine1 = getRequiredString(formData, "deliveryAddressLine1", "Address line 1");
  const deliveryCity = getRequiredString(formData, "deliveryCity", "City");
  const deliveryPostalCode = getRequiredString(formData, "deliveryPostalCode", "Postal code");
  const registrationNumber = getRequiredString(formData, "registrationNumber", "Register");
  const vin = getOptionalString(formData, "vin");
  const vehicleMake = getOptionalString(formData, "vehicleMake");
  const vehicleModel = getOptionalString(formData, "vehicleModel");
  const vehicleYear = Number(getOptionalString(formData, "vehicleYear")) || null;
  const vehicleColour = getOptionalString(formData, "vehicleColour");
  const applicationId = await nextApplicationId();
  const publicToken = randomUUID();
  const service = await findActiveServiceBySlug("duplicate-certificate");
  const client = await prisma.client.upsert({
    where: { southAfricanIdHash: clientIdHash(identityNumber) },
    update: {
      entityType,
      referralSource: getOptionalString(formData, "referralSource"),
      firstName,
      surname,
      southAfricanIdEncrypted: identityNumber,
      cellphone,
      email,
      deliveryAddressLine1,
      deliveryAddressLine2: getOptionalString(formData, "deliveryAddressLine2"),
      deliverySuburb: getOptionalString(formData, "deliverySuburb"),
      deliveryCity,
      deliveryProvince: getOptionalString(formData, "deliveryProvince"),
      deliveryPostalCode,
    },
    create: {
      entityType,
      referralSource: getOptionalString(formData, "referralSource"),
      firstName,
      surname,
      southAfricanIdEncrypted: identityNumber,
      southAfricanIdHash: clientIdHash(identityNumber),
      cellphone,
      email,
      deliveryAddressLine1,
      deliveryAddressLine2: getOptionalString(formData, "deliveryAddressLine2"),
      deliverySuburb: getOptionalString(formData, "deliverySuburb"),
      deliveryCity,
      deliveryProvince: getOptionalString(formData, "deliveryProvince"),
      deliveryPostalCode,
      popiaConsentAcceptedAt: new Date(),
    },
  });

  await createApplicationBaseRow({
    id: applicationId,
    publicToken,
    clientId: client.id,
    serviceId: service.id,
    currentStatus: ApplicationStatus.DRAFT,
    registrationNumber,
    vin,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    vehicleColour,
  });

  await prisma.statusHistory.create({
    data: {
      applicationId,
      fromStatus: null,
      toStatus: ApplicationStatus.DRAFT,
      note: "Admin created client application link.",
    },
  });

  refreshWorkflowPages();
  redirect(`/admin?application=${applicationId}`);
}

export async function createPublicApplicationIntake(
  _previousState: PublicIntakeSubmissionState,
  formData: FormData,
): Promise<PublicIntakeSubmissionState> {
  try {
    const entityType = getOwnershipEntityType(formData);
    const fullName = getRequiredString(formData, "fullName", "Full name");
    const { firstName, surname } = splitFullName(fullName);
    const passportNumber =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? getRequiredString(formData, "passportNumber", "Passport number")
        : null;
    const trnNumber =
      entityType === ClientEntityType.NON_SA_CITIZEN ? getRequiredString(formData, "trnNumber", "TRN number") : null;
    const identityNumber =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? `${passportNumber}|${trnNumber}`
        : getRequiredString(formData, "identityNumber", "ID number");
    const identityNumberForVerification = passportNumber ?? identityNumber;
    const cellphone = getRequiredString(formData, "cellphone", "Cellphone number");
    const email = getRequiredString(formData, "email", "Email address");
    const deliveryAddressLine1 = getRequiredString(formData, "deliveryAddressLine1", "Delivery address");
    const deliveryCity = getRequiredString(formData, "deliveryCity", "Delivery city");
    const deliveryPostalCode = getRequiredString(formData, "deliveryPostalCode", "Delivery postal code");
    const deliveryRequired = getDeliveryRequired(formData);
    const entityDisplayName = getOptionalString(formData, "entityDisplayName");
    const entityRegistrationNumber = getOptionalString(formData, "entityRegistrationNumber");
    const deceasedFullName = getOptionalString(formData, "deceasedFullName");
    const deceasedIdNumber = getOptionalString(formData, "deceasedIdNumber");
    const representativeFullName = getOptionalString(formData, "representativeFullName");
    const representativeCapacity = getOptionalString(formData, "representativeCapacity");
    if (entityType === ClientEntityType.COMPANY_OR_TRUST) {
      if (!entityDisplayName || !entityRegistrationNumber || !representativeFullName || !representativeCapacity) {
        throw new Error("Company or trust legal name, BRNC number, representative name, and representative role/capacity are required.");
      }
    }
    if (entityType === ClientEntityType.DECEASED_ESTATE) {
      if (!entityDisplayName || !deceasedFullName || !deceasedIdNumber || !entityRegistrationNumber || !representativeFullName || !representativeCapacity) {
        throw new Error("Deceased estate name, deceased full name, deceased ID number, executor reference number, representative name, and representative role/capacity are required.");
      }
    }
    const paymentDeliveryAddressLine1 = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryAddressLine1", "Payment delivery address line 1")
      : deliveryAddressLine1;
    const paymentDeliveryCity = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryCity", "Payment delivery city")
      : deliveryCity;
    const paymentDeliveryPostalCode = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryPostalCode", "Payment delivery postal code")
      : deliveryPostalCode;
    const registrationNumber = getRequiredString(formData, "registrationNumber", "Register");
    const vin = getOptionalString(formData, "vin");
    const vehicleMake = getOptionalString(formData, "vehicleMake");
    const vehicleModel = getOptionalString(formData, "vehicleModel");
    const selectedServiceSlug = getSelectedServiceSlug(formData);
    const isChangeOfOwnership = selectedServiceSlug === "change-of-ownership";
    const signatureDataUrl = getSignatureDataUrl(formData);
    const idPhoto = getOptionalIdPhoto(formData);
    const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [...imageUploadTypes]);
    const proofOfAddress = isChangeOfOwnership
      ? getOptionalFile(formData, "proofOfAddress", "Proof of address", [...documentUploadTypes])
      : getRequiredFile(formData, "proofOfAddress", "Proof of address", [...documentUploadTypes]);
    const trafficRegisterDocument =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? getRequiredFile(formData, "trafficRegisterDocument", "Traffic register document (TRN)", [
            ...documentUploadTypes,
          ])
        : null;
    const passportDocument =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? getRequiredFile(formData, "passportDocument", "Passport document", [
            ...documentUploadTypes,
          ])
        : null;
    const supportingDocuments = formData
      .getAll("supportingDocument")
      .filter((value): value is File => value instanceof File && value.size > 0);
    const supportingDocumentKeys = formData
      .getAll("supportingDocumentKey")
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const supportingRequirements = isChangeOfOwnership
      ? supportingRequirementsForService(entityType, selectedServiceSlug)
      : supportingRequirementsForEntityType(entityType);
    const allowedSupportingKeys = new Set(supportingRequirements.map((requirement) => requirement.key));
    if (supportingDocuments.length !== supportingDocumentKeys.length) {
      throw new Error("Each supporting document must be linked to its required document type.");
    }
    const supportingUploads = supportingDocuments.map((file, index) => {
      const requirementKey = supportingDocumentKeys[index];
      if (!allowedSupportingKeys.has(requirementKey)) {
        throw new Error("A supporting document has an invalid requirement type.");
      }

      return { file, requirementKey };
    });
    const submittedRequirementKeys = new Set([
      ...supportingUploads.map((upload) => upload.requirementKey),
      ...(trafficRegisterDocument ? ["traffic-register-document"] : []),
      ...(passportDocument ? ["passport-document"] : []),
    ]);
    const missingSupportingRequirement = supportingRequirements.find(
      (requirement) => !submittedRequirementKeys.has(requirement.key),
    );
    if (missingSupportingRequirement) {
      throw new Error(`${missingSupportingRequirement.label} is required.`);
    }
    supportingDocuments.forEach((file) => assertUploadSize(file, "Each supporting document"));
    const currentOwnerId = supportingUploads.find((upload) => upload.requirementKey === "current-owner-id")?.file ?? null;
    const identityPhotoForMandate =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? isImageFile(passportDocument)
          ? passportDocument
          : isImageFile(trafficRegisterDocument)
            ? trafficRegisterDocument
            : idPhoto
        : isImageFile(currentOwnerId)
          ? currentOwnerId
          : idPhoto;
    if (!identityPhotoForMandate && entityType !== ClientEntityType.NON_SA_CITIZEN) {
      throw new Error("An ID photo is required before submitting the mandate form.");
    }
    const identityDocumentForStorage =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? passportDocument ?? trafficRegisterDocument ?? idPhoto
        : currentOwnerId ?? identityPhotoForMandate;
    if (!identityDocumentForStorage) {
      throw new Error("A valid identity document is required before submitting the mandate form.");
    }
    getRequiredCheckbox(formData, "popiaConsent", "Personal information consent");
    const applicationId = await nextApplicationId();
    const publicToken = randomUUID();
    const identifierHash = clientIdHash(identityNumber);
    const service = await findActiveServiceBySlug(selectedServiceSlug).catch((error) => {
      console.error(`Service load for intake failed for slug "${selectedServiceSlug}":`, error);
      throw new Error("The selected service is not available right now. Please refresh the page and try again.");
    });
    const isQuoteFlowService = service.requiresQuote;
    const baseAmount = Number(service.basePrice);
    const deliveryAmount = deliveryRequired ? Number(service.deliveryFee) : 0;
    const totalAmount = (baseAmount + deliveryAmount).toFixed(2);
    const startAwaitingPayment = !isQuoteFlowService && Number(totalAmount) > 0;
    const paymentReference = `PAY-${applicationId}-Q1`;
    const requestedPaymentMethodValue = requestedPaymentMethod(formData);
    const paymentMethod =
      requestedPaymentMethodValue === PaymentMethod.PAYSTACK && isPaystackConfigured()
        ? PaymentMethod.PAYSTACK
        : PaymentMethod.EFT;
    const paymentRequest = startAwaitingPayment
      ? await buildPaymentRequest({
          applicationId,
          email,
          amount: totalAmount,
          reference: paymentReference,
          paymentMethod,
        })
      : null;
    const paymentMethodLabel = paymentMethod === PaymentMethod.PAYSTACK ? "Paystack" : "EFT";
    const initialStatus = startAwaitingPayment
      ? ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT
      : ApplicationStatus.AWAITING_ADMIN_QUOTE;
    const referralSource = getRequiredString(formData, "referralSource", "Referral source");
    const referralContact = getOptionalString(formData, "referralContact");
    const sendCompletedDocumentsToReferrer = formData.get("sendCompletedDocumentsToReferrer") === "yes";
    const client = await prisma.client.upsert({
    where: { southAfricanIdHash: identifierHash },
    update: {
      entityType,
      referralSource,
      firstName,
      surname,
      southAfricanIdEncrypted: identityNumber,
      cellphone,
      email,
      deliveryAddressLine1: paymentDeliveryAddressLine1,
      deliveryAddressLine2: deliveryRequired
        ? getOptionalString(formData, "paymentDeliveryAddressLine2")
        : getOptionalString(formData, "deliveryAddressLine2"),
      deliverySuburb: deliveryRequired
        ? getOptionalString(formData, "paymentDeliverySuburb")
        : getOptionalString(formData, "deliverySuburb"),
      deliveryCity: paymentDeliveryCity,
      deliveryProvince: deliveryRequired
        ? getOptionalString(formData, "paymentDeliveryProvince")
        : getOptionalString(formData, "deliveryProvince"),
      deliveryPostalCode: paymentDeliveryPostalCode,
      popiaConsentAcceptedAt: new Date(),
    },
    create: {
      entityType,
      referralSource,
      firstName,
      surname,
      southAfricanIdEncrypted: identityNumber,
      southAfricanIdHash: identifierHash,
      cellphone,
      email,
      deliveryAddressLine1: paymentDeliveryAddressLine1,
      deliveryAddressLine2: deliveryRequired
        ? getOptionalString(formData, "paymentDeliveryAddressLine2")
        : getOptionalString(formData, "deliveryAddressLine2"),
      deliverySuburb: deliveryRequired
        ? getOptionalString(formData, "paymentDeliverySuburb")
        : getOptionalString(formData, "deliverySuburb"),
      deliveryCity: paymentDeliveryCity,
      deliveryProvince: deliveryRequired
        ? getOptionalString(formData, "paymentDeliveryProvince")
        : getOptionalString(formData, "deliveryProvince"),
      deliveryPostalCode: paymentDeliveryPostalCode,
      popiaConsentAcceptedAt: new Date(),
    },
  });
    await createApplicationBaseRow({
      id: applicationId,
      publicToken,
      clientId: client.id,
      serviceId: service.id,
      currentStatus: initialStatus,
      registrationNumber,
      vin,
      vehicleMake,
      vehicleModel,
      referralSource,
      referralContact,
      sendCompletedDocumentsToReferrer,
      entityDisplayName,
      entityRegistrationNumber,
      deceasedFullName,
      deceasedIdNumber,
      representativeFullName,
      representativeCapacity,
    });
    await prisma.statusHistory.create({
      data: {
        applicationId,
        fromStatus: null,
        toStatus: initialStatus,
        note: startAwaitingPayment
          ? `Client submitted a fixed-price application and moved to awaiting ${paymentMethodLabel} payment. Relationship: ${getOptionalString(formData, "relation") ?? "Not supplied"}. Delivery required: ${deliveryRequired ? "Yes" : "No"}.`
          : `Client submitted an application for admin quote preparation. Relationship: ${getOptionalString(formData, "relation") ?? "Not supplied"}. Delivery required: ${deliveryRequired ? "Yes" : "No"}.`,
      },
    });
    const application: MandatePdfApplication = {
      id: applicationId,
      publicToken,
      service: {
        name: service.name,
      },
      entityDisplayName,
      entityRegistrationNumber,
      deceasedFullName,
      deceasedIdNumber,
      registrationNumber,
      vin,
      vehicleMake,
      vehicleModel,
      vehicleColour: null,
      client: {
        firstName,
        surname,
        southAfricanIdEncrypted: identityNumber,
        entityType,
      },
    };
    const adminId = await actorIdFor(UserRole.ADMIN);
    if (startAwaitingPayment) {
      await prisma.charge.create({
        data: {
          applicationId,
          description: `${service.name}${deliveryRequired && deliveryAmount > 0 ? " (including delivery)" : ""}`,
          reason: "QUOTE_V1",
          amount: totalAmount,
        },
      });

      await prisma.payment.create({
        data: {
          applicationId,
          method: paymentMethod,
          type: PaymentType.BASE_FEE,
          amount: totalAmount,
          reference: paymentReference,
          status: PaymentStatus.PENDING,
          checkoutUrl: paymentRequest?.checkoutUrl ?? null,
          providerReference: paymentRequest?.providerReference ?? null,
        },
      });
    }
    const whatsappConfirmationTemplateKey = "application_received";
    const whatsappConfirmationTemplateName = "account_creation_confirmation_3";
    const whatsappConfirmationTemplateParameters = applicationReceivedTemplateParameters(firstName, publicToken);
    const whatsappConfirmationMessage = applicationReceivedTemplateBody(firstName, applicationId, publicToken);
    const communication = await prisma.communication.create({
      data: {
        applicationId,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        status: CommunicationStatus.QUEUED,
        senderId: adminId,
        recipientName: `${firstName} ${surname}`.trim(),
        recipientAddress: cellphone,
        templateKey: whatsappConfirmationTemplateKey,
        body: whatsappConfirmationMessage,
      },
      select: {
        id: true,
        recipientAddress: true,
        body: true,
      },
    });
    await dispatchWhatsAppCommunication({
      ...communication,
      template: {
        name: whatsappConfirmationTemplateName,
        languageCode: "en_US",
        bodyParameters: whatsappConfirmationTemplateParameters,
      },
    });
    const savedIdPhoto = await saveMandateIdPhoto(applicationId, identityDocumentForStorage);
    await saveMandateIdPhotoDocument(applicationId, identityDocumentForStorage, savedIdPhoto);

    await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
    if (proofOfAddress) {
      await saveUploadedDocument(applicationId, proofOfAddress, DocumentType.PROOF_OF_ADDRESS, "client-documents");
    }
    const mandatorySupportingUploads = [
      trafficRegisterDocument ? { file: trafficRegisterDocument, requirementKey: "traffic-register-document" } : null,
      passportDocument ? { file: passportDocument, requirementKey: "passport-document" } : null,
    ].filter((upload): upload is { file: File; requirementKey: string } => upload !== null);
    const mandatorySupportingDocuments = mandatorySupportingUploads.map((upload) => upload.file);
    await saveAdditionalSupportingDocuments(applicationId, [...mandatorySupportingUploads, ...supportingUploads]);
    await maybeVerifyUploadedDocumentsWithAi({
      applicationId,
      registrationNumber,
      identityNumber: identityNumberForVerification,
      entityDisplayName,
      entityRegistrationNumber,
      files: [idPhoto, licenceDiskPhoto, proofOfAddress, ...mandatorySupportingDocuments, ...supportingDocuments].filter(
        (file): file is File => file instanceof File && file.size > 0,
      ),
    });
    await writeMandatePdf(
      {
        ...application,
        entityDisplayName,
      },
      signatureDataUrl,
      identityPhotoForMandate ? Buffer.from(await identityPhotoForMandate.arrayBuffer()) : undefined,
      identityPhotoForMandate?.type,
    );
    await prisma.mandateFormSubmission.create({
    data: {
      applicationId,
      signatureDataUrl,
      idPhotoFileName: identityDocumentForStorage.name || savedIdPhoto.fileName,
      idPhotoMimeType: identityDocumentForStorage.type || "application/octet-stream",
      idPhotoSizeBytes: identityDocumentForStorage.size,
      idPhotoStorageKey: savedIdPhoto.storageKey,
    },
    });

    refreshWorkflowPages();
    revalidatePath("/apply");
    return {
      status: "success",
      message: "",
      redirectTo: `/apply/submitted?application=${encodeURIComponent(applicationId)}`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error && error.message.length > 0 ? error.message : "Unable to submit application.";
    return {
      status: "error",
      message,
    };
  }
}

function getDeliveryRequired(formData: FormData) {
  const value = formData.get("deliveryRequired");

  if (value === "yes") {
    return true;
  }

  if (value === "no") {
    return false;
  }

  throw new Error("Delivery selection is required.");
}

function getRequiredMoneyAmount(formData: FormData, fieldName: string, label: string) {
  const value = getRequiredString(formData, fieldName, label);
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a valid amount greater than zero.`);
  }

  return amount.toFixed(2);
}

function paymentUploadLink(applicationId: string) {
  return `${appBaseUrl()}/apply/submitted?application=${encodeURIComponent(applicationId)}`;
}

function clientStatusLink(publicToken: string) {
  return `${appBaseUrl()}/client/${encodeURIComponent(publicToken)}`;
}

function orderUpdateTemplateParameters(firstName: string, applicationId: string, publicToken: string) {
  return [
    { type: "text", text: firstName },
    { type: "text", text: applicationId },
    { type: "text", text: clientStatusLink(publicToken) },
  ] as const;
}

function applicationReceivedTemplateParameters(firstName: string, publicToken: string) {
  return [
    { type: "text", text: firstName },
    { type: "text", text: clientStatusLink(publicToken) },
  ] as const;
}

function applicationReceivedTemplateBody(firstName: string, applicationId: string, publicToken: string) {
  void applicationId;
  return `Hi ${firstName},\n\nYour new application has been created successfully.\n\nPlease view ${clientStatusLink(publicToken)} for any update.`;
}

function orderUpdateTemplateBody(firstName: string, applicationId: string, publicToken: string) {
  return `Hello ${firstName},\n\nWe updated your order ${applicationId}. Please view your tracking page for an update: ${clientStatusLink(publicToken)}.\n\nThank you for supporting us!`;
}

function withClientStatusLink(body: string, publicToken: string) {
  const link = clientStatusLink(publicToken);

  if (body.includes(link)) {
    return body;
  }

  return `${body.trim()}\n\nTrack your application here: ${link}`;
}

function requestedPaymentMethod(formData: FormData) {
  const value = getOptionalString(formData, "paymentMethod");

  if (value === PaymentMethod.PAYSTACK) {
    return PaymentMethod.PAYSTACK;
  }

  return PaymentMethod.EFT;
}

async function buildPaymentRequest(options: {
  applicationId: string;
  email: string;
  amount: string;
  reference: string;
  paymentMethod?: PaymentMethod;
}) {
  const method = options.paymentMethod ?? PaymentMethod.EFT;

  if (method !== PaymentMethod.PAYSTACK || !isPaystackConfigured()) {
    return {
      method,
      checkoutUrl: null as string | null,
      providerReference: null as string | null,
    };
  }

  const baseUrl = await requestBaseUrl();
  const initialized = await initializePaystackTransaction({
    amount: options.amount,
    email: options.email,
    reference: options.reference,
    callbackUrl: paystackCallbackUrl(options.applicationId, baseUrl),
    metadata: {
      applicationId: options.applicationId,
      paymentReference: options.reference,
    },
    channels: ["card", "bank_transfer", "eft"],
  });

  return {
    method,
    checkoutUrl: initialized.authorizationUrl,
    providerReference: initialized.accessCode,
  };
}

export async function switchPendingPaymentToPaystack(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const publicToken = getRequiredString(formData, "publicToken", "Public token");

  if (!isPaystackConfigured()) {
    throw new Error("Paystack is not configured.");
  }

  const application = await prisma.application.findFirstOrThrow({
    where: {
      id: applicationId,
      publicToken,
    },
    select: {
      client: {
        select: {
          email: true,
        },
      },
      payments: {
        where: { status: PaymentStatus.PENDING },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
        },
      },
    },
  });
  const payment = application.payments[0];

  if (!payment) {
    throw new Error("No pending payment was found.");
  }

  if (payment.method !== PaymentMethod.EFT) {
    throw new Error("This payment is already set to Paystack.");
  }

  const paymentRequest = await buildPaymentRequest({
    applicationId,
    email: application.client.email,
    amount: payment.amount.toString(),
    reference: payment.reference,
    paymentMethod: PaymentMethod.PAYSTACK,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      method: PaymentMethod.PAYSTACK,
      checkoutUrl: paymentRequest.checkoutUrl,
      providerReference: paymentRequest.providerReference,
    },
  });

  refreshWorkflowPages();
  redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}`);
}

export async function publishAdminQuote(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const amount = getRequiredMoneyAmount(formData, "quoteAmount", "Quote amount");
  const description =
    getOptionalString(formData, "quoteDescription") || "License fee quote prepared by admin.";
  const adminId = await actorIdFor(UserRole.ADMIN);

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      currentStatus: true,
      publicToken: true,
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
      charges: {
        select: {
          id: true,
        },
      },
    },
  });

  if (
    application.currentStatus === ApplicationStatus.CANCELLED ||
    application.currentStatus === ApplicationStatus.DISPATCHED
  ) {
    throw new Error("Cannot publish a quote for a closed application.");
  }

  const quoteVersion = application.charges.length + 1;

  await prisma.charge.create({
    data: {
      applicationId,
      description,
      reason: `QUOTE_V${quoteVersion}`,
      amount,
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.QUOTE_PENDING_CLIENT_APPROVAL, {
    actorId: adminId,
    note: `Admin published quote version ${quoteVersion} for client approval.`,
    data: {
      quoteVersion,
      quotedAt: new Date(),
      quoteApprovedAt: null,
    },
  });

  const quoteApprovalTemplateName = "order_update";
  const quoteApprovalTemplateParameters = orderUpdateTemplateParameters(
    application.client.firstName,
    applicationId,
    application.publicToken,
  );

  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: quoteApprovalTemplateName,
      body: orderUpdateTemplateBody(application.client.firstName, applicationId, application.publicToken),
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  await dispatchWhatsAppCommunication({
    ...communication,
    template: {
      name: quoteApprovalTemplateName,
      languageCode: "en_US",
      bodyParameters: quoteApprovalTemplateParameters,
    },
  });

  refreshWorkflowPages();
  revalidatePath("/admin");
}

export async function raiseAdditionalCharge(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const amount = getRequiredMoneyAmount(formData, "chargeAmount", "Charge amount");
  const description = getRequiredString(formData, "chargeDescription", "Charge description");
  const adminId = await actorIdFor(UserRole.ADMIN);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      currentStatus: true,
      previousStatus: true,
      publicToken: true,
      charges: {
        select: {
          id: true,
        },
      },
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
          email: true,
        },
      },
    },
  });

  if (application.currentStatus === ApplicationStatus.CANCELLED || application.currentStatus === ApplicationStatus.DISPATCHED) {
    throw new Error("Cannot add a charge to a closed application.");
  }

  const chargeVersion = application.charges.length + 1;
  const paymentReference = `PAY-${applicationId}-A${chargeVersion}-${Date.now()}`;
  const paymentMethod = requestedPaymentMethod(formData);
  const paymentRequest = await buildPaymentRequest({
    applicationId,
    email: application.client.email,
    amount,
    reference: paymentReference,
    paymentMethod,
  });

  const charge = await prisma.charge.create({
    data: {
      applicationId,
      description,
      reason: `ADDITIONAL_CHARGE_V${chargeVersion}`,
      amount,
    },
  });

  await prisma.payment.create({
    data: {
      applicationId,
      chargeId: charge.id,
      type: PaymentType.ADDITIONAL_CHARGE,
      method: paymentMethod,
      status: PaymentStatus.PENDING,
      amount,
      reference: paymentReference,
      checkoutUrl: paymentRequest.checkoutUrl,
      providerReference: paymentRequest.providerReference,
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.ADDITIONAL_CHARGE_RAISED, {
    actorId: adminId,
    note: `Admin raised additional charge version ${chargeVersion}: ${description}.`,
    data: {
      popDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastPopReminderAt: null,
      popReminderCount: 0,
      autoCancelOnNoPop: true,
    },
  });

  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "additional-charge-ready",
      body: withClientStatusLink(
        paymentMethod === PaymentMethod.PAYSTACK
          ? `Hi ${application.client.firstName}, an additional charge has been added to application ${applicationId}. Please review the details and complete payment here: ${paymentUploadLink(applicationId)}.`
          : `Hi ${application.client.firstName}, an additional charge has been added to application ${applicationId}. Please review the details and upload your proof of payment here: ${paymentUploadLink(applicationId)}.`,
        application.publicToken,
      ),
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  await dispatchWhatsAppCommunication(communication);

  refreshWorkflowPages();
  revalidatePath("/admin");
  revalidatePath(`/apply/submitted?application=${applicationId}`);
}

export async function approveClientQuote(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const publicToken = getRequiredString(formData, "publicToken", "Public token");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      publicToken: true,
      currentStatus: true,
      client: {
        select: {
          email: true,
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
      charges: {
        where: { status: "PENDING" },
        select: {
          id: true,
          status: true,
          amount: true,
        },
      },
    },
  });

  if (application.publicToken !== publicToken) {
    throw new Error("Invalid quote approval token.");
  }

  if (application.currentStatus !== ApplicationStatus.QUOTE_PENDING_CLIENT_APPROVAL) {
    throw new Error("This quote is not currently awaiting client approval.");
  }

  const pendingCharges = application.charges.filter((charge) => charge.status === "PENDING");

  if (pendingCharges.length === 0) {
    throw new Error("No pending quote charges found for this application.");
  }

  const total = pendingCharges.reduce((sum, charge) => sum + Number(charge.amount.toString()), 0);
  const paymentReference = `PAY-${applicationId}-Q1`;
  const paymentMethod = requestedPaymentMethod(formData);
  const paymentRequest = await buildPaymentRequest({
    applicationId,
    email: application.client.email,
    amount: total.toFixed(2),
    reference: paymentReference,
    paymentMethod,
  });

  await prisma.payment.create({
    data: {
      applicationId,
      type: PaymentType.BASE_FEE,
      method: paymentMethod,
      status: PaymentStatus.PENDING,
      amount: total.toFixed(2),
      reference: paymentReference,
      checkoutUrl: paymentRequest.checkoutUrl,
      providerReference: paymentRequest.providerReference,
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT, {
    note: "Client approved quote and payment request was created.",
    data: {
      quoteApprovedAt: new Date(),
      popDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lastPopReminderAt: null,
      popReminderCount: 0,
      autoCancelOnNoPop: true,
    },
  });

  const applicationWithClient = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      publicToken: true,
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
    },
  });
  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: await actorIdFor(UserRole.ADMIN),
      recipientName: `${applicationWithClient.client.firstName} ${applicationWithClient.client.surname}`,
      recipientAddress: applicationWithClient.client.cellphone,
      templateKey: "payment-pop-upload-link",
      body: withClientStatusLink(
        paymentMethod === PaymentMethod.PAYSTACK
          ? `Hi ${applicationWithClient.client.firstName}, your payment request for application ${applicationId} is ready. Complete payment here: ${paymentUploadLink(applicationId)}.`
          : `Hi ${applicationWithClient.client.firstName}, your payment for application ${applicationId} is ready. Please upload your proof of payment here: ${paymentUploadLink(applicationId)}.`,
        application.publicToken,
      ),
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  await dispatchWhatsAppCommunication(communication);

  refreshWorkflowPages();
  revalidatePath(`/apply/submitted?application=${applicationId}`);
  redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}`);
}

export async function confirmEftPayment(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      currentStatus: true,
      previousStatus: true,
      payments: {
        where: {
          method: "EFT",
          status: PaymentStatus.PENDING,
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (application.currentStatus !== ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT) {
    throw new Error("Quote must be approved by the client before EFT confirmation.");
  }

  if (application.payments.length === 0) {
    throw new Error("No pending EFT payment was found for this application.");
  }

  const nextStatus = nextStatusAfterPaymentConfirmation(application);

  if (!nextStatus) {
    throw new Error("This payment cannot be confirmed in the current application state.");
  }

  await prisma.payment.updateMany({
    where: {
      applicationId,
      method: "EFT",
      status: PaymentStatus.PENDING,
    },
    data: {
      status: PaymentStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  const confirmedPayments = await prisma.payment.findMany({
    where: {
      applicationId,
      method: "EFT",
      status: PaymentStatus.CONFIRMED,
    },
    select: {
      applicationId: true,
      chargeId: true,
      status: true,
    },
  });

  for (const payment of confirmedPayments) {
    await markChargesPaidForConfirmedPayment(payment);
  }

  await transitionApplication(applicationId, nextStatus, {
    actorId: adminId,
    note:
      nextStatus === ApplicationStatus.PENDING_REVIEW
        ? "Admin confirmed EFT payment."
        : "Admin confirmed additional charge payment.",
  });

  refreshWorkflowPages();
}

export async function uploadEftProof(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const eftProof = getRequiredFile(formData, "eftProof", "Proof of EFT payment", [
    ...documentUploadTypes,
  ]);

  await saveUploadedDocument(applicationId, eftProof, DocumentType.PROOF_OF_EFT_PAYMENT, "client-documents");
  await appendStatusHistoryNote(applicationId, null, "Client uploaded proof of EFT payment.");

  refreshWorkflowPages();
  revalidatePath(`/apply/submitted?application=${applicationId}`);
  redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}&eftUploaded=1`);
}

export async function uploadSupplierReturnEvidence(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const supplierId = await actorIdFor(UserRole.SUPPLIER);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { currentStatus: true },
  });

  if (application.currentStatus !== ApplicationStatus.SUPPLIER_PRODUCED) {
    return {
      status: "error",
      message: "Produced document evidence can only be uploaded once the document is marked as produced.",
    } as const;
  }

  try {
    const producedDocumentPhoto = getRequiredFile(formData, "producedDocumentPhoto", "Produced document photo", [
      ...imageUploadTypes,
    ]);
    const barcodePhoto = getRequiredFile(formData, "barcodePhoto", "Barcode photo", [...imageUploadTypes]);

    await saveSupplierReturnEvidenceDocument(
      applicationId,
      producedDocumentPhoto,
      supplierReturnEvidenceRequirementKeys.producedDocumentPhoto,
    );
    await saveSupplierReturnEvidenceDocument(
      applicationId,
      barcodePhoto,
      supplierReturnEvidenceRequirementKeys.barcodePhoto,
    );

    await appendStatusHistoryNote(applicationId, supplierId, "Supplier uploaded produced document and barcode photos before returning the order.");

    refreshWorkflowPages();
    revalidatePath("/supplier");

    return {
      status: "success",
      message: "Produced document evidence uploaded.",
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload produced document evidence.";

    return {
      status: "error",
      message,
    } as const;
  }
}

export async function requestResubmission(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const documentIds = formData.getAll("documentId").filter((value): value is string => typeof value === "string");
  const whatsappMessage = formData.get("whatsappMessage");
  const adminComment = formData.get("adminComment");

  if (documentIds.length === 0) {
    throw new Error("At least one document must be selected for resubmission.");
  }

  if (typeof whatsappMessage !== "string" || whatsappMessage.trim().length === 0) {
    throw new Error("WhatsApp message is required.");
  }

  await Promise.all(
    documentIds.map((documentId) => {
      const reason = formData.get(`reason:${documentId}`);

      if (typeof reason !== "string" || reason.trim().length === 0) {
        throw new Error("Each selected document needs a resubmission reason.");
      }

      return prisma.document.update({
        where: { id: documentId },
        data: {
          status: "REJECTED",
          rejectionReason: reason.trim(),
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
    }),
  );

  const selectedDocuments = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    select: {
      id: true,
      type: true,
      fileName: true,
    },
  });

  const selectedDocumentLabels = documentIds
    .map((documentId) => {
      const document = selectedDocuments.find((item) => item.id === documentId);
      return document ? documentLabel(document.type, document.fileName) : null;
    })
    .filter((label): label is string => typeof label === "string");

  const commentText = typeof adminComment === "string" ? adminComment.trim() : "";
  const resubmissionNote = [
    `Admin requested resubmission for ${selectedDocumentLabels.length} document(s): ${selectedDocumentLabels.join(", ")}.`,
    ...documentIds.map((documentId) => {
      const reason = formData.get(`reason:${documentId}`);
      const document = selectedDocuments.find((item) => item.id === documentId);
      const label = document ? documentLabel(document.type, document.fileName) : "Document";
      const reasonText = typeof reason === "string" ? reason.trim() : "";

      return reasonText ? `${label}: ${reasonText}` : label;
    }),
    commentText ? `Comment: ${commentText}` : null,
  ]
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .join(" ");

  await transitionApplication(applicationId, ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED, {
    actorId: adminId,
    note: resubmissionNote,
  });

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      publicToken: true,
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
    },
  });

  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "documents-resubmission-request",
      body: withClientStatusLink(whatsappMessage.trim(), application.publicToken),
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  await dispatchWhatsAppCommunication(communication);

  refreshWorkflowPages();
}

async function restoreReviewAfterDocumentRecovery(applicationId: string, adminId: string | null) {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      service: {
        select: {
          slug: true,
        },
      },
      currentStatus: true,
      client: {
        select: {
          entityType: true,
        },
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: {
          id: true,
          type: true,
          status: true,
          version: true,
          requirementKey: true,
          fileName: true,
          storageKey: true,
        },
      },
    },
  });

  if (application.currentStatus !== ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED) {
    return;
  }

  const incompleteRequirement = documentRequirementsForApplication(application.service.slug, application.client.entityType)
    .filter((requirement) => requirement.confirmedForUpload)
    .find((requirement) => {
      if (!requirement.documentType) {
        const supportingDocument = supportingDocumentForRequirement(
          requirement.key,
          application.client.entityType,
          application.documents,
        );
        return !supportingDocument || supportingDocument.status !== DocumentStatus.ACCEPTED;
      }

      const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

      return !latestDocument || latestDocument.status !== DocumentStatus.ACCEPTED;
    });

  if (incompleteRequirement) {
    return;
  }

  await transitionApplication(applicationId, ApplicationStatus.PENDING_REVIEW, {
    actorId: adminId,
    note: "All resubmitted documents are accepted. Application returned to review.",
  });
}

export async function acceptDocument(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const documentId = getRequiredString(formData, "documentId", "Document");
  const adminId = await actorIdFor(UserRole.ADMIN);
  const documentAuditLabel = await auditLabelForDocument(applicationId, documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.ACCEPTED,
      rejectionReason: null,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });

  await appendStatusHistoryNote(applicationId, adminId, `Admin accepted ${documentAuditLabel} during review.`);
  await restoreReviewAfterDocumentRecovery(applicationId, adminId);

  refreshWorkflowPages();
  revalidatePath(`/admin?application=${applicationId}`);
}

export async function markDocumentPending(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const documentId = getRequiredString(formData, "documentId", "Document");
  const adminId = await actorIdFor(UserRole.ADMIN);
  const documentAuditLabel = await auditLabelForDocument(applicationId, documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.PENDING,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    },
  });

  await appendStatusHistoryNote(applicationId, adminId, `Admin moved ${documentAuditLabel} back to pending.`);

  refreshWorkflowPages();
  revalidatePath(`/admin?application=${applicationId}`);
}

export async function acceptAllPendingDocuments(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);

  const pendingDocuments = await prisma.document.findMany({
    where: {
      applicationId,
      status: DocumentStatus.PENDING,
    },
    select: { id: true },
  });

  if (pendingDocuments.length === 0) {
    throw new Error("No pending documents are available for bulk acceptance.");
  }

  const reviewedAt = new Date();
  await prisma.document.updateMany({
    where: {
      id: {
        in: pendingDocuments.map((document) => document.id),
      },
    },
    data: {
      status: DocumentStatus.ACCEPTED,
      rejectionReason: null,
      reviewedById: adminId,
      reviewedAt,
    },
  });

  await appendStatusHistoryNote(
    applicationId,
    adminId,
    `Admin bulk-accepted ${pendingDocuments.length} pending document(s) during review.`,
  );
  await restoreReviewAfterDocumentRecovery(applicationId, adminId);

  refreshWorkflowPages();
  revalidatePath(`/admin?application=${applicationId}`);
}

export async function adminUploadDocument(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const documentSelection = getRequiredString(formData, "documentType", "Document type");
  const [documentTypeValue, requirementKey] = documentSelection.split(":", 2);
  const documentType = documentTypeValue as DocumentType;
  const file = formData.get("documentFile");
  const proofDocumentDateValue = getOptionalString(formData, "proofDocumentDate");
  const adminId = await actorIdFor(UserRole.ADMIN);

  try {
    if (!Object.values(DocumentType).includes(documentType)) {
      throw new Error("Select a valid document type.");
    }

    if (requirementKey) {
      const application = await prisma.application.findUniqueOrThrow({
        where: { id: applicationId },
        select: { client: { select: { entityType: true } } },
      });
      const validRequirement = supportingRequirementsForEntityType(application.client.entityType).some(
        (requirement) => requirement.key === requirementKey,
      );
      if (documentType !== DocumentType.OTHER || !validRequirement) {
        throw new Error("Select a valid supporting document type.");
      }
    }

    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a file to upload.");
    }

    const proofDocumentDate =
      documentType === DocumentType.PROOF_OF_ADDRESS && proofDocumentDateValue ? getProofDocumentDate(formData) : undefined;

    await saveAdminUploadedDocument(applicationId, file, documentType, "admin-documents", proofDocumentDate, requirementKey);

    await appendStatusHistoryNote(
      applicationId,
      adminId,
      `Admin uploaded ${documentLabel(documentType, file.name)} on behalf of the client.`,
    );
    await restoreReviewAfterDocumentRecovery(applicationId, adminId);

    refreshWorkflowPages();
    revalidatePath(`/admin?application=${applicationId}`);

    return {
      status: "success",
      message: `Uploaded ${documentLabel(documentType, file.name)}.`,
    } as const;
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unable to upload document.";
    return {
      status: "error",
      message,
    } as const;
  }
}

export async function rejectDocument(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const documentId = getRequiredString(formData, "documentId", "Document");
  const rejectionReason = getRequiredString(formData, "rejectionReason", "Rejection reason");
  const adminId = await actorIdFor(UserRole.ADMIN);
  const documentAuditLabel = await auditLabelForDocument(applicationId, documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: DocumentStatus.REJECTED,
      rejectionReason,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED, {
    actorId: adminId,
    note: `Admin rejected ${documentAuditLabel} during review and requested resubmission.`,
  });

  refreshWorkflowPages();
  revalidatePath(`/admin?application=${applicationId}`);
}

export async function updateSupplierHandoff(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminName = "The License Hub Admin";
  const supplierUrgency = getSupplierUrgency(formData);
  const comment = getOptionalString(formData, "orderComment");

  await prisma.application.update({
    where: { id: applicationId },
    data: { supplierUrgency },
    select: { id: true },
  });
  await createOrderComment(applicationId, OrderCommentSource.ADMIN, adminName, comment);

  refreshWorkflowPages();
}

export async function addSupplierOrderComment(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const comment = getRequiredString(formData, "orderComment", "Supplier feedback");

  await createOrderComment(applicationId, OrderCommentSource.SUPPLIER, "Supplier", comment);

  refreshWorkflowPages();
}

export async function approveToSupplier(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      entityDisplayName: true,
      entityRegistrationNumber: true,
      deceasedFullName: true,
      deceasedIdNumber: true,
      representativeFullName: true,
      representativeCapacity: true,
      service: {
        select: {
          slug: true,
        },
      },
      client: {
        select: {
          entityType: true,
        },
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: {
          id: true,
          type: true,
          status: true,
          version: true,
          requirementKey: true,
          fileName: true,
          storageKey: true,
        },
      },
      mandateFormSubmission: {
        select: {
          id: true,
        },
      },
    },
  });
  if (
    application.client.entityType === ClientEntityType.DECEASED_ESTATE &&
    (!application.entityDisplayName ||
      !application.entityRegistrationNumber ||
      !application.deceasedFullName ||
      !application.deceasedIdNumber ||
      !application.representativeFullName ||
      !application.representativeCapacity)
  ) {
    throw new Error("Deceased estate, executor, and representative details must be captured before approval.");
  }

  if (
    application.client.entityType === ClientEntityType.COMPANY_OR_TRUST &&
    (!application.entityDisplayName ||
      !application.entityRegistrationNumber ||
      !application.representativeFullName ||
      !application.representativeCapacity)
  ) {
    throw new Error("Company and representative details must be captured before approval.");
  }

  const incompleteRequirement = documentRequirementsForApplication(application.service.slug, application.client.entityType)
    .filter((requirement) => requirement.confirmedForUpload)
    .find((requirement) => {
      if (!requirement.documentType) {
        const supportingDocument = supportingDocumentForRequirement(
          requirement.key,
          application.client.entityType,
          application.documents,
        );
        return !supportingDocument || supportingDocument.status !== DocumentStatus.ACCEPTED;
      }

      const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

      return !latestDocument || latestDocument.status !== DocumentStatus.ACCEPTED;
    });

  if (incompleteRequirement) {
    throw new Error(`${incompleteRequirement.label} must be uploaded and accepted before approval.`);
  }

  const supplierDocuments = application.documents.filter(
    (document) =>
      document.status === DocumentStatus.ACCEPTED && document.type !== DocumentType.PROOF_OF_EFT_PAYMENT,
  );

  for (const document of supplierDocuments) {
    try {
      await access(storageKeyPath(document.storageKey));
    } catch {
      throw new Error(
        `${documentLabel(document.type, document.fileName)} is missing from storage. Re-upload it before sending this application to the supplier.`,
      );
    }
  }

  await transitionApplication(applicationId, ApplicationStatus.AT_SUPPLIER, {
    actorId: adminId,
    note: "Admin approved application and sent it to supplier.",
    data: {
      approvedAt: new Date(),
    },
  });

  refreshWorkflowPages();
}

export async function markDocumentReturned(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);

  await transitionApplication(applicationId, ApplicationStatus.DOCUMENT_RETURNED, {
    actorId: adminId,
    note: "Admin confirmed the physical document returned to The License Hub.",
  });

  refreshWorkflowPages();
}

export async function markDispatched(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const now = new Date();
  const retentionSetting = await prisma.retentionSetting.findUnique({
    where: { id: "default" },
  });

  await prisma.dispatch.upsert({
    where: { applicationId },
    update: {
      courierName: "Manual courier",
      trackingNumber: `TRACK-${applicationId}`,
      dispatchedAt: now,
    },
    create: {
      applicationId,
      courierName: "Manual courier",
      trackingNumber: `TRACK-${applicationId}`,
      dispatchedAt: now,
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.DISPATCHED, {
    actorId: adminId,
    note: "Admin captured dispatch details and completed the workflow.",
    data: {
      completedAt: now,
      retentionEligibleAt: calculateRetentionEligibleAt(
        ApplicationStatus.DISPATCHED,
        retentionSetting?.daysAfterCompletion,
        now,
      ),
    },
  });

  refreshWorkflowPages();
}

export async function cancelApplication(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const cancelledAt = new Date();
  const retentionSetting = await prisma.retentionSetting.findUnique({
    where: { id: "default" },
  });

  await transitionApplication(applicationId, ApplicationStatus.CANCELLED, {
    actorId: adminId,
    note: "Admin cancelled the application.",
    data: {
      cancelledAt,
      retentionEligibleAt: calculateRetentionEligibleAt(
        ApplicationStatus.CANCELLED,
        retentionSetting?.daysAfterCompletion,
        cancelledAt,
      ),
    },
  });

  refreshWorkflowPages();
}

export async function deleteApplication(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const confirmed = formData.get("confirmed") === "true";

  if (!confirmed) {
    throw new Error("Please confirm the deletion checkbox before proceeding.");
  }

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      id: true,
      clientId: true,
      documents: {
        select: { storageKey: true },
      },
      mandateFormSubmission: {
        select: { idPhotoStorageKey: true },
      },
    },
  });

  const storagePaths = storagePathsForApplication(
    application.id,
    application.documents.map((document) => document.storageKey),
    application.mandateFormSubmission?.idPhotoStorageKey ?? null,
  );
  const queuedAt = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.retentionPurge.upsert({
      where: { applicationId: application.id },
      update: {
        clientId: application.clientId,
        storagePaths,
        databaseDeletedAt: queuedAt,
        lastError: null,
      },
      create: {
        applicationId: application.id,
        clientId: application.clientId,
        storagePaths,
        databaseDeletedAt: queuedAt,
      },
    });

    await transaction.auditLog.deleteMany({ where: { applicationId: application.id } });
    const deletedApplication = await transaction.application.deleteMany({
      where: { id: application.id },
    });

    if (deletedApplication.count !== 1) {
      throw new Error("Application could not be deleted.");
    }

    await transaction.client.deleteMany({
      where: {
        id: application.clientId,
        applications: { none: {} },
      },
    });
  });

  const queuedRecord = await prisma.retentionPurge.findUniqueOrThrow({
    where: { applicationId: application.id },
    select: { id: true, applicationId: true, storagePaths: true },
  });

  await deleteQueuedFiles(queuedRecord);

  refreshWorkflowPages();
}

export async function sendClientMessage(
  _previousState: { status: string; message: string; sentAt: number } | null,
  formData: FormData,
) {
  const applicationId = getApplicationId(formData);
  const body = formData.get("body");
  const templateKey = formData.get("templateKey");
  const adminId = await actorIdFor(UserRole.ADMIN);

  if (typeof body !== "string" || body.trim().length === 0) {
    throw new Error("Message body is required.");
  }

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      publicToken: true,
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
    },
  });

  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey:
        templateKey === "application_received" || templateKey === "order_update"
          ? templateKey
          : "manual-admin-message",
      body:
        templateKey === "application_received"
          ? applicationReceivedTemplateBody(application.client.firstName, applicationId, application.publicToken)
          : templateKey === "order_update"
            ? orderUpdateTemplateBody(application.client.firstName, applicationId, application.publicToken)
            : withClientStatusLink(body.trim(), application.publicToken),
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  const approvedTemplateKey =
    templateKey === "application_received" || templateKey === "order_update" ? templateKey : null;

  await dispatchWhatsAppCommunication({
    ...communication,
    ...(approvedTemplateKey
      ? {
          template: {
            name:
              approvedTemplateKey === "application_received"
                ? "account_creation_confirmation_3"
                : approvedTemplateKey,
            languageCode: "en_US",
            bodyParameters:
              approvedTemplateKey === "application_received"
                ? applicationReceivedTemplateParameters(application.client.firstName, application.publicToken)
                : orderUpdateTemplateParameters(
                    application.client.firstName,
                    applicationId,
                    application.publicToken,
                  ),
          },
        }
      : {}),
  });

  refreshWorkflowPages();

  return {
    status: "success" as const,
    message: "WhatsApp sent.",
    sentAt: Date.now(),
  };
}

export async function resendClientStatusLink(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      publicToken: true,
      client: {
        select: {
          firstName: true,
          surname: true,
          cellphone: true,
        },
      },
    },
  });

  const communication = await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "client-status-link-resend",
      body: `Hi ${application.client.firstName}, here is your status link for application ${applicationId}: ${clientStatusLink(application.publicToken)}`,
    },
    select: {
      id: true,
      recipientAddress: true,
      body: true,
    },
  });
  await dispatchWhatsAppCommunication(communication);

  refreshWorkflowPages();
}

export async function submitMandateFormCapture(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const signatureDataUrl = getSignatureDataUrl(formData);
  const idPhoto = getIdPhoto(formData);
  const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [...imageUploadTypes]);
  const proofOfAddress = getRequiredFile(formData, "proofOfAddress", "Proof of address", [
    ...documentUploadTypes,
  ]);
  const proofDocumentDate = getProofDocumentDate(formData);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: mandatePdfApplicationSelect,
  });

  const savedIdPhoto = await saveMandateIdPhoto(applicationId, idPhoto);
  await saveMandateIdPhotoDocument(applicationId, idPhoto, savedIdPhoto);
  await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
  await saveUploadedDocument(
    applicationId,
    proofOfAddress,
    DocumentType.PROOF_OF_ADDRESS,
    "client-documents",
    proofDocumentDate,
  );

  await writeMandatePdf(
    application,
    signatureDataUrl,
    savedIdPhoto.idPhotoBytes,
    idPhoto.type,
  );

  await prisma.mandateFormSubmission.upsert({
    where: { applicationId },
    update: {
      signatureDataUrl,
      idPhotoFileName: idPhoto.name || savedIdPhoto.fileName,
      idPhotoMimeType: idPhoto.type,
      idPhotoSizeBytes: idPhoto.size,
      idPhotoStorageKey: savedIdPhoto.storageKey,
      submittedAt: new Date(),
    },
    create: {
      applicationId,
      signatureDataUrl,
      idPhotoFileName: idPhoto.name || savedIdPhoto.fileName,
      idPhotoMimeType: idPhoto.type,
      idPhotoSizeBytes: idPhoto.size,
      idPhotoStorageKey: savedIdPhoto.storageKey,
    },
  });

  revalidatePath(`/client/${application.publicToken}`);
  refreshWorkflowPages();
}

export async function resubmitSupportingDocuments(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const idPhoto = getIdPhoto(formData);
  const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [...imageUploadTypes]);
  const proofOfAddress = getRequiredFile(formData, "proofOfAddress", "Proof of address", [
    ...documentUploadTypes,
  ]);
  const proofDocumentDate = getProofDocumentDate(formData);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      ...mandatePdfApplicationSelect,
      mandateFormSubmission: {
        select: {
          signatureDataUrl: true,
        },
      },
    },
  });
  const supportingDocuments = formData
    .getAll("supportingDocument")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const supportingDocumentKeys = formData
    .getAll("supportingDocumentKey")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const supportingRequirements = supportingRequirementsForEntityType(application.client.entityType);
  const allowedSupportingKeys = new Set(supportingRequirements.map((requirement) => requirement.key));
  if (supportingDocuments.length !== supportingDocumentKeys.length) {
    throw new Error("Each supporting document must be linked to its required document type.");
  }
  const supportingUploads = supportingDocuments.map((file, index) => {
    const requirementKey = supportingDocumentKeys[index];
    if (!allowedSupportingKeys.has(requirementKey)) {
      throw new Error("A supporting document has an invalid requirement type.");
    }
    assertUploadSize(file, "Each supporting document");
    return { file, requirementKey };
  });
  const missingSupportingRequirement = supportingRequirements.find(
    (requirement) => !supportingUploads.some((upload) => upload.requirementKey === requirement.key),
  );
  if (missingSupportingRequirement) {
    throw new Error(`${missingSupportingRequirement.label} is required.`);
  }
  const savedIdPhoto = await saveMandateIdPhoto(applicationId, idPhoto);
  await saveMandateIdPhotoDocument(applicationId, idPhoto, savedIdPhoto);

  await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
  await saveUploadedDocument(
    applicationId,
    proofOfAddress,
    DocumentType.PROOF_OF_ADDRESS,
    "client-documents",
    proofDocumentDate,
  );
  await saveAdditionalSupportingDocuments(applicationId, supportingUploads);

  if (!application.mandateFormSubmission) {
    throw new Error("Mandate form must be submitted before supporting documents can be replaced.");
  }

  await prisma.mandateFormSubmission.update({
    where: { applicationId },
    data: {
      idPhotoFileName: idPhoto.name || savedIdPhoto.fileName,
      idPhotoMimeType: idPhoto.type,
      idPhotoSizeBytes: idPhoto.size,
      idPhotoStorageKey: savedIdPhoto.storageKey,
      submittedAt: new Date(),
    },
  });
  await writeMandatePdf(
    application,
    application.mandateFormSubmission.signatureDataUrl,
    savedIdPhoto.idPhotoBytes,
    idPhoto.type,
  );

  revalidatePath(`/client/${application.publicToken}`);
  refreshWorkflowPages();
}

export async function resubmitMandateSignature(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const signatureDataUrl = getSignatureDataUrl(formData);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      ...mandatePdfApplicationSelect,
      mandateFormSubmission: {
        select: {
          signatureDataUrl: true,
          idPhotoMimeType: true,
          idPhotoStorageKey: true,
        },
      },
    },
  });

  if (!application.mandateFormSubmission) {
    throw new Error("Supporting documents must be submitted before the mandate form can be replaced.");
  }

  const idPhotoBytes = await readFile(storageKeyPath(application.mandateFormSubmission.idPhotoStorageKey));
  await writeMandatePdf(
    application,
    signatureDataUrl,
    idPhotoBytes,
    application.mandateFormSubmission.idPhotoMimeType,
  );
  await prisma.mandateFormSubmission.update({
    where: { applicationId },
    data: {
      signatureDataUrl,
      submittedAt: new Date(),
    },
  });

  revalidatePath(`/client/${application.publicToken}`);
  refreshWorkflowPages();
}

export async function supplierMarkProduced(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const supplierId = await actorIdFor(UserRole.SUPPLIER);

  await transitionApplication(applicationId, ApplicationStatus.SUPPLIER_PRODUCED, {
    actorId: supplierId,
    note: "Supplier marked the physical document as produced.",
  });

  if (supplierId) {
    await prisma.supplierEvent.create({
      data: {
        applicationId,
        action: ApplicationStatus.SUPPLIER_PRODUCED,
        actorId: supplierId,
        note: "Physical document produced.",
      },
    });
  }

  refreshWorkflowPages();
}

export async function supplierMarkReturning(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const supplierId = await actorIdFor(UserRole.SUPPLIER);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      currentStatus: true,
    },
  });

  if (application.currentStatus !== ApplicationStatus.SUPPLIER_PRODUCED) {
    throw new Error("The document must be marked as produced before it can be returned.");
  }

  await transitionApplication(applicationId, ApplicationStatus.RETURNING_TO_LICENSE_HUB, {
    actorId: supplierId,
    note: "Supplier marked the document as returning to The License Hub.",
  });

  if (supplierId) {
    await prisma.supplierEvent.create({
      data: {
        applicationId,
        action: ApplicationStatus.RETURNING_TO_LICENSE_HUB,
        actorId: supplierId,
        note: "Document sent back to The License Hub.",
      },
    });
  }

  refreshWorkflowPages();
}
