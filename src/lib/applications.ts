import {
  ApplicationStatus,
  ChargeStatus,
  ClientEntityType,
  DocumentStatus,
  DocumentType,
  CommunicationDirection,
  CommunicationStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
  SupplierUrgency,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { applicationPipeline } from "@/lib/workflow";

const supplierVisibleStatuses = [
  ApplicationStatus.AT_SUPPLIER,
  ApplicationStatus.SUPPLIER_PRODUCED,
  ApplicationStatus.RETURNING_TO_LICENSE_HUB,
];

const missingApplicationEntityFields = {
  entityDisplayName: null,
  entityRegistrationNumber: null,
  representativeFullName: null,
  representativeCapacity: null,
} as const;

const missingApplicationQuoteFields = {
  quotedAt: null,
  quoteApprovedAt: null,
  quoteVersion: 0,
  popDueAt: null,
  lastPopReminderAt: null,
  popReminderCount: 0,
  autoCancelOnNoPop: true,
} as const;

export type ApplicationDocumentRecord = {
  id: string;
  type: DocumentType;
  fileName: string;
  status: DocumentStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  storageKey: string | null;
  version: number;
};

type ApplicationPaymentRecord = {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  type: PaymentType;
  amount: Prisma.Decimal;
  reference: string;
  checkoutUrl: string | null;
  providerReference: string | null;
};

export type ApplicationChargeRecord = {
  id: string;
  status: ChargeStatus;
  description: string;
  amount: Prisma.Decimal;
};

type ApplicationCommentRecord = {
  id: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

type ApplicationCommunicationRecord = {
  id: string;
  direction: CommunicationDirection;
  recipientName: string;
  recipientAddress: string;
  body: string;
  status: CommunicationStatus;
  createdAt: Date;
  receivedAt: Date | null;
  sentAt: Date | null;
};

type ApplicationStatusHistoryRecord = {
  id: string;
  note: string | null;
  createdAt: Date;
};

type ApplicationClientRecord = {
  firstName: string;
  surname: string;
  cellphone: string;
  email: string;
  entityType: ClientEntityType;
  referralSource: string | null;
};

type ApplicationServiceRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

type ApplicationDispatchRecord = {
  id: string;
};

type ApplicationFormSubmissionRecord = {
  id: string;
  submittedAt: Date;
};

export type ApplicationRecord = {
  id: string;
  publicToken: string;
  clientId: string;
  serviceId: string;
  currentStatus: ApplicationStatus;
  previousStatus: ApplicationStatus | null;
  registrationNumber: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColour: string | null;
  vin: string | null;
  ocrConfidence: Prisma.Decimal | null;
  supplierUrgency: SupplierUrgency;
  submittedAt: Date | null;
  quotedAt: Date | null;
  quoteApprovedAt: Date | null;
  quoteVersion: number;
  popDueAt: Date | null;
  lastPopReminderAt: Date | null;
  popReminderCount: number;
  autoCancelOnNoPop: boolean;
  approvedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  retentionEligibleAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  entityDisplayName: string | null;
  entityRegistrationNumber: string | null;
  representativeFullName: string | null;
  representativeCapacity: string | null;
  client: ApplicationClientRecord;
  service: ApplicationServiceRecord;
  documents: ApplicationDocumentRecord[];
  payments: ApplicationPaymentRecord[];
  charges: ApplicationChargeRecord[];
  communications: ApplicationCommunicationRecord[];
  orderComments: ApplicationCommentRecord[];
  mandateFormSubmission: ApplicationFormSubmissionRecord | null;
  statusHistory: ApplicationStatusHistoryRecord[];
  dispatch: ApplicationDispatchRecord | null;
};

function addMissingApplicationEntityFields<T extends object>(application: T) {
  return {
    ...application,
    ...missingApplicationEntityFields,
    ...missingApplicationQuoteFields,
  };
}

const applicationBaseSelect = {
  id: true,
  publicToken: true,
  clientId: true,
  serviceId: true,
  currentStatus: true,
  previousStatus: true,
  registrationNumber: true,
  vehicleMake: true,
  vehicleModel: true,
  vehicleYear: true,
  vehicleColour: true,
  vin: true,
  ocrConfidence: true,
  supplierUrgency: true,
  submittedAt: true,
  approvedAt: true,
  completedAt: true,
  cancelledAt: true,
  retentionEligibleAt: true,
  createdAt: true,
  updatedAt: true,
};

const applicationClientSelect = {
  firstName: true,
  surname: true,
  cellphone: true,
  email: true,
  entityType: true,
  referralSource: true,
};

const applicationServiceSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
};

const applicationDocumentSelect = {
  id: true,
  type: true,
  fileName: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  storageKey: true,
  version: true,
};

const applicationPaymentSelect = {
  id: true,
  method: true,
  status: true,
  type: true,
  amount: true,
  reference: true,
  checkoutUrl: true,
  providerReference: true,
};

const applicationChargeSelect = {
  id: true,
  status: true,
  description: true,
  amount: true,
};

const applicationCommentSelect = {
  id: true,
  authorName: true,
  body: true,
  createdAt: true,
};

const applicationCommunicationSelect = {
  id: true,
  direction: true,
  recipientName: true,
  recipientAddress: true,
  body: true,
  status: true,
  createdAt: true,
  receivedAt: true,
  sentAt: true,
};

const applicationStatusHistorySelect = {
  id: true,
  note: true,
  createdAt: true,
};

const applicationDispatchSelect = {
  id: true,
};

const applicationMandateFormSubmissionSelect = {
  id: true,
  submittedAt: true,
};

export function statusLabel(status: string) {
  return applicationPipeline.find((stage) => stage.status === status)?.label ?? status.replaceAll("_", " ");
}

export function formatMoney(amount: { toString: () => string }, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(Number(amount.toString()));
}

export async function listAdminApplications(): Promise<ApplicationRecord[]> {
  const rows = await prisma.application.findMany({
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    select: {
      ...applicationBaseSelect,
      client: {
        select: applicationClientSelect,
      },
      service: {
        select: applicationServiceSelect,
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: applicationDocumentSelect,
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: applicationPaymentSelect,
      },
      charges: {
        orderBy: { createdAt: "desc" },
        select: applicationChargeSelect,
      },
      communications: {
        orderBy: { createdAt: "desc" },
        select: applicationCommunicationSelect,
      },
      orderComments: {
        orderBy: { createdAt: "desc" },
        select: applicationCommentSelect,
      },
      mandateFormSubmission: {
        select: applicationMandateFormSubmissionSelect,
      },
      dispatch: {
        select: applicationDispatchSelect,
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: applicationStatusHistorySelect,
      },
    },
  });

  return rows.map((application) => addMissingApplicationEntityFields(application)) as ApplicationRecord[];
}

export async function listSupplierApplications(): Promise<ApplicationRecord[]> {
  const rows = await prisma.application.findMany({
    where: {
      currentStatus: {
        in: supplierVisibleStatuses,
      },
    },
    orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
    select: {
      ...applicationBaseSelect,
      client: {
        select: applicationClientSelect,
      },
      service: {
        select: applicationServiceSelect,
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: applicationDocumentSelect,
      },
      payments: {
        where: {
          status: PaymentStatus.CONFIRMED,
        },
        select: applicationPaymentSelect,
      },
      charges: {
        orderBy: { createdAt: "desc" },
        select: applicationChargeSelect,
      },
      communications: {
        orderBy: { createdAt: "desc" },
        select: applicationCommunicationSelect,
      },
      orderComments: {
        orderBy: { createdAt: "desc" },
        select: applicationCommentSelect,
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: applicationStatusHistorySelect,
      },
      dispatch: {
        select: applicationDispatchSelect,
      },
      mandateFormSubmission: {
        select: applicationMandateFormSubmissionSelect,
      },
    },
  });

  return rows.map((application) => addMissingApplicationEntityFields(application)) as ApplicationRecord[];
}

export async function getClientApplicationByToken(publicToken: string): Promise<ApplicationRecord | null> {
  const application = await prisma.application.findUnique({
    where: { publicToken },
    select: {
      ...applicationBaseSelect,
      client: {
        select: applicationClientSelect,
      },
      service: {
        select: applicationServiceSelect,
      },
      documents: {
        orderBy: [{ type: "asc" }, { version: "desc" }],
        select: applicationDocumentSelect,
      },
      payments: {
        orderBy: { createdAt: "desc" },
        select: applicationPaymentSelect,
      },
      charges: {
        orderBy: { createdAt: "desc" },
        select: applicationChargeSelect,
      },
      communications: {
        orderBy: { createdAt: "desc" },
        select: applicationCommunicationSelect,
      },
      orderComments: {
        orderBy: { createdAt: "desc" },
        select: applicationCommentSelect,
      },
      dispatch: {
        select: applicationDispatchSelect,
      },
      mandateFormSubmission: {
        select: applicationMandateFormSubmissionSelect,
      },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: applicationStatusHistorySelect,
      },
    },
  });

  return application ? (addMissingApplicationEntityFields(application) as ApplicationRecord) : null;
}
