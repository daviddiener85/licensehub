"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  ApplicationStatus,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  DocumentStatus,
  DocumentType,
  PaymentStatus,
  UserRole,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateRetentionEligibleAt } from "@/lib/retention";

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

  if (!["image/jpeg", "image/png", "image/webp"].includes(idPhoto.type)) {
    throw new Error("The ID photo must be a JPG, PNG, or WebP image.");
  }

  return idPhoto;
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

export async function confirmEftPayment(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);

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

export async function approveToSupplier(formData: FormData) {
  const applicationId = getApplicationId(formData);
  const adminId = await actorIdFor(UserRole.ADMIN);

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
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { publicToken: true },
  });

  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "mandate-forms", applicationId);
  await mkdir(uploadDirectory, { recursive: true });

  const fileName = `${randomUUID()}-${safeFileName(idPhoto.name || "id-photo")}`;
  const absolutePath = path.join(uploadDirectory, fileName);
  const idPhotoBytes = Buffer.from(await idPhoto.arrayBuffer());

  await writeFile(absolutePath, idPhotoBytes);

  const storageKey = `/uploads/mandate-forms/${applicationId}/${fileName}`;

  await prisma.mandateFormSubmission.upsert({
    where: { applicationId },
    update: {
      signatureDataUrl,
      idPhotoFileName: idPhoto.name || fileName,
      idPhotoMimeType: idPhoto.type,
      idPhotoSizeBytes: idPhoto.size,
      idPhotoStorageKey: storageKey,
      submittedAt: new Date(),
    },
    create: {
      applicationId,
      signatureDataUrl,
      idPhotoFileName: idPhoto.name || fileName,
      idPhotoMimeType: idPhoto.type,
      idPhotoSizeBytes: idPhoto.size,
      idPhotoStorageKey: storageKey,
    },
  });

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
      storageKey: `pending-pdf/${applicationId}/mandate-form.pdf`,
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
      fileSizeBytes: 0,
      storageKey: `pending-pdf/${applicationId}/mandate-form.pdf`,
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
