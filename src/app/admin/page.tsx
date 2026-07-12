import Link from "next/link";

import { AddChargeActionForm } from "@/components/add-charge-action-form";
import { AdminApplicationCell } from "@/components/admin-application-cell";
import { AdminWhatsappComposer } from "@/components/admin-whatsapp-composer";
import { AdminRefreshController } from "@/components/admin-refresh-controller";
import { AdminSeenOrders } from "@/components/admin-seen-orders";
import { AdminDocumentQuickView } from "@/components/admin-document-quick-view";
import { AdminDocumentUploadForm } from "@/components/admin-document-upload-form";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DatabaseSetup } from "@/components/database-setup";
import { ResubmissionActionForm } from "@/components/resubmission-action-form";
import { SettingsActionButton as PendingActionButton } from "@/components/settings-action-button";
import {
  CommunicationChannel,
  CommunicationDirection,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  SupplierUrgency,
} from "@/generated/prisma/client";
import type { ApplicationChargeRecord, ApplicationDocumentRecord } from "@/lib/applications";
import { formatMoney, getAdminApplicationById, listAdminApplications, statusLabel } from "@/lib/applications";
import { whatsappTemplates } from "@/lib/communications";
import { documentHref, documentLabel, documentTypeDescriptions } from "@/lib/documents";
import {
  clientEntityTypeLabels,
  documentRequirementsForEntityType,
  supportingDocumentForRequirement,
  supportingRequirementForDocument,
  supportingRequirementsForEntityType,
} from "@/lib/entity-requirements";
import {
  approveToSupplier,
  cancelApplication,
  deleteApplication,
  confirmEftPayment,
  adminUploadDocument,
  acceptDocument,
  markDocumentPending,
  acceptAllPendingDocuments,
  markDispatched,
  markDocumentReturned,
  rejectDocument,
  requestResubmission,
  raiseAdditionalCharge,
  resendClientStatusLink,
  sendClientMessage,
  publishAdminQuote,
  updateSupplierHandoff,
} from "@/lib/workflow-actions";
import { prisma } from "@/lib/prisma";
import { isPaystackConfigured } from "@/lib/paystack";
import { logout } from "@/lib/auth-actions";

const dayInMs = 1000 * 60 * 60 * 24;

export const dynamic = "force-dynamic";

type AdminSearchParams = {
  application?: string;
  q?: string;
  status?: string;
  payment?: string;
  documents?: string;
  urgency?: string;
  service?: string;
  view?: string;
};

const adminDetailViews = ["overview", "documents", "payment", "supplier", "messages", "audit"] as const;
type AdminDetailView = (typeof adminDetailViews)[number];

const whatsappReplyWindowMs = 24 * 60 * 60 * 1000;

const paymentFollowUpSummaries = ["EFT pending", "Paystack pending", "Additional charge pending"];
const terminalPaymentStatuses = new Set(["CANCELLED", "DISPATCHED"]);

function paymentSummary(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  if (terminalPaymentStatuses.has(application.currentStatus)) {
    return statusLabel(application.currentStatus);
  }

  const latestPayment = application.payments[0];

  if (!latestPayment) {
    if (
      application.currentStatus === "AWAITING_ADMIN_QUOTE" ||
      application.currentStatus === "QUOTE_PENDING_CLIENT_APPROVAL"
    ) {
      return "Quote pending";
    }

    return "Not started";
  }

  if (latestPayment.status === PaymentStatus.CONFIRMED) {
    return "Confirmed";
  }

  if (latestPayment.status !== PaymentStatus.PENDING) {
    return latestPayment.status.toLowerCase();
  }

  if (latestPayment.type === PaymentType.ADDITIONAL_CHARGE) {
    return "Additional charge pending";
  }

  if (latestPayment.method === PaymentMethod.PAYSTACK) {
    return "Paystack pending";
  }

  return "EFT pending";
}

function needsPaymentFollowUp(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  return !terminalPaymentStatuses.has(application.currentStatus) && paymentFollowUpSummaries.includes(paymentSummary(application));
}

function hasUnseenWhatsappReply(
  application: Awaited<ReturnType<typeof listAdminApplications>>[number],
  selectedApplicationId?: string,
  selectedView?: AdminDetailView,
) {
  if (application.id === selectedApplicationId && selectedView === "messages") {
    return false;
  }

  return application.communications.some(
    (message) =>
      message.direction === CommunicationDirection.INBOUND &&
      message.status === "RECEIVED" &&
      message.adminSeenAt == null,
  );
}

function lastInboundWhatsappAt(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  return application.communications.find(
    (message) => message.direction === CommunicationDirection.INBOUND && message.status === "RECEIVED",
  )?.receivedAt ?? null;
}

function isWhatsappFreeReplyAvailable(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const lastInboundAt = lastInboundWhatsappAt(application);

  if (!lastInboundAt) {
    return false;
  }

  return Date.now() - lastInboundAt.getTime() <= whatsappReplyWindowMs;
}

function workflowStatusSummary(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const isDuplicateCertificate = application.service.slug === "duplicate-certificate";
  const isAwaitingEftVerification =
    application.currentStatus === "QUOTE_APPROVED_AWAITING_PAYMENT" ||
    application.currentStatus === "ADDITIONAL_CHARGE_RAISED";
  const latestPayment = application.payments[0];

  if (isDuplicateCertificate && isAwaitingEftVerification) {
    if (latestPayment?.method === PaymentMethod.PAYSTACK) {
      return latestPayment.status === PaymentStatus.CONFIRMED ? "Paystack confirmed" : "Paystack pending";
    }

    const hasEftProof = application.documents.some(
      (document: ApplicationDocumentRecord) => document.type === DocumentType.PROOF_OF_EFT_PAYMENT,
    );
    if (application.currentStatus === "ADDITIONAL_CHARGE_RAISED") {
      return hasEftProof ? "Verify additional charge" : "Additional charge pending";
    }
    return hasEftProof ? "Verify payment" : "Pending payment";
  }

  if (application.currentStatus === "ADDITIONAL_CHARGE_RAISED") {
    return latestPayment?.status === PaymentStatus.CONFIRMED ? "Additional charge confirmed" : "Additional charge pending";
  }

  return statusLabel(application.currentStatus);
}

function documentSummary(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const requirements = documentRequirementsForEntityType(application.client.entityType).filter(
    (requirement) => requirement.confirmedForUpload,
  );
  const requirementStates = requirements.map((requirement) => {
    return documentRequirementStatus(requirement, application);
  });

  const rejected = requirementStates.filter((status) => status === "REJECTED").length;
  const pendingReview = requirementStates.filter((status) => status === "PENDING").length;
  const missing = requirementStates.filter((status) => status === "MISSING").length;

  if (rejected > 0) {
    return `${rejected} rejected`;
  }

  if (missing > 0) {
    return `${missing} missing`;
  }

  if (pendingReview > 0) {
    return `${pendingReview} uploaded - pending review`;
  }

  return "Accepted";
}

function documentFilterValue(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const summary = documentSummary(application);

  if (summary === "Accepted") {
    return "accepted";
  }

  if (summary.includes("rejected")) {
    return "rejected";
  }

  if (summary.includes("missing") || summary.includes("pending review")) {
    return "pending";
  }

  return "pending";
}

function documentStatusClass(status: string) {
  if (status === "ACCEPTED") {
    return "text-[#1f7a4d]";
  }

  if (status === "REJECTED") {
    return "text-[#b3261e]";
  }

  return "text-[#8a6a2a]";
}

function urgencyMarker(urgency: SupplierUrgency) {
  if (urgency === SupplierUrgency.VERY_URGENT) {
    return "!!";
  }

  if (urgency === SupplierUrgency.URGENT) {
    return "!";
  }

  return "";
}

function urgencyLabel(urgency: SupplierUrgency) {
  if (urgency === SupplierUrgency.VERY_URGENT) {
    return "Very urgent";
  }

  if (urgency === SupplierUrgency.URGENT) {
    return "Urgent";
  }

  return "Normal";
}

function formatDocumentStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function formatRequirementStatus(status: string) {
  if (status === "MISSING") {
    return "Missing";
  }

  if (status === "PENDING") {
    return "Uploaded - pending review";
  }

  if (status === "ACCEPTED") {
    return "Accepted";
  }

  if (status === "REJECTED") {
    return "Rejected";
  }

  return formatDocumentStatus(status);
}

function documentRequirementStatus(
  requirement: ReturnType<typeof documentRequirementsForEntityType>[number],
  application: Awaited<ReturnType<typeof listAdminApplications>>[number],
) {
  if (!requirement.documentType) {
    return supportingDocumentForRequirement(
      requirement.key,
      application.client.entityType,
      application.documents,
    )?.status ?? "MISSING";
  }

  const latestDocument = application.documents.find(
    (document: ApplicationDocumentRecord) => document.type === requirement.documentType,
  );

  return latestDocument?.status ?? "MISSING";
}

function supportingDocumentLabel(
  document: Awaited<ReturnType<typeof listAdminApplications>>[number]["documents"][number],
  application: Awaited<ReturnType<typeof listAdminApplications>>[number],
) {
  if (document.type !== "OTHER") {
    return documentLabel(document.type, document.fileName);
  }

  const requirementForIndex = supportingRequirementForDocument(
    document,
    application.client.entityType,
    application.documents,
  );

  return requirementForIndex?.label ?? documentLabel(document.type, document.fileName);
}

function approvalBlockReason(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const incompleteRequirement = documentRequirementsForEntityType(application.client.entityType)
    .filter((requirement) => requirement.confirmedForUpload)
    .find((requirement) => {
      return documentRequirementStatus(requirement, application) !== "ACCEPTED";
    });

  if (incompleteRequirement) {
    return `${incompleteRequirement.label} must be uploaded and accepted before approval.`;
  }

  return null;
}

function ageSummary(createdAt: Date) {
  const days = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / dayInMs));
  return days === 1 ? "1 day" : `${days} days`;
}

type AdminChecklistItem = {
  label: string;
  pass: boolean;
  detail: string;
  scope: "Required" | "Conditional";
};

function adminChecklist(
  application: Awaited<ReturnType<typeof listAdminApplications>>[number],
) : AdminChecklistItem[] {
  const latestPayment = application.payments[0] ?? null;
  const requiredRequirements = documentRequirementsForEntityType(application.client.entityType).filter(
    (requirement) => requirement.confirmedForUpload,
  );
  const allRequiredDocsAccepted = requiredRequirements.every(
    (requirement) => documentRequirementStatus(requirement, application) === "ACCEPTED",
  );
  const paymentConfirmed = latestPayment?.status === PaymentStatus.CONFIRMED;
  const entityFieldsRequired =
    application.client.entityType === "COMPANY_OR_TRUST" || application.client.entityType === "DECEASED_ESTATE";
  const entityFieldsPresent = entityFieldsRequired
    ? Boolean(
        application.entityDisplayName &&
          application.entityRegistrationNumber &&
          application.representativeFullName &&
          application.representativeCapacity,
      )
    : true;

  const paymentItems: AdminChecklistItem[] =
    latestPayment?.method === PaymentMethod.PAYSTACK
      ? [
          {
            label: latestPayment?.type === PaymentType.ADDITIONAL_CHARGE ? "Additional charge confirmed" : "Paystack payment confirmed",
            pass: paymentConfirmed,
            detail: paymentConfirmed
              ? latestPayment?.type === PaymentType.ADDITIONAL_CHARGE
                ? "Additional charge payment confirmed automatically."
                : "Paystack payment confirmed automatically."
              : latestPayment?.type === PaymentType.ADDITIONAL_CHARGE
                ? "Awaiting additional charge confirmation."
                : "Awaiting Paystack confirmation.",
            scope: "Required",
          },
        ]
      : [
          {
            label: latestPayment?.type === PaymentType.ADDITIONAL_CHARGE ? "Additional charge proof uploaded" : "EFT proof uploaded",
            pass: application.documents.some(
              (document: ApplicationDocumentRecord) => document.type === "PROOF_OF_EFT_PAYMENT",
            ),
            detail: application.documents.some(
              (document: ApplicationDocumentRecord) => document.type === "PROOF_OF_EFT_PAYMENT",
            )
              ? "Proof of EFT document found."
              : "No proof of EFT payment uploaded yet.",
            scope: "Required",
          },
          {
            label: latestPayment?.type === PaymentType.ADDITIONAL_CHARGE ? "Additional charge payment confirmed" : "EFT payment confirmed",
            pass: paymentConfirmed,
            detail: paymentConfirmed
              ? latestPayment?.type === PaymentType.ADDITIONAL_CHARGE
                ? "Additional charge confirmed by admin."
                : "Payment confirmed by admin."
              : latestPayment?.type === PaymentType.ADDITIONAL_CHARGE
                ? "Awaiting admin additional charge confirmation."
                : "Awaiting admin EFT confirmation.",
            scope: "Required",
          },
        ];

  return [
    ...paymentItems,
    {
      label: "Required documents accepted",
      pass: allRequiredDocsAccepted,
      detail: allRequiredDocsAccepted ? "All required documents are accepted." : "One or more required documents are missing, pending, or rejected.",
      scope: "Required",
    },
    {
      label: "Entity details complete",
      pass: entityFieldsPresent,
      detail: entityFieldsPresent
        ? "Entity/representative details are complete for this flow."
        : "Entity/representative details are incomplete.",
      scope: entityFieldsRequired ? "Required" : "Conditional",
    },
  ];
}

function textParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function adminHref(params: Record<string, string>, updates: Record<string, string | undefined>, hash?: string) {
  const next = new URLSearchParams();

  Object.entries({ ...params, ...updates }).forEach(([key, value]) => {
    if (value) {
      next.set(key, value);
    }
  });

  const query = next.toString();
  const suffix = hash ? `#${hash}` : "";
  return query ? `/admin?${query}${suffix}` : `/admin${suffix}`;
}

function adminViewParam(value: string): AdminDetailView {
  return adminDetailViews.includes(value as AdminDetailView) ? (value as AdminDetailView) : "overview";
}

function matchesSearch(application: Awaited<ReturnType<typeof listAdminApplications>>[number], query: string) {
  if (!query) {
    return true;
  }

  const search = query.toLowerCase();

  return [
    application.id,
    application.client.firstName,
    application.client.surname,
    application.client.cellphone,
    application.client.email,
    application.service.name,
    application.registrationNumber,
    application.vin,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function adminActions(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const actions: {
    label: string;
    action: (formData: FormData) => void | Promise<void>;
    variant: "primary" | "secondary" | "quiet" | "danger";
    message: string;
    type?: "resubmission";
    title?: string;
    confirmLabel?: string;
    confirmationCheckboxLabel?: string;
  }[] = [];

  if (
    (application.currentStatus === "QUOTE_APPROVED_AWAITING_PAYMENT" || application.currentStatus === "ADDITIONAL_CHARGE_RAISED") &&
    application.payments.some((payment) => payment.method === "EFT" && payment.status === PaymentStatus.PENDING)
  ) {
    actions.push({
      label: "Confirm EFT",
      action: confirmEftPayment,
      variant: "primary",
      message: `Confirm that funds have been received for ${application.id}?`,
    });
  }

  if (application.currentStatus === "PENDING_REVIEW" || application.currentStatus === "DOCUMENTS_RESUBMIT_REQUIRED") {
    if (!approvalBlockReason(application)) {
      actions.push({
        label: "Approve",
        action: approveToSupplier,
        variant: "primary",
        message: `Approve ${application.id} and send it to the supplier?`,
      });
    }
  }

  if (application.currentStatus === "PENDING_REVIEW") {
    actions.push({
      label: "Resubmit",
      action: requestResubmission,
      variant: "secondary",
      message: `Request document resubmission for ${application.id}?`,
      type: "resubmission",
    });
  }

  if (application.currentStatus === "RETURNING_TO_LICENSE_HUB" || application.currentStatus === "SUPPLIER_PRODUCED") {
    actions.push({
      label: "Returned",
      action: markDocumentReturned,
      variant: "primary",
      message: `Confirm the physical document for ${application.id} has returned to The License Hub?`,
    });
  }

  if (application.currentStatus === "DOCUMENT_RETURNED") {
    actions.push({
      label: "Dispatch",
      action: markDispatched,
      variant: "primary",
      message: `Mark ${application.id} as dispatched?`,
    });
  }

  if (application.currentStatus !== "DISPATCHED" && application.currentStatus !== "CANCELLED") {
    actions.push({
      label: "Cancel",
      action: cancelApplication,
      variant: "quiet",
      message: `Cancel ${application.id}? This will remove it from the active workflow.`,
    });
  }

  actions.push({
    label: "Delete",
    action: deleteApplication,
    variant: "danger",
    title: "Delete application",
    confirmLabel: "Proceed",
    confirmationCheckboxLabel: "I understand this will permanently delete the application and all stored documents.",
    message: "Are you sure you want to completely delete this record?",
  });

  return actions;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const [applications, retentionSetting] = await Promise.all([
    listAdminApplications().catch((error: unknown) => {
      console.error(error);
      return null;
    }),
    prisma.retentionSetting
      .findUnique({
        where: { id: "default" },
        select: { adminAutoRefreshEnabled: true, adminRefreshIntervalSeconds: true },
      })
      .catch(() => null),
  ]);
  const paystackEnabled = isPaystackConfigured();

  if (!applications) {
    return <DatabaseSetup message="Admin applications could not be loaded from PostgreSQL." />;
  }

  const resolvedSearchParams = await searchParams;
  const selectedApplicationId = textParam(resolvedSearchParams.application);
  const query = textParam(resolvedSearchParams.q).trim();
  const statusFilter = textParam(resolvedSearchParams.status);
  const paymentFilter = textParam(resolvedSearchParams.payment);
  const documentsFilter = textParam(resolvedSearchParams.documents);
  const urgencyFilter = textParam(resolvedSearchParams.urgency);
  const serviceFilter = textParam(resolvedSearchParams.service);
  const selectedView = adminViewParam(textParam(resolvedSearchParams.view));
  const serviceOptions = Array.from(new Set(applications.map((application) => application.service.name))).sort();
  const filteredApplications = applications.filter((application) => {
    if (!matchesSearch(application, query)) {
      return false;
    }

    if (statusFilter && application.currentStatus !== statusFilter) {
      return false;
    }

    if (paymentFilter) {
      const paymentBucket = paymentSummary(application);
      const paymentFilterValue = paymentBucket.toLowerCase().replace(/\s+/g, "-");

      if (paymentFilter === "payment-follow-up" && !needsPaymentFollowUp(application)) {
        return false;
      }

      if (paymentFilter !== "payment-follow-up" && paymentFilterValue !== paymentFilter) {
        return false;
      }
    }

    if (documentsFilter && documentFilterValue(application) !== documentsFilter) {
      return false;
    }

    if (urgencyFilter && application.supplierUrgency !== urgencyFilter) {
      return false;
    }

    if (serviceFilter && application.service.name !== serviceFilter) {
      return false;
    }

    return true;
  });
  const adminRefreshIntervalSeconds = retentionSetting?.adminRefreshIntervalSeconds ?? 30;
  const adminAutoRefreshEnabled = retentionSetting?.adminAutoRefreshEnabled ?? true;

  if (applications.length === 0) {
    return (
      <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
        <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8">
          <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Link href="/" className="text-sm font-medium text-[#6b5e4f]">
                Back
              </Link>
              <h1 className="mt-4 text-3xl font-semibold">Admin Workspace</h1>
              <p className="mt-2 text-sm text-[#52615b]">
                Review documents, confirm payments, raise charges, approve orders, and dispatch returns.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <AdminRefreshController enabled={adminAutoRefreshEnabled} intervalSeconds={adminRefreshIntervalSeconds} />
              <Link
                className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]"
                href="/admin/clients"
              >
                Clients
              </Link>
              <Link
                className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]"
                href="/admin/settings"
              >
                Settings
              </Link>
              <form action={logout}>
                <button className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]">
                  Logout
                </button>
              </form>
            </div>
          </header>

          <section className="mt-6 border border-[#d8d1c3] bg-white p-6 text-sm text-[#52615b]">
            No applications found. Start a new client application to populate this workspace.
          </section>
        </div>
      </main>
    );
  }

  const selectedApplicationSummary =
    applications.find((application) => application.id === selectedApplicationId) ?? filteredApplications[0] ?? applications[0];
  const selectedApplication = await getAdminApplicationById(selectedApplicationSummary.id).catch((error: unknown) => {
    console.error(error);
    return null;
  });

  if (!selectedApplication) {
    return <DatabaseSetup message="The selected application could not be loaded from PostgreSQL." />;
  }

  const baseAdminParams = {
    q: query,
    status: statusFilter,
    payment: paymentFilter,
    documents: documentsFilter,
    urgency: urgencyFilter,
    service: serviceFilter,
    application: selectedApplication.id,
    view: selectedView,
  };

  if (selectedView === "messages") {
    await prisma.communication.updateMany({
      where: {
        applicationId: selectedApplication.id,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.INBOUND,
        adminSeenAt: null,
      },
      data: {
        adminSeenAt: new Date(),
      },
    });
  }

  const queueCards = [
    {
      label: "Needs quote",
      count: applications.filter((application) => application.currentStatus === "AWAITING_ADMIN_QUOTE").length,
      href: adminHref(baseAdminParams, { status: "AWAITING_ADMIN_QUOTE", payment: undefined, documents: undefined }),
    },
    {
      label: "Payment follow-up",
      count: applications.filter((application) => needsPaymentFollowUp(application)).length,
      href: adminHref(baseAdminParams, { payment: "payment-follow-up", status: undefined, documents: undefined }),
    },
    {
      label: "Document review",
      count: applications.filter((application) => documentFilterValue(application) === "pending").length,
      href: adminHref(baseAdminParams, { documents: "pending", status: undefined, payment: undefined, view: "documents" }),
    },
    {
      label: "Ready to approve",
      count: applications.filter(
        (application) => application.currentStatus === "PENDING_REVIEW" && !approvalBlockReason(application),
      ).length,
      href: adminHref(baseAdminParams, { status: "PENDING_REVIEW", documents: "accepted", payment: undefined }),
    },
    {
      label: "At supplier",
      count: applications.filter((application) => application.currentStatus === "AT_SUPPLIER").length,
      href: adminHref(baseAdminParams, { status: "AT_SUPPLIER", payment: undefined, documents: undefined, view: "supplier" }),
    },
    {
      label: "Returning",
      count: applications.filter((application) => application.currentStatus === "RETURNING_TO_LICENSE_HUB").length,
      href: adminHref(baseAdminParams, {
        status: "RETURNING_TO_LICENSE_HUB",
        payment: undefined,
        documents: undefined,
        view: "supplier",
      }),
    },
  ];
  const selectedApprovalBlockReason = approvalBlockReason(selectedApplication);
  const selectedPendingDocumentCount = selectedApplication.documents.filter(
    (document: ApplicationDocumentRecord) => document.status === "PENDING",
  ).length;
  const selectedPendingCharges = selectedApplication.charges.filter(
    (charge: ApplicationChargeRecord) => charge.status === "PENDING",
  );
  const selectedChecklist = adminChecklist(selectedApplication);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <AdminSeenOrders
        orders={applications.map((application) => ({
          id: application.id,
          createdAt: application.createdAt.toISOString(),
        }))}
      />
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-medium text-[#6b5e4f]">
              Back
            </Link>
            <h1 className="mt-4 text-3xl font-semibold">Admin Workspace</h1>
            <p className="mt-2 text-sm text-[#52615b]">
              Review documents, confirm payments, raise charges, approve orders, and dispatch returns.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminRefreshController enabled={adminAutoRefreshEnabled} intervalSeconds={adminRefreshIntervalSeconds} />
            <Link
              className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]"
              href="/admin/clients"
            >
              Clients
            </Link>
            <Link
              className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]"
              href="/admin/settings"
            >
              Settings
            </Link>
            <form action={logout}>
              <button className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]">
                Logout
              </button>
            </form>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {queueCards.map((queue) => (
            <Link
              key={queue.label}
              href={queue.href}
              className="border border-[#d8d1c3] bg-white p-4 transition hover:border-[#8a6a2a] hover:bg-[#fffdf8]"
            >
              <span className="block text-2xl font-semibold">{queue.count}</span>
              <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-[#6b5e4f]">
                {queue.label}
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-6 border border-[#d8d1c3] bg-white p-4">
          <form
            key={[query, statusFilter, paymentFilter, documentsFilter, urgencyFilter, serviceFilter].join("|")}
            className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_auto_auto] lg:items-end"
          >
            <label className="text-sm font-semibold">
              Search
              <input
                name="q"
                defaultValue={query}
                placeholder="Application, client, phone, email, reg, VIN"
                className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Status
              <select name="status" defaultValue={statusFilter} className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal">
                <option value="">All</option>
                <option value="AWAITING_ADMIN_QUOTE">Awaiting Admin Quote</option>
                <option value="QUOTE_PENDING_CLIENT_APPROVAL">Quote Pending Approval</option>
                <option value="QUOTE_APPROVED_AWAITING_PAYMENT">Quote Approved Awaiting Payment</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="DOCUMENTS_RESUBMIT_REQUIRED">Resubmit Required</option>
                <option value="AT_SUPPLIER">At Supplier</option>
                <option value="SUPPLIER_PRODUCED">Supplier Produced</option>
                <option value="RETURNING_TO_LICENSE_HUB">Returning</option>
                <option value="DOCUMENT_RETURNED">Returned</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Payment
              <select name="payment" defaultValue={paymentFilter} className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal">
                <option value="">All</option>
                <option value="confirmed">Confirmed</option>
                <option value="payment-follow-up">Payment follow-up</option>
                <option value="eft-pending">EFT pending</option>
                <option value="paystack-pending">Paystack pending</option>
                <option value="quote-pending">Quote pending</option>
                <option value="not-started">Not started</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Documents
              <select name="documents" defaultValue={documentsFilter} className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal">
                <option value="">All</option>
                <option value="pending">Missing or pending review</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Urgency
              <select name="urgency" defaultValue={urgencyFilter} className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal">
                <option value="">All</option>
                <option value={SupplierUrgency.NORMAL}>Normal</option>
                <option value={SupplierUrgency.URGENT}>Urgent</option>
                <option value={SupplierUrgency.VERY_URGENT}>Very urgent</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Service
              <select name="service" defaultValue={serviceFilter} className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal">
                <option value="">All</option>
                {serviceOptions.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>
            <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
              Filter
            </button>
            <Link href="/admin" className="border border-[#d8d1c3] px-4 py-2 text-center text-sm font-semibold text-[#52615b]">
              Clear
            </Link>
          </form>
          <p className="mt-3 text-xs font-semibold text-[#6b5e4f]">
            Showing {filteredApplications.length} of {applications.length} applications.
          </p>
        </section>

        <section className="mt-6 overflow-hidden border border-[#d8d1c3] bg-white">
          <div className="grid grid-cols-[0.9fr_1fr_1fr_1.4fr_0.7fr_1.35fr] border-b border-[#d8d1c3] bg-[#fffdf8] px-4 py-3 text-xs font-semibold uppercase text-[#6b5e4f]">
            <span>Application</span>
            <span>Client</span>
            <span>Service</span>
            <span>Next action</span>
            <span>Age</span>
            <span>Actions</span>
          </div>
          {filteredApplications.map((application) => (
            <div
              key={application.id}
              data-admin-order-created-at={application.createdAt.toISOString()}
              data-admin-order-id={application.id}
              data-admin-order-selected={application.id === selectedApplication.id}
              className={[
                "grid grid-cols-[0.9fr_1fr_1fr_1.4fr_0.7fr_1.35fr] items-center gap-2 border-b border-[#eee8dc] px-4 py-4 text-sm last:border-b-0",
                application.id === selectedApplication.id ? "bg-[#fff8df]" : "",
              ].join(" ")}
            >
              <AdminApplicationCell applicationId={application.id} className="font-semibold">
                {application.id}
                {urgencyMarker(application.supplierUrgency) ? (
                  <span className="ml-2 font-black text-[#b3261e]" title={urgencyLabel(application.supplierUrgency)}>
                    {urgencyMarker(application.supplierUrgency)}
                  </span>
                ) : null}
              </AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>
                {application.client.firstName} {application.client.surname}
              </AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>{application.service.name}</AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id} className="space-y-1">
                <span className="block font-semibold">{workflowStatusSummary(application)}</span>
                <span className="block text-xs text-[#6b5e4f]">
                  {paymentSummary(application)} · {documentSummary(application)}
                </span>
              </AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>{ageSummary(application.createdAt)}</AdminApplicationCell>
              <span className="flex flex-wrap gap-2">
                {hasUnseenWhatsappReply(application, selectedApplication.id, selectedView) ? (
                  <Link
                    href={adminHref(baseAdminParams, { application: application.id, view: "messages" }, "messages")}
                    className="inline-flex items-center gap-1 border border-[#128c7e] bg-[#e7f7ef] px-2 py-1 text-xs font-semibold text-[#075e54]"
                    title="View new WhatsApp message"
                  >
                    <span aria-hidden="true" className="text-sm leading-none">
                      ●
                    </span>
                    View new WhatsApp message
                  </Link>
                ) : null}
                {adminActions(application).map((item) =>
                  item.type === "resubmission" ? (
                    <ResubmissionActionForm
                      key={item.label}
                      action={requestResubmission}
                      applicationId={application.id}
                      clientFirstName={application.client.firstName}
                      documents={application.documents.map((document: ApplicationDocumentRecord) => ({
                        id: document.id,
                        label: documentLabel(document.type, document.fileName),
                        currentReason: document.rejectionReason,
                      }))}
                      className="border border-[#8a6a2a] px-2 py-1 text-xs font-semibold text-[#6b5e4f]"
                    />
                  ) : (
                    <ConfirmActionForm
                      key={item.label}
                      action={item.action}
                      applicationId={application.id}
                      message={item.message}
                      title={item.title}
                      confirmLabel={item.confirmLabel}
                      confirmationCheckboxLabel={item.confirmationCheckboxLabel}
                      destructive={item.variant === "danger"}
                      className={[
                        "border px-2 py-1 text-xs font-semibold",
                        item.variant === "primary"
                          ? "border-[#1f2724] bg-[#1f2724] text-white"
                          : item.variant === "secondary"
                            ? "border-[#8a6a2a] text-[#6b5e4f]"
                            : item.variant === "danger"
                              ? "border-[#b3261e] bg-[#fff1ef] text-[#b3261e]"
                              : "border-[#d8d1c3] text-[#6b5e4f]",
                      ].join(" ")}
                    >
                      {item.label}
                    </ConfirmActionForm>
                  ),
                )}
              </span>
            </div>
          ))}
          {filteredApplications.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[#52615b]">No applications match these filters.</div>
          ) : null}
        </section>

        <section className="mt-6">
          <div className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">Selected Review</h2>
            <p className="mt-1 text-sm text-[#52615b]">
              {selectedApplication.id} · {selectedApplication.client.firstName} {selectedApplication.client.surname}
            </p>
            <nav className="mt-4 flex flex-wrap gap-2 border-b border-[#eee8dc] pb-3 text-sm font-semibold">
              {[
                ["overview", "Overview"],
                ["documents", "Documents"],
                ["payment", "Payment"],
                ["supplier", "Supplier"],
                ["messages", "Messages"],
                ["audit", "Audit"],
              ].map(([view, label]) => (
                <Link
                  key={view}
                  href={adminHref(baseAdminParams, { view })}
                  scroll={false}
                  className={[
                    "border px-3 py-2",
                    selectedView === view
                      ? "border-[#1f2724] bg-[#1f2724] text-white"
                      : "border-[#d8d1c3] text-[#52615b]",
                  ].join(" ")}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <dl className="mt-4 grid gap-3 border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Entity type</dt>
                <dd className="mt-1 font-medium">{clientEntityTypeLabels[selectedApplication.client.entityType]}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Referral source</dt>
                <dd className="mt-1 font-medium">{selectedApplication.referralSource || "Not captured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Referrer details</dt>
                <dd className="mt-1 font-medium">{selectedApplication.referralContact || "Not provided"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Completed document destination</dt>
                <dd className="mt-1 font-medium">
                  {selectedApplication.sendCompletedDocumentsToReferrer
                    ? `Send to referrer${selectedApplication.referralContact ? `: ${selectedApplication.referralContact}` : ""}`
                    : "Return to client"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Client link</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">
                  <Link href={`/client/${selectedApplication.publicToken}`} className="text-[#07315f]">
                    Open client page
                  </Link>
                  <form action={resendClientStatusLink}>
                    <input type="hidden" name="applicationId" value={selectedApplication.id} />
                    <button className="border border-[#d8d1c3] px-2 py-1 text-xs font-semibold text-[#52615b]">
                      Resend status link
                    </button>
                  </form>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Supplier urgency</dt>
                <dd className="mt-1 font-medium">
                  {urgencyLabel(selectedApplication.supplierUrgency)}
                  {urgencyMarker(selectedApplication.supplierUrgency) ? (
                    <span className="ml-2 font-black text-[#b3261e]">
                      {urgencyMarker(selectedApplication.supplierUrgency)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Entity / estate name</dt>
                <dd className="mt-1 font-medium">{selectedApplication.entityDisplayName || "Not captured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Entity / BRNC / reference</dt>
                <dd className="mt-1 font-medium">{selectedApplication.entityRegistrationNumber || "Not captured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Representative</dt>
                <dd className="mt-1 font-medium">{selectedApplication.representativeFullName || "Not captured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Representative role</dt>
                <dd className="mt-1 font-medium">{selectedApplication.representativeCapacity || "Not captured"}</dd>
              </div>
            </dl>
            {selectedView === "supplier" ? (
              <>
            <form
              action={updateSupplierHandoff}
              className="mt-4 grid gap-3 border border-[#d8d1c3] bg-white p-4 md:grid-cols-[0.45fr_1fr_auto] md:items-end"
            >
              <input type="hidden" name="applicationId" value={selectedApplication.id} />
              <label className="text-sm font-semibold">
                Supplier urgency
                <select
                  name="supplierUrgency"
                  defaultValue={selectedApplication.supplierUrgency}
                  className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
                >
                  <option value={SupplierUrgency.NORMAL}>Normal</option>
                  <option value={SupplierUrgency.URGENT}>Urgent (!)</option>
                  <option value={SupplierUrgency.VERY_URGENT}>Very urgent (!!)</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Internal supplier note
                <input
                  name="orderComment"
                  placeholder="Add context before sending to supplier"
                  className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                />
              </label>
              <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                Save Handoff
              </button>
            </form>
            <div className="mt-4 border border-[#eee8dc] bg-[#fffdf8] p-4">
              <h3 className="text-sm font-semibold">Order Comments</h3>
              <div className="mt-3 space-y-2">
                {selectedApplication.orderComments.map((comment) => (
                  <div key={comment.id} className="border border-[#eee8dc] bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#6b5e4f]">
                      <span>{comment.authorName}</span>
                      <span>{comment.createdAt.toLocaleString("en-ZA")}</span>
                    </div>
                    <p className="mt-2 leading-6 text-[#26312d]">{comment.body}</p>
                  </div>
                ))}
                {selectedApplication.orderComments.length === 0 ? (
                  <p className="text-sm text-[#52615b]">No internal order comments yet.</p>
                ) : null}
              </div>
            </div>
              </>
            ) : null}
            {selectedView === "documents" ? (
              <>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {documentRequirementsForEntityType(selectedApplication.client.entityType).map((requirement) => (
                <div key={requirement.key} className="border border-[#eee8dc] bg-white p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{requirement.label}</span>
                    <span className="shrink-0 text-xs font-semibold text-[#6b5e4f]">
                      {formatRequirementStatus(documentRequirementStatus(requirement, selectedApplication))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#6b5e4f]">{requirement.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border border-[#eee8dc] bg-[#fffdf8] p-3">
              <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Document states</p>
              <span className="text-xs text-[#6b5e4f]">Missing = not uploaded</span>
              <span className="text-xs text-[#6b5e4f]">Uploaded - pending review = uploaded, not yet accepted</span>
              <span className="text-xs text-[#6b5e4f]">Accepted = approved for processing</span>
              <span className="text-xs text-[#6b5e4f]">Rejected = client must resubmit with reason</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[#e4ded2] bg-[#fffdf8] p-3">
              <p className="text-sm text-[#52615b]">
                Bulk accept only applies to documents currently marked <span className="font-semibold">Pending</span>. It does
                not override rejected documents.
              </p>
              {selectedPendingDocumentCount > 0 ? (
                <ConfirmActionForm
                  action={acceptAllPendingDocuments}
                  applicationId={selectedApplication.id}
                  message={`Accept all pending documents for ${selectedApplication.id}?`}
                  className="border border-[#1f7a4d] px-4 py-2 text-sm font-semibold text-[#1f7a4d]"
                >
                  Accept All Pending ({selectedPendingDocumentCount})
                </ConfirmActionForm>
              ) : (
                <span className="text-sm font-semibold text-[#6b5e4f]">No pending documents to bulk accept.</span>
              )}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {selectedApplication.documents.map((document: ApplicationDocumentRecord) => {
                const href = document.storageKey ? documentHref(document.storageKey) : null;

                return (
                  <div key={document.id} className="border border-[#d8d1c3] px-3 py-3 text-left text-sm">
                    <span className="text-[#1f2724]">{supportingDocumentLabel(document, selectedApplication)}: </span>
                    <span className={["font-semibold", documentStatusClass(document.status)].join(" ")}>
                      {formatDocumentStatus(document.status)}
                    </span>
                    {documentTypeDescriptions[document.type] ? (
                      <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                        {documentTypeDescriptions[document.type]}
                      </span>
                    ) : null}
                    {href ? (
                      <AdminDocumentQuickView href={href} fileName={document.fileName} />
                    ) : null}
                    {document.rejectionReason ? (
                      <p className="mt-2 text-xs leading-5 text-[#b3261e]">{document.rejectionReason}</p>
                    ) : null}
                    {document.reviewedAt ? (
                      <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">
                        Reviewed: {document.reviewedAt.toLocaleString("en-ZA")}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {document.status === "PENDING" ? (
                        <>
                          <form action={acceptDocument}>
                            <input type="hidden" name="applicationId" value={selectedApplication.id} />
                            <input type="hidden" name="documentId" value={document.id} />
                            <button className="border border-[#1f7a4d] px-3 py-1.5 text-xs font-semibold text-[#1f7a4d]">
                              Accept
                            </button>
                          </form>
                          <form action={rejectDocument} className="flex flex-wrap gap-2">
                            <input type="hidden" name="applicationId" value={selectedApplication.id} />
                            <input type="hidden" name="documentId" value={document.id} />
                            <input
                              name="rejectionReason"
                              placeholder="Reason"
                              className="min-w-36 border border-[#d8d1c3] px-2 py-1.5 text-xs"
                              required
                            />
                            <button className="border border-[#b3261e] px-3 py-1.5 text-xs font-semibold text-[#b3261e]">
                              Reject
                            </button>
                          </form>
                        </>
                      ) : (
                        <form action={markDocumentPending}>
                          <input type="hidden" name="applicationId" value={selectedApplication.id} />
                          <input type="hidden" name="documentId" value={document.id} />
                          <button className="border border-[#8a6a2a] px-3 py-1.5 text-xs font-semibold text-[#6b5e4f]">
                            Mark pending
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <AdminDocumentUploadForm
              applicationId={selectedApplication.id}
              action={adminUploadDocument}
              supportingDocumentTypes={supportingRequirementsForEntityType(selectedApplication.client.entityType).map(
                (requirement) => ({ key: requirement.key, label: requirement.label }),
              )}
            />
            <div className="mt-4 border border-[#e4ded2] bg-[#fffdf8] p-3 text-sm">
              <span className="font-semibold">Mandate capture: </span>
              {selectedApplication.mandateFormSubmission
                ? `Signature and ID photo submitted on ${selectedApplication.mandateFormSubmission.submittedAt.toLocaleDateString(
                    "en-ZA",
                  )}.`
                : "Awaiting client signature and ID photo."}
            </div>
            <div className="mt-4 border border-[#e4ded2] bg-[#fffdf8] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Rejection notes</h3>
                <span className="text-xs text-[#6b5e4f]">Read only</span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedApplication.documents.filter((document: ApplicationDocumentRecord) => document.rejectionReason).length > 0 ? (
                  selectedApplication.documents
                    .filter((document: ApplicationDocumentRecord) => document.rejectionReason)
                    .map((document: ApplicationDocumentRecord) => (
                      <div key={document.id} className="border border-[#eee8dc] bg-white p-3 text-sm">
                        <p className="font-semibold text-[#1f2724]">{supportingDocumentLabel(document, selectedApplication)}</p>
                        <p className="mt-1 text-[#b3261e]">{document.rejectionReason}</p>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-[#52615b]">No rejection notes captured yet.</p>
                )}
              </div>
            </div>
              </>
            ) : null}
            {selectedView === "audit" ? (
            <details className="mt-4 border border-[#e4ded2] bg-[#fffdf8]">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Review Audit Trail</summary>
              <div className="border-t border-[#eee8dc] p-3">
                <div className="space-y-2">
                  {selectedApplication.statusHistory
                    .filter((entry) => entry.note)
                    .slice(0, 8)
                    .map((entry) => (
                      <div key={entry.id} className="border border-[#eee8dc] bg-white p-2 text-xs text-[#52615b]">
                        <p className="font-semibold text-[#1f2724]">{entry.note}</p>
                        <p className="mt-1">{entry.createdAt.toLocaleString("en-ZA")}</p>
                      </div>
                    ))}
                  {selectedApplication.statusHistory.filter((entry) => entry.note).length === 0 ? (
                    <p className="text-xs text-[#52615b]">No review events captured yet.</p>
                  ) : null}
                </div>
              </div>
            </details>
            ) : null}
            {selectedView === "overview" ? (
              <>
            <div className="mt-4 flex flex-wrap gap-3">
              <ResubmissionActionForm
                action={requestResubmission}
                applicationId={selectedApplication.id}
                clientFirstName={selectedApplication.client.firstName}
                documents={selectedApplication.documents.map((document: ApplicationDocumentRecord) => ({
                  id: document.id,
                  label: supportingDocumentLabel(document, selectedApplication),
                  currentReason: document.rejectionReason,
                }))}
                className="border border-[#8a6a2a] px-4 py-2 text-sm font-semibold text-[#6b5e4f]"
              />
              {selectedApprovalBlockReason ? (
                <p className="border border-[#d8b267] bg-[#fff8df] px-4 py-2 text-sm font-semibold text-[#6b5e4f]">
                  {selectedApprovalBlockReason}
                </p>
              ) : (
                <ConfirmActionForm
                  action={approveToSupplier}
                  applicationId={selectedApplication.id}
                  message={`Approve ${selectedApplication.id} and send it to the supplier?`}
                  className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
                >
                  Approve Application
                </ConfirmActionForm>
              )}
            </div>
            <div className="mt-4 border border-[#d8d1c3] bg-white p-4">
              <h3 className="text-sm font-semibold">Admin Checklist</h3>
              <div className="mt-3 space-y-2">
                {selectedChecklist.map((item) => (
                  <div key={item.label} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="border border-[#d8d1c3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f]">
                          {item.scope}
                        </span>
                        <span
                          className={[
                            "text-xs font-semibold",
                            item.pass ? "text-[#1f7a4d]" : "text-[#b3261e]",
                          ].join(" ")}
                        >
                          {item.pass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[#6b5e4f]">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
              </>
            ) : null}
          </div>
        </section>

        <section className={selectedView === "payment" || selectedView === "messages" ? "mt-6" : "hidden"}>
          <aside className={selectedView === "payment" ? "border border-[#d8d1c3] bg-white p-5" : "hidden"}>
            <h2 className="text-lg font-semibold">Payment History</h2>
            <div className="mt-4 space-y-2 text-sm text-[#52615b]">
              {selectedApplication.payments.map((payment) => (
                <p key={payment.id}>
                  {payment.type.replaceAll("_", " ").toLowerCase()} · {payment.method} ·{" "}
                  {payment.status.toLowerCase()}
                </p>
              ))}
            </div>
            <AddChargeActionForm
              action={raiseAdditionalCharge}
              applicationId={selectedApplication.id}
              paystackEnabled={paystackEnabled}
              className="mt-5 w-full border border-[#1f2724] px-4 py-2 text-sm font-semibold"
            />
            {["AWAITING_ADMIN_QUOTE", "QUOTE_PENDING_CLIENT_APPROVAL"].includes(selectedApplication.currentStatus) ? (
              <form action={publishAdminQuote} className="mt-4 space-y-2 border border-[#eee8dc] bg-[#fffdf8] p-3">
                <input type="hidden" name="applicationId" value={selectedApplication.id} />
                <h4 className="text-sm font-semibold">Publish Quote</h4>
                <label className="block text-xs font-semibold text-[#6b5e4f]">
                  Payment method
                  <select
                    name="paymentMethod"
                    defaultValue="EFT"
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 text-sm font-normal"
                  >
                    <option value="EFT">EFT transfer</option>
                    {paystackEnabled ? <option value="PAYSTACK">Paystack</option> : null}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-[#6b5e4f]">
                  Amount (ZAR)
                  <input
                    name="quoteAmount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-xs font-semibold text-[#6b5e4f]">
                  Description
                  <input
                    name="quoteDescription"
                    placeholder="License fee for vehicle"
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 text-sm font-normal"
                  />
                </label>
                <PendingActionButton
                  className="w-full border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  pendingLabel="Publishing quote..."
                >
                  Publish Quote To Client
                </PendingActionButton>
              </form>
            ) : null}
            <div className="mt-4 space-y-2 border border-[#eee8dc] bg-[#fffdf8] p-3">
              <h4 className="text-sm font-semibold">Pending Charge Lines</h4>
              {selectedPendingCharges.length === 0 ? (
                <p className="text-xs text-[#52615b]">No pending quote lines.</p>
              ) : (
                selectedPendingCharges.map((charge: ApplicationChargeRecord) => (
                  <p key={charge.id} className="text-xs text-[#52615b]">
                    {charge.description} · <span className="font-semibold">{formatMoney(charge.amount)}</span>
                  </p>
                ))
              )}
            </div>
          </aside>

          <aside
            id="messages"
            className={selectedView === "messages" ? "scroll-mt-6 border border-[#d8d1c3] bg-white p-5" : "hidden"}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">WhatsApp</h2>
                <p className="mt-1 text-sm text-[#52615b]">
                  {selectedApplication.client.firstName} {selectedApplication.client.surname} ·{" "}
                  {selectedApplication.client.cellphone}
                </p>
              </div>
              <span
                className={[
                  "border px-2 py-1 text-xs font-medium",
                  isWhatsappFreeReplyAvailable(selectedApplication)
                    ? "border-[#c7e4d2] bg-[#eef9f1] text-[#1f7a4d]"
                    : "border-[#e5d8b8] bg-[#fff8df] text-[#8a6a2a]",
                ].join(" ")}
              >
                {isWhatsappFreeReplyAvailable(selectedApplication) ? "Free reply available" : "Template required"}
              </span>
            </div>

            <AdminWhatsappComposer
              key={selectedApplication.id}
              action={sendClientMessage}
              applicationId={selectedApplication.id}
              clientFirstName={selectedApplication.client.firstName}
              trackingUrl={`/client/${selectedApplication.publicToken}`}
              templates={whatsappTemplates}
              replyWindowState={isWhatsappFreeReplyAvailable(selectedApplication) ? "free_reply" : "template_required"}
              lastInboundAt={lastInboundWhatsappAt(selectedApplication)?.toISOString() ?? null}
            />

            <div className="mt-5 space-y-3 border-t border-[#d8d1c3] pt-5">
              {selectedApplication.communications.map((message) => (
                <div key={message.id} className="border border-[#eee8dc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b5e4f]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{message.direction === "OUTBOUND" ? "The License Hub Admin" : message.recipientName}</span>
                      <span className="border border-[#d8d1c3] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#8a6a2a]">
                        {message.direction === "OUTBOUND" ? "Sent" : "Received"}
                      </span>
                    </span>
                    <span>
                      {(message.sentAt ?? message.receivedAt ?? message.createdAt).toLocaleString("en-ZA", {
                        timeZone: "Africa/Johannesburg",
                      })}{" "}
                      ·{" "}
                      {message.status.toLowerCase()}
                    </span>
                  </div>
                  {message.direction === "INBOUND" ? (
                    <p className="mt-1 text-xs text-[#6b5e4f]">From {message.recipientAddress}</p>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-[#26312d]">{message.body}</p>
                  {message.status === "FAILED" ? (
                    <p className="mt-2 border border-[#f1c2c0] bg-[#fff5f4] px-3 py-2 text-xs text-[#b3261e]">
                      {message.errorMessage?.includes("more than 24 hours")
                        ? "This WhatsApp send failed because more than 24 hours have passed since the customer last replied. Use an approved WhatsApp template or wait for the customer to message first."
                        : message.errorMessage?.includes("Authentication Error")
                        ? "This WhatsApp send failed: Meta rejected the token. Refresh WHATSAPP_ACCESS_TOKEN from Meta API setup, or replace the temporary token with a fresh production token."
                        : `This WhatsApp send failed${message.errorMessage ? `: ${message.errorMessage}` : "."}`}
                    </p>
                  ) : null}
                </div>
              ))}
              {selectedApplication.communications.length === 0 ? (
                <p className="text-sm text-[#52615b]">No messages have been saved for this application yet.</p>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
