import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApplicationStatus,
  DocumentStatus,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const demoApplications = [
  {
    id: "LH-2026-0018",
    publicToken: "demo-resubmit",
    status: ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED,
    previousStatus: ApplicationStatus.PENDING_REVIEW,
    client: {
      firstName: "Mia",
      surname: "Jacobs",
      idHash: "demo-id-hash-mia",
      cellphone: "0825550188",
      email: "mia.jacobs@example.com",
      city: "Cape Town",
      postalCode: "8001",
    },
    vehicle: {
      registrationNumber: "CA 123-456",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2019,
      vehicleColour: "White",
    },
    documents: [
      { type: DocumentType.LICENCE_DISK_PHOTO, status: DocumentStatus.ACCEPTED, fileName: "licence-disk.jpg" },
      {
        type: DocumentType.PROOF_OF_ADDRESS,
        status: DocumentStatus.REJECTED,
        fileName: "proof-of-address.pdf",
        rejectionReason: "Proof of address is older than 3 months.",
      },
      { type: DocumentType.MANDATE_LETTER, status: DocumentStatus.ACCEPTED, fileName: "mandate-letter.jpg" },
    ],
    payment: {
      method: PaymentMethod.PAYSTACK,
      status: PaymentStatus.CONFIRMED,
      amount: "850.00",
      reference: "LH-2026-0018-BASE",
    },
  },
  {
    id: "LH-2026-0019",
    publicToken: "demo-eft-pending",
    status: ApplicationStatus.PENDING_REVIEW,
    client: {
      firstName: "Aiden",
      surname: "Naidoo",
      idHash: "demo-id-hash-aiden",
      cellphone: "0735550120",
      email: "aiden.naidoo@example.com",
      city: "Durban",
      postalCode: "4001",
    },
    vehicle: {
      registrationNumber: "ND 445-210",
      vehicleMake: "Hyundai",
      vehicleModel: "i20",
      vehicleYear: 2018,
      vehicleColour: "Blue",
    },
    documents: [
      { type: DocumentType.LICENCE_DISK_PHOTO, status: DocumentStatus.PENDING, fileName: "licence-disk.jpg" },
      { type: DocumentType.PROOF_OF_ADDRESS, status: DocumentStatus.PENDING, fileName: "proof-of-address.pdf" },
      { type: DocumentType.MANDATE_LETTER, status: DocumentStatus.PENDING, fileName: "mandate-letter.jpg" },
      { type: DocumentType.PROOF_OF_EFT_PAYMENT, status: DocumentStatus.PENDING, fileName: "eft-proof.pdf" },
    ],
    payment: {
      method: PaymentMethod.EFT,
      status: PaymentStatus.PENDING,
      amount: "850.00",
      reference: "LH-2026-0019-BASE",
    },
  },
  {
    id: "LH-2026-0020",
    publicToken: "demo-at-supplier",
    status: ApplicationStatus.AT_SUPPLIER,
    previousStatus: ApplicationStatus.APPROVED,
    client: {
      firstName: "Thando",
      surname: "Mokoena",
      idHash: "demo-id-hash-thando",
      cellphone: "0825550142",
      email: "thando.mokoena@example.com",
      city: "Johannesburg",
      postalCode: "2001",
    },
    vehicle: {
      registrationNumber: "CY 918-274",
      vehicleMake: "VW",
      vehicleModel: "Polo",
      vehicleYear: 2021,
      vehicleColour: "White",
    },
    documents: [
      { type: DocumentType.LICENCE_DISK_PHOTO, status: DocumentStatus.ACCEPTED, fileName: "licence-disk.jpg" },
      { type: DocumentType.PROOF_OF_ADDRESS, status: DocumentStatus.ACCEPTED, fileName: "proof-of-address.pdf" },
      { type: DocumentType.MANDATE_LETTER, status: DocumentStatus.ACCEPTED, fileName: "mandate-letter.jpg" },
    ],
    payment: {
      method: PaymentMethod.PAYSTACK,
      status: PaymentStatus.CONFIRMED,
      amount: "850.00",
      reference: "LH-2026-0020-BASE",
    },
  },
  {
    id: "LH-2026-0021",
    publicToken: "demo-returning",
    status: ApplicationStatus.RETURNING_TO_LICENSE_HUB,
    previousStatus: ApplicationStatus.SUPPLIER_PRODUCED,
    client: {
      firstName: "Leila",
      surname: "Petersen",
      idHash: "demo-id-hash-leila",
      cellphone: "0735550199",
      email: "leila.petersen@example.com",
      city: "Stellenbosch",
      postalCode: "7600",
    },
    vehicle: {
      registrationNumber: "CA 771-330",
      vehicleMake: "Ford",
      vehicleModel: "Ranger",
      vehicleYear: 2020,
      vehicleColour: "Silver",
    },
    documents: [
      { type: DocumentType.LICENCE_DISK_PHOTO, status: DocumentStatus.ACCEPTED, fileName: "licence-disk.jpg" },
      { type: DocumentType.PROOF_OF_ADDRESS, status: DocumentStatus.ACCEPTED, fileName: "proof-of-address.pdf" },
      { type: DocumentType.MANDATE_LETTER, status: DocumentStatus.ACCEPTED, fileName: "mandate-letter.jpg" },
    ],
    payment: {
      method: PaymentMethod.PAYSTACK,
      status: PaymentStatus.CONFIRMED,
      amount: "850.00",
      reference: "LH-2026-0021-BASE",
    },
  },
] as const;

async function main() {
  await prisma.retentionSetting.upsert({
    where: { id: "default" },
    update: {
      complianceResponsibility: "Business Owner",
    },
    create: {
      id: "default",
      daysAfterCompletion: null,
      complianceResponsibility: "Business Owner",
    },
  });

  await prisma.service.upsert({
    where: { slug: "duplicate-certificate" },
    update: {
      name: "Duplicate Certificate",
      description: "Replacement of lost vehicle certificates.",
      basePrice: "0.00",
      isActive: true,
      documentRequirements: {
        upsert: [
          {
            where: {
              serviceId_type: {
                serviceId: "duplicate-certificate",
                type: DocumentType.LICENCE_DISK_PHOTO,
              },
            },
            create: {
              type: DocumentType.LICENCE_DISK_PHOTO,
              label: "Licence disk photo",
              description: "JPG or PNG with enough clarity for OCR.",
              sortOrder: 1,
            },
            update: {
              label: "Licence disk photo",
              description: "JPG or PNG with enough clarity for OCR.",
              sortOrder: 1,
            },
          },
          {
            where: {
              serviceId_type: {
                serviceId: "duplicate-certificate",
                type: DocumentType.PROOF_OF_ADDRESS,
              },
            },
            create: {
              type: DocumentType.PROOF_OF_ADDRESS,
              label: "Proof of address",
              description: "JPG, PNG, or PDF dated within the last 3 months.",
              sortOrder: 2,
            },
            update: {
              label: "Proof of address",
              description: "JPG, PNG, or PDF dated within the last 3 months.",
              sortOrder: 2,
            },
          },
          {
            where: {
              serviceId_type: {
                serviceId: "duplicate-certificate",
                type: DocumentType.MANDATE_LETTER,
              },
            },
            create: {
              type: DocumentType.MANDATE_LETTER,
              label: "Mandate letter",
              description: "Handwritten letter addressed to License Hub with signature.",
              sortOrder: 3,
            },
            update: {
              label: "Mandate letter",
              description: "Handwritten letter addressed to License Hub with signature.",
              sortOrder: 3,
            },
          },
        ],
      },
    },
    create: {
      id: "duplicate-certificate",
      slug: "duplicate-certificate",
      name: "Duplicate Certificate",
      description: "Replacement of lost vehicle certificates.",
      basePrice: "0.00",
      documentRequirements: {
        create: [
          {
            type: DocumentType.LICENCE_DISK_PHOTO,
            label: "Licence disk photo",
            description: "JPG or PNG with enough clarity for OCR.",
            sortOrder: 1,
          },
          {
            type: DocumentType.PROOF_OF_ADDRESS,
            label: "Proof of address",
            description: "JPG, PNG, or PDF dated within the last 3 months.",
            sortOrder: 2,
          },
          {
            type: DocumentType.MANDATE_LETTER,
            label: "Mandate letter",
            description: "Handwritten letter addressed to License Hub with signature.",
            sortOrder: 3,
          },
        ],
      },
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@licensehub.local" },
    update: {
      name: "License Hub Admin",
      role: UserRole.ADMIN,
      cellphone: "0825550100",
    },
    create: {
      email: "admin@licensehub.local",
      name: "License Hub Admin",
      role: UserRole.ADMIN,
      cellphone: "0825550100",
      passwordHash: "replace-with-real-password-hash",
    },
  });

  const supplierUser = await prisma.user.upsert({
    where: { email: "supplier@licensehub.local" },
    update: {
      name: "Fulfilment Supplier",
      role: UserRole.SUPPLIER,
      cellphone: "0735550100",
    },
    create: {
      email: "supplier@licensehub.local",
      name: "Fulfilment Supplier",
      role: UserRole.SUPPLIER,
      cellphone: "0735550100",
      passwordHash: "replace-with-real-password-hash",
    },
  });

  for (const demo of demoApplications) {
    const client = await prisma.client.upsert({
      where: { southAfricanIdHash: demo.client.idHash },
      update: {
        firstName: demo.client.firstName,
        surname: demo.client.surname,
        cellphone: demo.client.cellphone,
        email: demo.client.email,
        deliveryCity: demo.client.city,
        deliveryPostalCode: demo.client.postalCode,
      },
      create: {
        firstName: demo.client.firstName,
        surname: demo.client.surname,
        southAfricanIdEncrypted: `encrypted-${demo.client.idHash}`,
        southAfricanIdHash: demo.client.idHash,
        cellphone: demo.client.cellphone,
        email: demo.client.email,
        deliveryAddressLine1: "Demo delivery address",
        deliveryCity: demo.client.city,
        deliveryProvince: "Western Cape",
        deliveryPostalCode: demo.client.postalCode,
        popiaConsentAcceptedAt: new Date("2026-05-08T08:00:00.000Z"),
      },
    });

    const application = await prisma.application.upsert({
      where: { publicToken: demo.publicToken },
      update: {
        clientId: client.id,
        serviceId: "duplicate-certificate",
        currentStatus: demo.status,
        previousStatus: "previousStatus" in demo ? demo.previousStatus : null,
        ...demo.vehicle,
        submittedAt: new Date("2026-05-06T08:00:00.000Z"),
        approvedAt:
          demo.status === ApplicationStatus.AT_SUPPLIER || demo.status === ApplicationStatus.RETURNING_TO_LICENSE_HUB
            ? new Date("2026-05-07T10:30:00.000Z")
            : null,
        completedAt: null,
        cancelledAt: null,
        retentionEligibleAt: null,
      },
      create: {
        id: demo.id,
        publicToken: demo.publicToken,
        clientId: client.id,
        serviceId: "duplicate-certificate",
        currentStatus: demo.status,
        previousStatus: "previousStatus" in demo ? demo.previousStatus : null,
        ...demo.vehicle,
        submittedAt: new Date("2026-05-06T08:00:00.000Z"),
        approvedAt:
          demo.status === ApplicationStatus.AT_SUPPLIER || demo.status === ApplicationStatus.RETURNING_TO_LICENSE_HUB
            ? new Date("2026-05-07T10:30:00.000Z")
            : null,
        completedAt: null,
        cancelledAt: null,
        retentionEligibleAt: null,
      },
    });

    await prisma.payment.deleteMany({ where: { applicationId: application.id } });
    await prisma.charge.deleteMany({ where: { applicationId: application.id } });
    await prisma.document.deleteMany({ where: { applicationId: application.id } });
    await prisma.supplierEvent.deleteMany({ where: { applicationId: application.id } });
    await prisma.statusHistory.deleteMany({ where: { applicationId: application.id } });

    await prisma.document.createMany({
      data: demo.documents.map((document) => ({
        applicationId: application.id,
        type: document.type,
        status: document.status,
        version: 1,
        fileName: document.fileName,
        mimeType: document.fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        fileSizeBytes: 250_000,
        storageKey: `demo/${application.id}/${document.fileName}`,
        rejectionReason: "rejectionReason" in document ? document.rejectionReason : null,
        reviewedById: document.status === DocumentStatus.PENDING ? null : adminUser.id,
        reviewedAt: document.status === DocumentStatus.PENDING ? null : new Date("2026-05-07T09:00:00.000Z"),
      })),
    });

    await prisma.payment.create({
      data: {
        applicationId: application.id,
        type: PaymentType.BASE_FEE,
        method: demo.payment.method,
        status: demo.payment.status,
        amount: demo.payment.amount,
        reference: demo.payment.reference,
        confirmedAt: demo.payment.status === PaymentStatus.CONFIRMED ? new Date("2026-05-06T08:30:00.000Z") : null,
      },
    });

    await prisma.statusHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: null,
        toStatus: demo.status,
        changedById: adminUser.id,
        note: "Seeded demo application state.",
      },
    });

    if (demo.status === ApplicationStatus.AT_SUPPLIER || demo.status === ApplicationStatus.RETURNING_TO_LICENSE_HUB) {
      await prisma.supplierEvent.create({
        data: {
          applicationId: application.id,
          action: demo.status,
          actorId: supplierUser.id,
          note: demo.status === ApplicationStatus.RETURNING_TO_LICENSE_HUB ? "Document sent back to License Hub." : null,
        },
      });
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
