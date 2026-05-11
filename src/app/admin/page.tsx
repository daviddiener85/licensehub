import Link from "next/link";

import { AdminApplicationCell } from "@/components/admin-application-cell";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DatabaseSetup } from "@/components/database-setup";
import { ResubmissionActionForm } from "@/components/resubmission-action-form";
import { PaymentStatus } from "@/generated/prisma/client";
import { listAdminApplications, statusLabel } from "@/lib/applications";
import { whatsappTemplates } from "@/lib/communications";
import { documentHref, documentLabel, documentTypeDescriptions } from "@/lib/documents";
import {
  approveToSupplier,
  cancelApplication,
  confirmEftPayment,
  markDispatched,
  markDocumentReturned,
  requestResubmission,
  sendClientMessage,
} from "@/lib/workflow-actions";

const dayInMs = 1000 * 60 * 60 * 24;

export const dynamic = "force-dynamic";

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
  const rejected = application.documents.filter((document) => document.status === "REJECTED").length;
  const pending = application.documents.filter((document) => document.status === "PENDING").length;

  if (rejected > 0) {
    return `${rejected} rejected`;
  }

  if (pending > 0) {
    return "Pending";
  }

  return "Accepted";
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

function formatDocumentStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function ageSummary(createdAt: Date) {
  const days = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / dayInMs));
  return days === 1 ? "1 day" : `${days} days`;
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
    actions.push({
      label: "Approve",
      action: approveToSupplier,
      variant: "primary",
      message: `Approve ${application.id} and send it to the supplier?`,
    });
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
  searchParams: Promise<{ application?: string }>;
}) {
  const applications = await listAdminApplications().catch((error: unknown) => {
    console.error(error);
    return null;
  });

  if (!applications) {
    return <DatabaseSetup message="Admin applications could not be loaded from PostgreSQL." />;
  }

  const unconfirmedEftCount = applications.filter((application) =>
    application.payments.some((payment) => payment.method === "EFT" && payment.status !== PaymentStatus.CONFIRMED),
  ).length;
  const atSupplierCount = applications.filter((application) =>
    ["AT_SUPPLIER", "SUPPLIER_PRODUCED", "RETURNING_TO_LICENSE_HUB"].includes(application.currentStatus),
  ).length;
  const { application: selectedApplicationId } = await searchParams;
  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? applications[0];
  const selectedWhatsappTemplate = whatsappTemplates[0].body
    .replace("{{firstName}}", selectedApplication.client.firstName)
    .replace("{{applicationId}}", selectedApplication.id);

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
            <Link
              className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]"
              href="/admin/settings"
            >
              Settings
            </Link>
            <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
              Create Client Link
            </button>
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

        <section className="mt-6">
          <aside className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">Admin-Owned Statuses</h2>
            <p className="mt-3 text-sm leading-6 text-[#52615b]">
              Admin confirms document return, captures dispatch details, marks cancelled,
              and controls retention timing after dispatch or cancellation.
            </p>
          </aside>
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
          {applications.map((application) => (
            <div
              key={application.id}
              className={[
                "grid grid-cols-[0.9fr_1fr_1fr_0.8fr_0.9fr_1fr_0.7fr_1.4fr] items-center gap-2 border-b border-[#eee8dc] px-4 py-4 text-sm last:border-b-0",
                application.id === selectedApplication.id ? "bg-[#fff8df]" : "",
              ].join(" ")}
            >
              <AdminApplicationCell applicationId={application.id} className="font-semibold">
                {application.id}
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
        </section>

        <section className="mt-6">
          <div className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">Selected Review</h2>
            <p className="mt-1 text-sm text-[#52615b]">
              {selectedApplication.id} · {selectedApplication.client.firstName} {selectedApplication.client.surname}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {selectedApplication.documents.map((document) => {
                const href = documentHref(document.storageKey);
                const content = (
                  <>
                    <span className="text-[#1f2724]">{documentLabel(document.type, document.fileName)}: </span>
                    <span className={["font-semibold", documentStatusClass(document.status)].join(" ")}>
                      {formatDocumentStatus(document.status)}
                    </span>
                    {documentTypeDescriptions[document.type] ? (
                      <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                        {documentTypeDescriptions[document.type]}
                      </span>
                    ) : null}
                    {href ? <span className="mt-1 block text-xs font-semibold text-[#07315f]">Open PDF</span> : null}
                  </>
                );

                return href ? (
                  <a
                    key={document.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[#d8d1c3] px-3 py-3 text-left text-sm"
                  >
                    {content}
                  </a>
                ) : (
                  <button key={document.id} className="border border-[#d8d1c3] px-3 py-3 text-left text-sm">
                    {content}
                  </button>
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
              <ConfirmActionForm
                action={approveToSupplier}
                applicationId={selectedApplication.id}
                message={`Approve ${selectedApplication.id} and send it to the supplier?`}
                className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
              >
                Approve Application
              </ConfirmActionForm>
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
