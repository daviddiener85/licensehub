import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";

import {
  ApplicationStatus,
  ClientEntityType,
  DocumentStatus,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from "@/generated/prisma/client";
import { documentRequirementsForEntityType, supportingDocumentForRequirement } from "@/lib/entity-requirements";
import { prisma } from "@/lib/prisma";

type SimulationResult = {
  entityType: ClientEntityType;
  applicationId: string;
  otherDocs: number;
  blocker: string | null;
  transitioned: boolean;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function runForEntity(entityType: ClientEntityType): Promise<SimulationResult> {
  const stamp = Date.now();
  const applicationId = `SIM-${entityType}-${stamp}-${randomUUID().slice(0, 8)}`;
  const service = await prisma.service.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!service) {
    throw new Error("No active service found. Seed or create a service first.");
  }

  const client = await prisma.client.create({
    data: {
      entityType,
      firstName: "Sim",
      surname: entityType,
      southAfricanIdEncrypted: `pending-secure-id:${applicationId}`,
      southAfricanIdHash: sha256(`${applicationId}-id`),
      cellphone: "0820000000",
      email: `${applicationId.toLowerCase()}@example.com`,
      deliveryAddressLine1: "1 Test Street",
      deliveryCity: "Johannesburg",
      deliveryPostalCode: "2000",
      popiaConsentAcceptedAt: new Date(),
    },
  });

  const needsEntityFields =
    entityType === ClientEntityType.COMPANY_OR_TRUST || entityType === ClientEntityType.DECEASED_ESTATE;

  const application = await prisma.application.create({
    data: {
      id: applicationId,
      publicToken: randomUUID(),
      clientId: client.id,
      serviceId: service.id,
      currentStatus: ApplicationStatus.AWAITING_ADMIN_QUOTE,
      registrationNumber: "AB12CDGP",
      vehicleMake: "TOYOTA",
      vehicleModel: "COROLLA",
      vin: `VIN${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      submittedAt: new Date(),
      entityDisplayName: needsEntityFields ? `${entityType} ENTITY` : null,
      entityRegistrationNumber: needsEntityFields ? `REG-${stamp}` : null,
      representativeFullName: needsEntityFields ? "Test Rep" : null,
      representativeCapacity: needsEntityFields ? "Authorised Representative" : null,
    },
  });

  await prisma.mandateFormSubmission.create({
    data: {
      applicationId: application.id,
      signatureDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3ZK7sAAAAASUVORK5CYII=",
      idPhotoFileName: "id.jpg",
      idPhotoMimeType: "image/jpeg",
      idPhotoSizeBytes: 1234,
      idPhotoStorageKey: `sim/${application.id}/id.jpg`,
    },
  });

  const baseDocs: DocumentType[] = [
    DocumentType.ID_PHOTO,
    DocumentType.LICENCE_DISK_PHOTO,
    DocumentType.PROOF_OF_ADDRESS,
    DocumentType.MANDATE_FORM,
  ];
  let version = 1;
  for (const type of baseDocs) {
    await prisma.document.create({
      data: {
        applicationId: application.id,
        type,
        status: DocumentStatus.ACCEPTED,
        version,
        fileName: `${type}.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 1000,
        storageKey: `sim/${application.id}/${type}.pdf`,
      },
    });
    version += 1;
  }

  const requirements = documentRequirementsForEntityType(entityType).filter((item) => item.confirmedForUpload);
  const supportingRequirements = requirements.filter((item) => !item.documentType && item.key !== "id-photo");
  for (let index = 0; index < supportingRequirements.length; index += 1) {
    await prisma.document.create({
      data: {
        applicationId: application.id,
        type: DocumentType.OTHER,
        requirementKey: supportingRequirements[index].key,
        status: DocumentStatus.ACCEPTED,
        version,
        fileName: `OTHER-${index + 1}.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 1000,
        storageKey: `sim/${application.id}/OTHER-${index + 1}.pdf`,
      },
    });
    version += 1;
  }

  const eftProof = await prisma.document.create({
    data: {
      applicationId: application.id,
      type: DocumentType.PROOF_OF_EFT_PAYMENT,
      status: DocumentStatus.ACCEPTED,
      version,
      fileName: "proof-eft.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1000,
      storageKey: `sim/${application.id}/proof-eft.pdf`,
    },
  });

  await prisma.payment.create({
    data: {
      applicationId: application.id,
      type: PaymentType.BASE_FEE,
      method: PaymentMethod.EFT,
      status: PaymentStatus.CONFIRMED,
      amount: "100.00",
      currency: "ZAR",
      reference: `SIM-REF-${stamp}`,
      proofDocumentId: eftProof.id,
      confirmedAt: new Date(),
    },
  });

  const hydrated = await prisma.application.findUniqueOrThrow({
    where: { id: application.id },
    include: {
      client: { select: { entityType: true } },
      documents: { orderBy: [{ type: "asc" }, { version: "asc" }] },
      mandateFormSubmission: true,
    },
  });

  const blocker = documentRequirementsForEntityType(hydrated.client.entityType)
    .filter((item) => item.confirmedForUpload)
    .find((requirement) => {
      if (!requirement.documentType) {
        const supportingDocument = supportingDocumentForRequirement(
          requirement.key,
          hydrated.client.entityType,
          hydrated.documents,
        );
        return !supportingDocument || supportingDocument.status !== DocumentStatus.ACCEPTED;
      }

      const latest = hydrated.documents.find((document) => document.type === requirement.documentType);
      return !latest || latest.status !== DocumentStatus.ACCEPTED;
    });

  let transitioned = false;
  if (!blocker) {
    await prisma.application.update({
      where: { id: hydrated.id },
      data: {
        currentStatus: ApplicationStatus.AT_SUPPLIER,
        approvedAt: new Date(),
      },
    });
    transitioned = true;
  }

  return {
    entityType,
    applicationId: hydrated.id,
    otherDocs: supportingRequirements.length,
    blocker: blocker?.label ?? null,
    transitioned,
  };
}

async function main() {
  const entities: ClientEntityType[] = [
    ClientEntityType.COMPANY_OR_TRUST,
    ClientEntityType.DECEASED_ESTATE,
    ClientEntityType.NON_SA_CITIZEN,
  ];

  const results: SimulationResult[] = [];
  for (const entity of entities) {
    const result = await runForEntity(entity);
    results.push(result);
    console.log(
      `${result.entityType}: app=${result.applicationId} otherDocs=${result.otherDocs} blocker=${result.blocker ?? "none"} transitioned=${result.transitioned}`,
    );
  }

  const failures = results.filter((result) => !result.transitioned);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
