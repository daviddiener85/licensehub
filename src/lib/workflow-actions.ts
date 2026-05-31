"use server";

import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  SupplierUrgency,
  UserRole,
} from "@/generated/prisma/client";
import { clientIdMandatePdfLabel } from "@/lib/client-identity";
import { createMandatePdf } from "@/lib/mandate-pdf";
import { prisma } from "@/lib/prisma";
import { calculateRetentionEligibleAt } from "@/lib/retention";
import { documentRequirementsForEntityType } from "@/lib/entity-requirements";
import { documentLabel } from "@/lib/documents";

export type PublicIntakeSubmissionState = {
  status: "idle" | "error";
  message: string;
};

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

  if (!["image/jpeg", "image/png"].includes(idPhoto.type)) {
    throw new Error("The ID photo must be a JPG or PNG image.");
  }

  return idPhoto;
}

function getOptionalIdPhoto(formData: FormData) {
  const idPhoto = formData.get("idPhoto");

  if (!(idPhoto instanceof File) || idPhoto.size === 0) {
    return null;
  }

  if (!["image/jpeg", "image/png"].includes(idPhoto.type)) {
    throw new Error("The ID photo must be a JPG or PNG image.");
  }

  return idPhoto;
}

function isImageFile(file: File | null) {
  return Boolean(file && (file.type === "image/jpeg" || file.type === "image/png"));
}

function getRequiredFile(formData: FormData, fieldName: string, label: string, allowedTypes: string[]) {
  const file = formData.get(fieldName);

  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${label} is required.`);
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`${label} must be one of the accepted file types.`);
  }

  return file;
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
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(path.join(uploadDirectory, fileName), bytes);

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
      fileName: file.name || fileName,
      mimeType: file.type,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${fileName}`,
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
      fileName: file.name || fileName,
      mimeType: file.type,
      fileSizeBytes: bytes.length,
      storageKey: `/uploads/${uploadFolder}/${applicationId}/${fileName}`,
      proofDocumentDate,
    },
  });
}

async function saveAdditionalSupportingDocuments(applicationId: string, files: File[]) {
  const validFiles = files.filter((file) => file instanceof File && file.size > 0);

  if (validFiles.length === 0) {
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

  for (const file of validFiles) {
    const fileName = `${randomUUID()}-${safeFileName(file.name || "supporting-document")}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const storageKey = `/uploads/client-documents/${applicationId}/${fileName}`;

    await writeFile(path.join(uploadDirectory, fileName), bytes);

    await prisma.document.create({
      data: {
        applicationId,
        type: DocumentType.OTHER,
        status: DocumentStatus.PENDING,
        version: nextVersion,
        fileName: file.name || fileName,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: bytes.length,
        storageKey,
      },
    });

    nextVersion += 1;
  }
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

function storageKeyPath(storageKey: string) {
  const relativePath = storageKey.replace(/^\/+/, "");

  if (!relativePath.startsWith("uploads/")) {
    throw new Error("Unsupported storage key.");
  }

  return path.join(process.cwd(), "public", relativePath);
}

async function writeMandatePdf(
  application: Awaited<ReturnType<typeof prisma.application.findUniqueOrThrow>> & {
    client: {
      firstName: string;
      surname: string;
      southAfricanIdEncrypted: string;
      entityType: ClientEntityType;
    };
  },
  signatureDataUrl: string,
  idPhotoBytes?: Buffer,
  idPhotoMimeType?: string,
) {
  const applicationId = application.id;
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "mandate-forms", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const pdfBytes = await createMandatePdf({
    clientName: `${application.client.firstName} ${application.client.surname}`,
    clientIdLabel: clientIdMandatePdfLabel(application.client.southAfricanIdEncrypted),
    entityType: application.client.entityType,
    entityDisplayName: application.entityDisplayName,
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
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { currentStatus: true },
  });

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      currentStatus: toStatus,
      previousStatus: application.currentStatus,
      ...options.data,
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

function refreshWorkflowPages() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/supplier");
  revalidatePath("/client/[token]", "page");
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

  const supportingRequirements = documentRequirementsForEntityType(document.application.client.entityType).filter(
    (requirement) => requirement.confirmedForUpload && !requirement.documentType,
  );
  const supportingDocuments = await prisma.document.findMany({
    where: {
      applicationId,
      type: DocumentType.OTHER,
    },
    select: { id: true, version: true },
    orderBy: { version: "asc" },
  });
  const supportingIndex = supportingDocuments.findIndex((item) => item.id === document.id);
  const requirementForIndex = supportingIndex >= 0 ? supportingRequirements[supportingIndex] : null;

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
                  "Do not guess registration, VIN/chassis, make, or model from partial unreadable text.",
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
                  description: "Vehicle registration number from the licence disk, without spaces where possible.",
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
  const registrationNumber = getRequiredString(formData, "registrationNumber", "Registration number");
  const applicationId = await nextApplicationId();
  const publicToken = randomUUID();
  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: "duplicate-certificate" },
    select: { id: true },
  });
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

  await prisma.application.create({
    data: {
      id: applicationId,
      publicToken,
      clientId: client.id,
      serviceId: service.id,
      currentStatus: ApplicationStatus.DRAFT,
      registrationNumber,
      vin: getOptionalString(formData, "vin"),
      vehicleMake: getOptionalString(formData, "vehicleMake"),
      vehicleModel: getOptionalString(formData, "vehicleModel"),
      vehicleYear: Number(getOptionalString(formData, "vehicleYear")) || null,
      vehicleColour: getOptionalString(formData, "vehicleColour"),
    },
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
    const representativeFullName = getOptionalString(formData, "representativeFullName");
    const representativeCapacity = getOptionalString(formData, "representativeCapacity");
    const paymentDeliveryAddressLine1 = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryAddressLine1", "Payment delivery address line 1")
      : deliveryAddressLine1;
    const paymentDeliveryCity = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryCity", "Payment delivery city")
      : deliveryCity;
    const paymentDeliveryPostalCode = deliveryRequired
      ? getRequiredString(formData, "paymentDeliveryPostalCode", "Payment delivery postal code")
      : deliveryPostalCode;
    const registrationNumber = getRequiredString(formData, "registrationNumber", "Registration number");
    const signatureDataUrl = getSignatureDataUrl(formData);
    const idPhoto = getOptionalIdPhoto(formData);
    const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [
      "image/jpeg",
      "image/png",
    ]);
    const proofOfAddress = getRequiredFile(formData, "proofOfAddress", "Proof of address", [
      "image/jpeg",
      "image/png",
      "application/pdf",
    ]);
    const trafficRegisterDocument =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? getRequiredFile(formData, "trafficRegisterDocument", "Traffic register document (TRN)", [
            "image/jpeg",
            "image/png",
            "application/pdf",
          ])
        : null;
    const passportDocument =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? getRequiredFile(formData, "passportDocument", "Passport document", [
            "image/jpeg",
            "image/png",
            "application/pdf",
          ])
        : null;
    const identityPhotoForMandate =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? isImageFile(passportDocument)
          ? passportDocument
          : isImageFile(trafficRegisterDocument)
            ? trafficRegisterDocument
            : idPhoto
        : idPhoto;
    if (!identityPhotoForMandate && entityType !== ClientEntityType.NON_SA_CITIZEN) {
      throw new Error("An ID photo is required before submitting the mandate form.");
    }
    const identityDocumentForStorage =
      entityType === ClientEntityType.NON_SA_CITIZEN
        ? passportDocument ?? trafficRegisterDocument ?? idPhoto
        : identityPhotoForMandate;
    if (!identityDocumentForStorage) {
      throw new Error("A valid identity document is required before submitting the mandate form.");
    }
    const supportingDocuments = formData
      .getAll("supportingDocument")
      .filter((value): value is File => value instanceof File && value.size > 0);
    getRequiredCheckbox(formData, "popiaConsent", "Personal information consent");
    const applicationId = await nextApplicationId();
    const publicToken = randomUUID();
    const identifierHash = clientIdHash(identityNumber);
    const service = await prisma.service.findFirstOrThrow({
      where: {
        slug: getSelectedServiceSlug(formData),
        isActive: true,
      },
      select: { id: true, name: true, basePrice: true, deliveryFee: true },
    });
    const baseAmount = Number(service.basePrice);
    const deliveryAmount = deliveryRequired ? Number(service.deliveryFee) : 0;
    const totalAmount = (baseAmount + deliveryAmount).toFixed(2);
    const startAwaitingPayment = Number(totalAmount) > 0;
    const initialStatus = startAwaitingPayment
      ? ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT
      : ApplicationStatus.AWAITING_ADMIN_QUOTE;
    const client = await prisma.client.upsert({
    where: { southAfricanIdHash: identifierHash },
    update: {
      entityType,
      referralSource: "Website",
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
      referralSource: "Website",
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
    const application = await prisma.application.create({
    data: {
      id: applicationId,
      publicToken,
      clientId: client.id,
      serviceId: service.id,
      currentStatus: initialStatus,
      registrationNumber,
      vin: getOptionalString(formData, "vin"),
      vehicleMake: getOptionalString(formData, "vehicleMake"),
      vehicleModel: getOptionalString(formData, "vehicleModel"),
      entityDisplayName,
      entityRegistrationNumber,
      representativeFullName,
      representativeCapacity,
      ...(startAwaitingPayment
        ? {
            quoteVersion: 1,
            quotedAt: new Date(),
            quoteApprovedAt: new Date(),
          }
        : {}),
      statusHistory: {
        create: {
          fromStatus: null,
          toStatus: initialStatus,
          note: startAwaitingPayment
            ? `Client started application from the public website and moved to awaiting EFT payment. Relationship: ${getOptionalString(formData, "relation") ?? "Not supplied"}. Delivery required: ${deliveryRequired ? "Yes" : "No"}.`
            : `Client started application from the public website. Relationship: ${getOptionalString(formData, "relation") ?? "Not supplied"}. Delivery required: ${deliveryRequired ? "Yes" : "No"}.`,
        },
      },
    },
    include: {
      client: true,
    },
  });
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
          method: PaymentMethod.EFT,
          type: PaymentType.BASE_FEE,
          amount: totalAmount,
          reference: `PAY-${applicationId}-Q1`,
          status: PaymentStatus.PENDING,
          requestedAt: new Date(),
        },
      });
    }

    const whatsappConfirmationMessage = startAwaitingPayment
      ? [
          `Hi ${firstName},`,
          "",
          "Your License Hub order has been received.",
          `Reference number: ${applicationId}.`,
          "",
          "Your EFT payment request is ready. Please use the payment reference shown on your application page.",
        ].join("\n")
      : [
      `Hi ${firstName},`,
      "",
      "Your License Hub order has been received.",
      `Reference number: ${applicationId}.`,
      "",
      "Our admin team will now prepare your quote and we'll keep you updated on your application status.",
    ].join("\n");
    await prisma.communication.create({
      data: {
        applicationId,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        status: CommunicationStatus.QUEUED,
        senderId: adminId,
        recipientName: `${firstName} ${surname}`.trim(),
        recipientAddress: cellphone,
        templateKey: "application-received-confirmation",
        body: whatsappConfirmationMessage,
      },
    });
    const savedIdPhoto = await saveMandateIdPhoto(applicationId, identityDocumentForStorage);

    await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
    await saveUploadedDocument(applicationId, proofOfAddress, DocumentType.PROOF_OF_ADDRESS, "client-documents");
    const mandatorySupportingDocuments = [trafficRegisterDocument, passportDocument].filter(
      (file): file is File => file instanceof File && file.size > 0,
    );
    await saveAdditionalSupportingDocuments(applicationId, [...mandatorySupportingDocuments, ...supportingDocuments]);
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
      application,
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
    redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}`);
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

export async function publishAdminQuote(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const amount = getRequiredMoneyAmount(formData, "quoteAmount", "Quote amount");
  const description =
    getOptionalString(formData, "quoteDescription") || "License fee quote prepared by admin.";
  const adminId = await actorIdFor(UserRole.ADMIN);

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { client: true },
  });

  if (
    application.currentStatus === ApplicationStatus.CANCELLED ||
    application.currentStatus === ApplicationStatus.DISPATCHED
  ) {
    throw new Error("Cannot publish a quote for a closed application.");
  }

  const quoteVersion = (application.quoteVersion ?? 0) + 1;

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

  await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "quote-ready-for-approval",
      body: `Hi ${application.client.firstName}, your quote is ready for application ${applicationId}. Please review and approve so we can proceed.`,
    },
  });

  refreshWorkflowPages();
  revalidatePath("/admin");
}

export async function approveClientQuote(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const publicToken = getRequiredString(formData, "publicToken", "Public token");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      charges: {
        where: { status: "PENDING" },
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
  const paymentReference = `PAY-${applicationId}-Q${application.quoteVersion || 1}`;

  await prisma.payment.create({
    data: {
      applicationId,
      type: PaymentType.BASE_FEE,
      method: PaymentMethod.EFT,
      status: PaymentStatus.PENDING,
      amount: total.toFixed(2),
      reference: paymentReference,
    },
  });

  await transitionApplication(applicationId, ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT, {
    note: "Client approved quote and payment request was created.",
    data: {
      quoteApprovedAt: new Date(),
    },
  });

  refreshWorkflowPages();
  revalidatePath(`/apply/submitted?application=${applicationId}`);
  redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}`);
}

export async function confirmEftPayment(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      payments: {
        where: {
          method: "EFT",
          status: PaymentStatus.PENDING,
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

  await transitionApplication(applicationId, ApplicationStatus.PENDING_REVIEW, {
    actorId: adminId,
    note: "Admin confirmed EFT payment.",
  });

  refreshWorkflowPages();
}

export async function uploadEftProof(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const eftProof = getRequiredFile(formData, "eftProof", "Proof of EFT payment", [
    "image/jpeg",
    "image/png",
    "application/pdf",
  ]);

  await saveUploadedDocument(applicationId, eftProof, DocumentType.PROOF_OF_EFT_PAYMENT, "client-documents");
  await appendStatusHistoryNote(applicationId, null, "Client uploaded proof of EFT payment.");

  refreshWorkflowPages();
  revalidatePath(`/apply/submitted?application=${applicationId}`);
  redirect(`/apply/submitted?application=${encodeURIComponent(applicationId)}&eftUploaded=1`);
}

export async function requestResubmission(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);
  const documentIds = formData.getAll("documentId").filter((value): value is string => typeof value === "string");
  const whatsappMessage = formData.get("whatsappMessage");

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

  await transitionApplication(applicationId, ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED, {
    actorId: adminId,
    note: `Admin requested resubmission for ${documentIds.length} document(s).`,
  });

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      client: true,
    },
  });

  await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "documents-resubmission-request",
      body: whatsappMessage.trim(),
    },
  });

  refreshWorkflowPages();
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

  refreshWorkflowPages();
  revalidatePath(`/admin?application=${applicationId}`);
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
  const adminName = "License Hub Admin";
  const supplierUrgency = getSupplierUrgency(formData);
  const comment = getOptionalString(formData, "orderComment");

  await prisma.application.update({
    where: { id: applicationId },
    data: { supplierUrgency },
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
    include: {
      client: {
        select: {
          entityType: true,
        },
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
      },
      mandateFormSubmission: true,
    },
  });
  const incompleteRequirement = documentRequirementsForEntityType(application.client.entityType)
    .filter((requirement) => requirement.confirmedForUpload)
    .find((requirement) => {
      if (requirement.key === "id-photo") {
        return !application.mandateFormSubmission;
      }

      if (!requirement.documentType) {
        const supportingDocuments = application.documents
          .filter((document) => document.type === DocumentType.OTHER)
          .sort((first, second) => first.version - second.version);
        const supportingIndexByRequirement: Partial<Record<string, number>> = {
          "death-certificate": 0,
          "executor-authority": 1,
          "registration-or-trust-document": 0,
          "representative-authority": 1,
          "traffic-register-document": 0,
          "passport-document": 1,
        };
        const supportingIndex = supportingIndexByRequirement[requirement.key];

        if (typeof supportingIndex !== "number") {
          return true;
        }

        const supportingDocument = supportingDocuments[supportingIndex];
        return !supportingDocument || supportingDocument.status !== DocumentStatus.ACCEPTED;
      }

      const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

      return !latestDocument || latestDocument.status !== DocumentStatus.ACCEPTED;
    });

  if (incompleteRequirement) {
    throw new Error(`${incompleteRequirement.label} must be uploaded and accepted before approval.`);
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
    note: "Admin confirmed the physical document returned to License Hub.",
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

export async function sendClientMessage(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const body = formData.get("body");
  const adminId = await actorIdFor(UserRole.ADMIN);

  if (typeof body !== "string" || body.trim().length === 0) {
    throw new Error("Message body is required.");
  }

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      client: true,
    },
  });

  await prisma.communication.create({
    data: {
      applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: adminId,
      recipientName: `${application.client.firstName} ${application.client.surname}`,
      recipientAddress: application.client.cellphone,
      templateKey: "manual-admin-message",
      body: body.trim(),
    },
  });

  refreshWorkflowPages();
}

export async function submitMandateFormCapture(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const signatureDataUrl = getSignatureDataUrl(formData);
  const idPhoto = getIdPhoto(formData);
  const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [
    "image/jpeg",
    "image/png",
  ]);
  const proofOfAddress = getRequiredFile(formData, "proofOfAddress", "Proof of address", [
    "image/jpeg",
    "image/png",
    "application/pdf",
  ]);
  const proofDocumentDate = getProofDocumentDate(formData);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      client: true,
    },
  });

  const savedIdPhoto = await saveMandateIdPhoto(applicationId, idPhoto);
  await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
  await saveUploadedDocument(
    applicationId,
    proofOfAddress,
    DocumentType.PROOF_OF_ADDRESS,
    "client-documents",
    proofDocumentDate,
  );

  await writeMandatePdf(application, signatureDataUrl, savedIdPhoto.idPhotoBytes, idPhoto.type);

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
  const licenceDiskPhoto = getRequiredFile(formData, "licenceDiskPhoto", "Licence disk photo", [
    "image/jpeg",
    "image/png",
  ]);
  const proofOfAddress = getRequiredFile(formData, "proofOfAddress", "Proof of address", [
    "image/jpeg",
    "image/png",
    "application/pdf",
  ]);
  const proofDocumentDate = getProofDocumentDate(formData);
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: {
      client: true,
      mandateFormSubmission: true,
    },
  });
  const savedIdPhoto = await saveMandateIdPhoto(applicationId, idPhoto);

  await saveUploadedDocument(applicationId, licenceDiskPhoto, DocumentType.LICENCE_DISK_PHOTO, "client-documents");
  await saveUploadedDocument(
    applicationId,
    proofOfAddress,
    DocumentType.PROOF_OF_ADDRESS,
    "client-documents",
    proofDocumentDate,
  );

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
    include: {
      client: true,
      mandateFormSubmission: true,
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

  await transitionApplication(applicationId, ApplicationStatus.RETURNING_TO_LICENSE_HUB, {
    actorId: supplierId,
    note: "Supplier marked the document as returning to License Hub.",
  });

  if (supplierId) {
    await prisma.supplierEvent.create({
      data: {
        applicationId,
        action: ApplicationStatus.RETURNING_TO_LICENSE_HUB,
        actorId: supplierId,
        note: "Document sent back to License Hub.",
      },
    });
  }

  refreshWorkflowPages();
}
