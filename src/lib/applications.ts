import {
  ApplicationStatus,
  ChargeStatus,
  ClientEntityType,
  CommunicationChannel,
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
  requirementKey: string | null;
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
  errorMessage: string | null;
  createdAt: Date;
  receivedAt: Date | null;
  sentAt: Date | null;
  adminSeenAt: Date | null;
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
  referralSource: string | null;
  referralContact: string | null;
  sendCompletedDocumentsToReferrer: boolean;
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

type ApplicationAdminListRecord = Omit<ApplicationRecord, "charges" | "orderComments" | "statusHistory" | "dispatch" | "mandateFormSubmission">;
type ApplicationSupplierListRecord = Omit<
  ApplicationRecord,
  "documents" | "payments" | "charges" | "communications" | "orderComments" | "statusHistory" | "dispatch" | "mandateFormSubmission"
>;

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
  referralSource: true,
  referralContact: true,
  sendCompletedDocumentsToReferrer: true,
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
  requirementKey: true,
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

const applicationAdminCommunicationSelect = {
  id: true,
  direction: true,
  recipientName: true,
  recipientAddress: true,
  body: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  receivedAt: true,
  sentAt: true,
  adminSeenAt: true,
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
  errorMessage: true,
  createdAt: true,
  receivedAt: true,
  sentAt: true,
  adminSeenAt: true,
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

const applicationDocumentOrderBy: Prisma.DocumentOrderByWithRelationInput[] = [
  { type: "asc" },
  { version: "desc" },
];

const applicationCreatedAtDescOrderBy = { createdAt: "desc" } as const;
const applicationSubmittedAtDescOrderBy = [{ submittedAt: "desc" }, { createdAt: "desc" }] as Prisma.ApplicationOrderByWithRelationInput[];
const applicationApprovedAtAscOrderBy = [{ approvedAt: "asc" }, { createdAt: "asc" }] as Prisma.ApplicationOrderByWithRelationInput[];

const applicationAdminListSelect = {
  ...applicationBaseSelect,
  client: {
    select: applicationClientSelect,
  },
  service: {
    select: applicationServiceSelect,
  },
  documents: {
    orderBy: applicationDocumentOrderBy,
    select: applicationDocumentSelect,
  },
  payments: {
    orderBy: applicationCreatedAtDescOrderBy,
    take: 1,
    select: applicationPaymentSelect,
  },
  communications: {
    where: {
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.INBOUND,
      status: CommunicationStatus.RECEIVED,
    },
    orderBy: applicationCreatedAtDescOrderBy,
    take: 1,
    select: applicationAdminCommunicationSelect,
  },
};

const applicationAdminDetailSelect = {
  ...applicationBaseSelect,
  client: {
    select: applicationClientSelect,
  },
  service: {
    select: applicationServiceSelect,
  },
  documents: {
    orderBy: applicationDocumentOrderBy,
    select: applicationDocumentSelect,
  },
  payments: {
    orderBy: applicationCreatedAtDescOrderBy,
    select: applicationPaymentSelect,
  },
  charges: {
    orderBy: applicationCreatedAtDescOrderBy,
    select: applicationChargeSelect,
  },
  communications: {
    orderBy: applicationCreatedAtDescOrderBy,
    select: applicationCommunicationSelect,
  },
  orderComments: {
    orderBy: applicationCreatedAtDescOrderBy,
    select: applicationCommentSelect,
  },
  mandateFormSubmission: {
    select: applicationMandateFormSubmissionSelect,
  },
  statusHistory: {
    orderBy: applicationCreatedAtDescOrderBy,
    take: 12,
    select: applicationStatusHistorySelect,
  },
  dispatch: {
    select: applicationDispatchSelect,
  },
};

const applicationSupplierListSelect = {
  ...applicationBaseSelect,
  client: {
    select: applicationClientSelect,
  },
  service: {
    select: applicationServiceSelect,
  },
};

const applicationSupplierDetailSelect = {
  ...applicationBaseSelect,
  client: {
    select: applicationClientSelect,
  },
  service: {
    select: applicationServiceSelect,
  },
  documents: {
    where: {
      type: { not: DocumentType.PROOF_OF_EFT_PAYMENT },
    },
    orderBy: applicationDocumentOrderBy,
    select: applicationDocumentSelect,
  },
  orderComments: {
    orderBy: applicationCreatedAtDescOrderBy,
    select: applicationCommentSelect,
  },
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

export async function listAdminApplications(): Promise<ApplicationAdminListRecord[]> {
  const now = new Date();
  const rows = await prisma.application.findMany({
    where: {
      OR: [{ retentionEligibleAt: null }, { retentionEligibleAt: { gt: now } }],
    },
    orderBy: applicationSubmittedAtDescOrderBy,
    select: applicationAdminListSelect,
  });

  return rows.map((application) => addMissingApplicationEntityFields(application)) as ApplicationAdminListRecord[];
}

export async function getAdminApplicationById(applicationId: string): Promise<ApplicationRecord | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: applicationAdminDetailSelect,
  });

  return application ? (addMissingApplicationEntityFields(application) as ApplicationRecord) : null;
}

export async function listSupplierApplications(): Promise<ApplicationSupplierListRecord[]> {
  const rows = await prisma.application.findMany({
    where: {
      currentStatus: {
        in: supplierVisibleStatuses,
      },
    },
    orderBy: applicationApprovedAtAscOrderBy,
    select: applicationSupplierListSelect,
  });

  return rows.map((application) => addMissingApplicationEntityFields(application)) as ApplicationSupplierListRecord[];
}

export async function getSupplierApplicationById(applicationId: string): Promise<ApplicationRecord | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: applicationSupplierDetailSelect,
  });

  return application ? (addMissingApplicationEntityFields(application) as ApplicationRecord) : null;
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
        orderBy: applicationDocumentOrderBy,
        select: applicationDocumentSelect,
      },
      payments: {
        orderBy: applicationCreatedAtDescOrderBy,
        select: applicationPaymentSelect,
      },
      charges: {
        orderBy: applicationCreatedAtDescOrderBy,
        select: applicationChargeSelect,
      },
      communications: {
        orderBy: applicationCreatedAtDescOrderBy,
        select: applicationCommunicationSelect,
      },
      orderComments: {
        orderBy: applicationCreatedAtDescOrderBy,
        select: applicationCommentSelect,
      },
      dispatch: {
        select: applicationDispatchSelect,
      },
      mandateFormSubmission: {
        select: applicationMandateFormSubmissionSelect,
      },
      statusHistory: {
        orderBy: applicationCreatedAtDescOrderBy,
        take: 12,
        select: applicationStatusHistorySelect,
      },
    },
  });

  return application ? (addMissingApplicationEntityFields(application) as ApplicationRecord) : null;
}
