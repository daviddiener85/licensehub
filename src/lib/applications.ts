import { ApplicationStatus, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { applicationPipeline } from "@/lib/workflow";

const supplierVisibleStatuses = [
  ApplicationStatus.AT_SUPPLIER,
  ApplicationStatus.SUPPLIER_PRODUCED,
  ApplicationStatus.RETURNING_TO_LICENSE_HUB,
];

export function statusLabel(status: string) {
  return applicationPipeline.find((stage) => stage.status === status)?.label ?? status.replaceAll("_", " ");
}

export function formatMoney(amount: { toString: () => string }, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(Number(amount.toString()));
}

export async function listAdminApplications() {
  return prisma.application.findMany({
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      client: true,
      service: true,
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
      },
      payments: {
        orderBy: { createdAt: "desc" },
      },
      charges: {
        orderBy: { createdAt: "desc" },
      },
      communications: {
        orderBy: { createdAt: "desc" },
      },
      mandateFormSubmission: true,
    },
  });
}

export async function listSupplierApplications() {
  return prisma.application.findMany({
    where: {
      currentStatus: {
        in: supplierVisibleStatuses,
      },
    },
    orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
    include: {
      client: true,
      service: true,
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
      },
      payments: {
        where: {
          status: PaymentStatus.CONFIRMED,
        },
        select: {
          id: true,
        },
      },
      mandateFormSubmission: true,
    },
  });
}

export async function getClientApplicationByToken(publicToken: string) {
  return prisma.application.findUnique({
    where: { publicToken },
    include: {
      client: true,
      service: true,
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
      },
      payments: {
        orderBy: { createdAt: "desc" },
      },
      charges: {
        orderBy: { createdAt: "desc" },
      },
      dispatch: true,
      mandateFormSubmission: true,
    },
  });
}
