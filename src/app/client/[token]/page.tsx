import Link from "next/link";

import { MandateCaptureForm } from "@/components/mandate-capture-form";
import { PublicFooter } from "@/components/public-footer";
import { ApplicationStatus, ChargeStatus, DocumentStatus, PaymentStatus } from "@/generated/prisma/client";
import { formatMoney, getClientApplicationByToken, statusLabel } from "@/lib/applications";
import { documentHref, documentLabel } from "@/lib/documents";
import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { isPaystackConfigured } from "@/lib/paystack";
import { listActiveServices } from "@/lib/services";
import { applicationPipeline } from "@/lib/workflow";
import { supportingRequirementsForEntityType } from "@/lib/entity-requirements";
import {
  isSupplierReturnEvidenceDocument,
  producedDocumentEvidence,
  supplierReturnEvidenceDescriptions,
} from "@/lib/supplier-evidence";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientApplicationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const application = await getClientApplicationByToken(token);
  const services = await listActiveServices().catch((error) => {
    console.error("Failed to load services for /client/[token]:", error);
    return [];
  });
  const paystackEnabled = isPaystackConfigured();

  if (application) {
    const currentStage =
      applicationPipeline.find((stage) => stage.status === application.currentStatus) ?? null;
    const currentStageIndex = applicationPipeline.findIndex((stage) => stage.status === application.currentStatus);
    const latestPayment = application.payments[0] ?? null;
    const pendingCharges = application.charges.filter((charge) => charge.status === ChargeStatus.PENDING);
    const latestHistory = application.statusHistory.slice(0, 5);
    const retentionSetting = await prisma.retentionSetting.findUnique({
      where: { id: "default" },
      select: {
        clientCanViewSupplierEvidence: true,
      },
    });
    const visibleDocuments = application.documents.filter((document) => !isSupplierReturnEvidenceDocument(document));
    const rejectedDocuments = visibleDocuments.filter((document) => document.status === DocumentStatus.REJECTED);
    const pendingDocuments = visibleDocuments.filter((document) => document.status === DocumentStatus.PENDING);
    const producedDocument = producedDocumentEvidence(application.documents);
    const canViewProducedDocument = retentionSetting?.clientCanViewSupplierEvidence && Boolean(producedDocument);
    const nextAction = clientNextAction(application.currentStatus, application.id);

    return (
      <main className="min-h-screen bg-[#f7f5ef] px-4 py-8 text-[#1f2724] sm:px-6 lg:px-8">
        <section className="mx-auto max-w-5xl">
          <div className="border border-[#d8d1c3] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-[#6b5e4f]">The License Hub status</p>
                <h1 className="mt-3 text-3xl font-semibold">Application {application.id}</h1>
                <p className="mt-2 text-sm leading-6 text-[#52615b]">
                  {application.client.firstName} {application.client.surname} · {application.service.name}
                </p>
              </div>
              <div className="border border-[#d8d1c3] bg-[#fffdf8] px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Current status</p>
                <p className="mt-1 text-lg font-semibold">{statusLabel(application.currentStatus)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Stage</p>
                <p className="mt-1 font-semibold">{currentStage?.label ?? "In progress"}</p>
              </div>
              <div className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Documents</p>
                <p className="mt-1 font-semibold">
                  {rejectedDocuments.length > 0
                    ? `${rejectedDocuments.length} need attention`
                    : pendingDocuments.length > 0
                      ? `${pendingDocuments.length} under review`
                      : "Up to date"}
                </p>
              </div>
              <div className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Payment</p>
                <p className="mt-1 font-semibold">
                  {latestPayment ? latestPayment.status.toLowerCase() : "No active payment"}
                </p>
              </div>
            </div>

            <div className="mt-3 border border-[#eee8dc] bg-[#fffdf8] p-4">
              <p className="text-sm leading-6 text-[#52615b]">
                {currentStage?.clientDescription ?? "Your application status has been updated."}
              </p>
              {nextAction ? (
                <Link
                  href={nextAction.href}
                  className="mt-4 inline-flex border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
                >
                  {nextAction.label}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <section className="border border-[#d8d1c3] bg-white p-5">
              <h2 className="text-lg font-semibold">Progress</h2>
              <div className="mt-4 grid gap-2">
                {applicationPipeline.map((stage, index) => {
                  const isCurrent = stage.status === application.currentStatus;
                  const isComplete = currentStageIndex >= 0 && index < currentStageIndex;

                  return (
                    <div
                      key={stage.status}
                      className={[
                        "flex items-center justify-between gap-3 border px-3 py-2 text-sm",
                        isCurrent
                          ? "border-[#1f2724] bg-[#fff8df]"
                          : isComplete
                            ? "border-[#c7dfd4] bg-[#f4fbf7]"
                            : "border-[#eee8dc] bg-white",
                      ].join(" ")}
                    >
                      <span className="font-semibold">{stage.label}</span>
                      {isComplete ? (
                        <span className="text-xs font-semibold uppercase text-[#6b5e4f]">Done</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="border border-[#d8d1c3] bg-white p-5">
                <h2 className="text-lg font-semibold">Payment</h2>
                {latestPayment ? (
                  <div className="mt-3 text-sm leading-6 text-[#52615b]">
                    <p>
                      <span className="font-semibold text-[#1f2724]">{formatMoney(latestPayment.amount)}</span> ·{" "}
                      {latestPayment.method} · {latestPayment.status.toLowerCase()}
                    </p>
                    <p>Reference: {latestPayment.reference}</p>
                    {latestPayment.status === PaymentStatus.PENDING ? (
                      <Link
                        href={`/apply/submitted?application=${encodeURIComponent(application.id)}`}
                        className="mt-3 inline-flex border border-[#1f2724] bg-[#1f2724] px-3 py-2 text-sm font-semibold text-white"
                      >
                        Continue payment
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#52615b]">No payment request is active right now.</p>
                )}
                {pendingCharges.length > 0 ? (
                  <div className="mt-4 border-t border-[#eee8dc] pt-3">
                    <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Open charges</p>
                    <div className="mt-2 space-y-1 text-sm text-[#52615b]">
                      {pendingCharges.map((charge) => (
                        <p key={charge.id}>
                          {charge.description} · <span className="font-semibold">{formatMoney(charge.amount)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="border border-[#d8d1c3] bg-white p-5">
                <h2 className="text-lg font-semibold">Documents</h2>
                <div className="mt-3 space-y-2 text-sm">
                  {visibleDocuments.slice(0, 6).map((document) => (
                    <div key={document.id} className="flex items-start justify-between gap-3 border border-[#eee8dc] p-2">
                      <span>{documentLabel(document.type, document.fileName)}</span>
                      <span className={documentStatusClass(document.status)}>{document.status.toLowerCase()}</span>
                    </div>
                  ))}
                </div>
                {canViewProducedDocument && producedDocument?.storageKey ? (
                  <div className="mt-4 border border-[#c7dfd4] bg-[#f4fbf7] p-3 text-sm">
                    <p className="text-xs font-semibold uppercase text-[#1f7a4d]">Produced document</p>
                    <p className="mt-1 text-[#52615b]">Your produced document is available to view.</p>
                    <a
                      href={documentHref(producedDocument.storageKey) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
                    >
                      View produced document
                    </a>
                    <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">
                      {supplierReturnEvidenceDescriptions.producedDocumentPhoto}
                    </p>
                  </div>
                ) : null}
                {rejectedDocuments.length > 0 || pendingDocuments.length > 0 ? (
                  <p className="mt-3 text-xs leading-5 text-[#6b5e4f]">
                    {rejectedDocuments.length > 0
                      ? "One or more documents need attention."
                      : "Uploaded documents are waiting for admin review."}
                  </p>
                ) : null}
              </section>
            </aside>
          </div>

          {application.currentStatus === ApplicationStatus.DOCUMENTS_RESUBMIT_REQUIRED ? (
            <section className="mt-5 border border-[#d8d1c3] bg-white p-5">
              <h2 className="text-lg font-semibold">Upload requested updates</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                Use the request details from WhatsApp and upload the corrected files below.
              </p>
              <div className="mt-4">
                <MandateCaptureForm
                  applicationId={application.id}
                  clientName={`${application.client.firstName} ${application.client.surname}`}
                  registrationNumber={application.registrationNumber}
                  vin={application.vin}
                  make={application.vehicleMake}
                  model={application.vehicleModel}
                  colour={application.vehicleColour}
                  submittedAt={application.mandateFormSubmission?.submittedAt ?? application.submittedAt}
                  supportingDocumentTypes={supportingRequirementsForEntityType(application.client.entityType).map(
                    (requirement) => ({
                      key: requirement.key,
                      label: requirement.label,
                      description: requirement.description,
                    }),
                  )}
                />
              </div>
            </section>
          ) : null}

          {latestHistory.length > 0 ? (
            <details className="mt-5 border border-[#d8d1c3] bg-white p-5">
              <summary className="cursor-pointer list-none text-lg font-semibold">Recent updates</summary>
              <div className="mt-3 space-y-2">
                {latestHistory.map((item) => (
                  <div key={item.id} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                    <p className="font-semibold">{item.note ?? "Application status updated."}</p>
                    <p className="mt-1 text-xs text-[#6b5e4f]">{item.createdAt.toLocaleString("en-ZA")}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
        <PublicFooter />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <section className="border-b border-[#d8d1c3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex min-h-[430px] flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[#6b5e4f]">The License Hub</p>
              <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-tight text-[#111815] sm:text-5xl">
                Let&apos;s work out what this request needs
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#52615b]">
                You have been sent this secure link because a duplicate vehicle registration certificate may need to be
                requested. Before we ask for uploads or signatures, we need to understand who you are and how the vehicle
                is owned.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#intake"
                className="border border-[#1f2724] bg-[#1f2724] px-5 py-3 text-sm font-semibold text-white"
              >
                Proceed
              </a>
              <span className="border border-[#d8d1c3] px-5 py-3 text-sm font-semibold text-[#52615b]">
                Secure customer link
              </span>
            </div>
          </div>

          <aside className="border border-[#d8d1c3] bg-[#fffdf8] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">What happens next</h2>
            <div className="mt-5 grid gap-3 text-sm">
              {[
                ["1", "Confirm the request", "We first work out who is applying and who owns the vehicle."],
                ["2", "See the document list", "You only see the documents that match your ownership setup."],
                ["3", "Continue when ready", "After that, you can upload files, sign, and move forward."],
              ].map(([step, title, text]) => (
                <div key={title} className="border border-[#eee8dc] bg-white p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#c5b89e] bg-[#fff8df] text-xs font-semibold">
                      {step}
                    </span>
                    <div>
                      <p className="font-semibold text-[#1f2724]">{title}</p>
                      <p className="mt-1 leading-5 text-[#52615b]">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="intake" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <ClientIntakeFlow
          reference={token}
          paystackEnabled={paystackEnabled}
          services={services.map((service) => ({
            ...service,
            basePrice: service.basePrice.toString(),
            deliveryFee: service.deliveryFee.toString(),
          }))}
        />
      </section>
      <PublicFooter />
    </main>
  );
}

function clientNextAction(status: ApplicationStatus, applicationId: string) {
  if (
    status === ApplicationStatus.QUOTE_PENDING_CLIENT_APPROVAL ||
    status === ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT ||
    status === ApplicationStatus.ADDITIONAL_CHARGE_RAISED
  ) {
    return {
      label: status === ApplicationStatus.QUOTE_PENDING_CLIENT_APPROVAL ? "Review quote" : "Continue payment",
      href: `/apply/submitted?application=${encodeURIComponent(applicationId)}`,
    };
  }

  return null;
}

function documentStatusClass(status: DocumentStatus) {
  if (status === DocumentStatus.ACCEPTED) {
    return "text-xs font-semibold text-[#1f7a4d]";
  }

  if (status === DocumentStatus.REJECTED) {
    return "text-xs font-semibold text-[#b3261e]";
  }

  return "text-xs font-semibold text-[#8a6a2a]";
}
