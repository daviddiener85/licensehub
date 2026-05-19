import Link from "next/link";

import { AdminApplicationCell } from "@/components/admin-application-cell";
import { AdminRefreshController } from "@/components/admin-refresh-controller";
import { AdminSeenOrders } from "@/components/admin-seen-orders";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DatabaseSetup } from "@/components/database-setup";
import { ResubmissionActionForm } from "@/components/resubmission-action-form";
import { PaymentStatus, SupplierUrgency } from "@/generated/prisma/client";
import { listAdminApplications, statusLabel } from "@/lib/applications";
import { whatsappTemplates } from "@/lib/communications";
import { documentHref, documentLabel, documentTypeDescriptions } from "@/lib/documents";
import {
  clientEntityTypeLabels,
  documentRequirementsForEntityType,
} from "@/lib/entity-requirements";
import {
  approveToSupplier,
  cancelApplication,
  confirmEftPayment,
  acceptDocument,
  acceptAllPendingDocuments,
  markDispatched,
  markDocumentReturned,
  rejectDocument,
  requestResubmission,
  sendClientMessage,
  updateSupplierHandoff,
} from "@/lib/workflow-actions";
import { prisma } from "@/lib/prisma";

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
};

function paymentSummary(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const latestPayment = application.payments[0];

  if (!latestPayment) {
    return "Not started";
  }

  if (latestPayment.status === PaymentStatus.CONFIRMED) {
    return "Confirmed";
  }

  return latestPayment.method === "EFT" ? "EFT pending" : latestPayment.status.toLowerCase();
}

function documentSummary(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const requirements = documentRequirementsForEntityType(application.client.entityType).filter(
    (requirement) => requirement.confirmedForUpload,
  );
  const requirementStates = requirements.map((requirement) => {
    if (requirement.key === "id-photo") {
      return application.mandateFormSubmission ? "ACCEPTED" : "MISSING";
    }

    if (!requirement.documentType) {
      return "MISSING";
    }

    const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

    return latestDocument?.status ?? "MISSING";
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
  if (requirement.key === "id-photo") {
    return application.mandateFormSubmission ? "PENDING" : "MISSING";
  }

  if (!requirement.documentType) {
    return "MISSING";
  }

  const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

  return latestDocument?.status ?? "MISSING";
}

function approvalBlockReason(application: Awaited<ReturnType<typeof listAdminApplications>>[number]) {
  const incompleteRequirement = documentRequirementsForEntityType(application.client.entityType)
    .filter((requirement) => requirement.confirmedForUpload)
    .find((requirement) => {
      if (requirement.key === "id-photo") {
        return !application.mandateFormSubmission;
      }

      if (!requirement.documentType) {
        return true;
      }

      const latestDocument = application.documents.find((document) => document.type === requirement.documentType);

      return !latestDocument || latestDocument.status !== "ACCEPTED";
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

function textParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
    variant: "primary" | "secondary" | "quiet";
    message: string;
    type?: "resubmission";
  }[] = [];

  if (application.payments.some((payment) => payment.method === "EFT" && payment.status === PaymentStatus.PENDING)) {
    actions.push({
      label: "Confirm EFT",
      action: confirmEftPayment,
      variant: "primary",
      message: `Confirm that funds have been received for ${application.id}?`,
    });
  }

  if (application.currentStatus === "PENDING_REVIEW") {
    if (!approvalBlockReason(application)) {
      actions.push({
        label: "Approve",
        action: approveToSupplier,
        variant: "primary",
        message: `Approve ${application.id} and send it to the supplier?`,
      });
    }
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
      message: `Confirm the physical document for ${application.id} has returned to License Hub?`,
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

  if (!applications) {
    return <DatabaseSetup message="Admin applications could not be loaded from PostgreSQL." />;
  }

  const unconfirmedEftCount = applications.filter((application) =>
    application.payments.some((payment) => payment.method === "EFT" && payment.status !== PaymentStatus.CONFIRMED),
  ).length;
  const atSupplierCount = applications.filter((application) =>
    ["AT_SUPPLIER", "SUPPLIER_PRODUCED", "RETURNING_TO_LICENSE_HUB"].includes(application.currentStatus),
  ).length;
  const resolvedSearchParams = await searchParams;
  const selectedApplicationId = textParam(resolvedSearchParams.application);
  const query = textParam(resolvedSearchParams.q).trim();
  const statusFilter = textParam(resolvedSearchParams.status);
  const paymentFilter = textParam(resolvedSearchParams.payment);
  const documentsFilter = textParam(resolvedSearchParams.documents);
  const urgencyFilter = textParam(resolvedSearchParams.urgency);
  const serviceFilter = textParam(resolvedSearchParams.service);
  const serviceOptions = Array.from(new Set(applications.map((application) => application.service.name))).sort();
  const filteredApplications = applications.filter((application) => {
    if (!matchesSearch(application, query)) {
      return false;
    }

    if (statusFilter && application.currentStatus !== statusFilter) {
      return false;
    }

    if (paymentFilter && paymentSummary(application).toLowerCase().replace(/\s+/g, "-") !== paymentFilter) {
      return false;
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
  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? filteredApplications[0] ?? applications[0];
  const selectedWhatsappTemplate = whatsappTemplates[0].body
    .replace("{{firstName}}", selectedApplication.client.firstName)
    .replace("{{applicationId}}", selectedApplication.id);
  const adminRefreshIntervalSeconds = retentionSetting?.adminRefreshIntervalSeconds ?? 30;
  const adminAutoRefreshEnabled = retentionSetting?.adminAutoRefreshEnabled ?? true;
  const selectedApprovalBlockReason = approvalBlockReason(selectedApplication);
  const selectedPendingDocumentCount = selectedApplication.documents.filter((document) => document.status === "PENDING").length;

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
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            `Unconfirmed EFT: ${unconfirmedEftCount}`,
            "Drafts older than 7 days: 0",
            "Unpaid charges: 0",
            `At supplier: ${atSupplierCount}`,
          ].map((metric) => (
            <div key={metric} className="border border-[#d8d1c3] bg-white p-4 text-sm font-semibold">
              {metric}
            </div>
          ))}
        </section>

        <section className="mt-6 border border-[#d8d1c3] bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_auto_auto] lg:items-end">
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
                <option value="eft-pending">EFT pending</option>
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
          <div className="grid grid-cols-[0.9fr_1fr_1fr_0.8fr_0.9fr_1fr_0.7fr_1.4fr] border-b border-[#d8d1c3] bg-[#fffdf8] px-4 py-3 text-xs font-semibold uppercase text-[#6b5e4f]">
            <span>Application</span>
            <span>Client</span>
            <span>Service</span>
            <span>Payment</span>
            <span>Documents</span>
            <span>Status</span>
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
                "grid grid-cols-[0.9fr_1fr_1fr_0.8fr_0.9fr_1fr_0.7fr_1.4fr] items-center gap-2 border-b border-[#eee8dc] px-4 py-4 text-sm last:border-b-0",
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
              <AdminApplicationCell applicationId={application.id}>{paymentSummary(application)}</AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>{documentSummary(application)}</AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>{statusLabel(application.currentStatus)}</AdminApplicationCell>
              <AdminApplicationCell applicationId={application.id}>{ageSummary(application.createdAt)}</AdminApplicationCell>
              <span className="flex flex-wrap gap-2">
                {adminActions(application).map((item) =>
                  item.type === "resubmission" ? (
                    <ResubmissionActionForm
                      key={item.label}
                      action={requestResubmission}
                      applicationId={application.id}
                      clientFirstName={application.client.firstName}
                      documents={application.documents.map((document) => ({
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
                      className={[
                        "border px-2 py-1 text-xs font-semibold",
                        item.variant === "primary"
                          ? "border-[#1f2724] bg-[#1f2724] text-white"
                          : item.variant === "secondary"
                            ? "border-[#8a6a2a] text-[#6b5e4f]"
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
            <dl className="mt-4 grid gap-3 border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Entity type</dt>
                <dd className="mt-1 font-medium">{clientEntityTypeLabels[selectedApplication.client.entityType]}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Referral source</dt>
                <dd className="mt-1 font-medium">{selectedApplication.client.referralSource || "Not captured"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Client link</dt>
                <dd className="mt-1 font-medium">
                  <Link href={`/client/${selectedApplication.publicToken}`} className="text-[#07315f]">
                    Open client page
                  </Link>
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
            </dl>
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
              {selectedApplication.documents.map((document) => {
                const href = documentHref(document.storageKey);

                return (
                  <div key={document.id} className="border border-[#d8d1c3] px-3 py-3 text-left text-sm">
                    <span className="text-[#1f2724]">{documentLabel(document.type, document.fileName)}: </span>
                    <span className={["font-semibold", documentStatusClass(document.status)].join(" ")}>
                      {formatDocumentStatus(document.status)}
                    </span>
                    {documentTypeDescriptions[document.type] ? (
                      <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                        {documentTypeDescriptions[document.type]}
                      </span>
                    ) : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-semibold text-[#07315f]">
                        Open document
                      </a>
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
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 border border-[#e4ded2] bg-[#fffdf8] p-3 text-sm">
              <span className="font-semibold">Mandate capture: </span>
              {selectedApplication.mandateFormSubmission
                ? `Signature and ID photo submitted on ${selectedApplication.mandateFormSubmission.submittedAt.toLocaleDateString(
                    "en-ZA",
                  )}.`
                : "Awaiting client signature and ID photo."}
            </div>
            <textarea
              className="mt-4 h-28 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm outline-none"
              defaultValue={
                selectedApplication.documents
                  .filter((document) => document.rejectionReason)
                  .map((document) => `${documentLabel(document.type, document.fileName)}: ${document.rejectionReason}`)
                  .join("\n") || "No rejection notes captured yet."
              }
            />
            <div className="mt-4 border border-[#e4ded2] bg-[#fffdf8] p-3">
              <h3 className="text-sm font-semibold">Review Audit Trail</h3>
              <div className="mt-2 space-y-2">
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
            <div className="mt-4 flex flex-wrap gap-3">
              <ResubmissionActionForm
                action={requestResubmission}
                applicationId={selectedApplication.id}
                clientFirstName={selectedApplication.client.firstName}
                documents={selectedApplication.documents.map((document) => ({
                  id: document.id,
                  label: documentLabel(document.type, document.fileName),
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
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">Payment History</h2>
            <div className="mt-4 space-y-2 text-sm text-[#52615b]">
              {selectedApplication.payments.map((payment) => (
                <p key={payment.id}>
                  {payment.type.replaceAll("_", " ").toLowerCase()} · {payment.method} ·{" "}
                  {payment.status.toLowerCase()}
                </p>
              ))}
            </div>
            <button className="mt-5 w-full border border-[#1f2724] px-4 py-2 text-sm font-semibold">
              Add Charge
            </button>
          </aside>

          <aside className="border border-[#d8d1c3] bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">WhatsApp</h2>
                <p className="mt-1 text-sm text-[#52615b]">
                  {selectedApplication.client.firstName} {selectedApplication.client.surname} ·{" "}
                  {selectedApplication.client.cellphone}
                </p>
              </div>
              <span className="border border-[#c5b89e] px-2 py-1 text-xs font-medium text-[#6b5e4f]">
                History retained
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {whatsappTemplates.map((template) => (
                <button
                  key={template.key}
                  className="border border-[#d8d1c3] px-3 py-2 text-left text-sm font-medium"
                >
                  {template.label}
                </button>
              ))}
            </div>

            <form key={selectedApplication.id} action={sendClientMessage}>
              <input type="hidden" name="applicationId" value={selectedApplication.id} />
              <textarea
                key={`${selectedApplication.id}-whatsapp-message`}
                className="mt-4 h-24 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm outline-none"
                defaultValue={selectedWhatsappTemplate}
                name="body"
                required
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#6b5e4f]">Messages are stored against the application audit record.</p>
                <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                  Send WhatsApp
                </button>
              </div>
            </form>

            <div className="mt-5 space-y-3 border-t border-[#d8d1c3] pt-5">
              {selectedApplication.communications.map((message) => (
                <div key={message.id} className="border border-[#eee8dc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b5e4f]">
                    <span>{message.direction === "OUTBOUND" ? "License Hub Admin" : message.recipientName}</span>
                    <span>
                      {message.createdAt.toLocaleString("en-ZA")} · {message.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#26312d]">{message.body}</p>
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
