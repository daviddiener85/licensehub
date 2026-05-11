import Link from "next/link";
import { notFound } from "next/navigation";

import { DatabaseSetup } from "@/components/database-setup";
import { MandateCaptureForm } from "@/components/mandate-capture-form";
import { MandateFormPreview } from "@/components/mandate-form-preview";
import { DocumentType, PaymentStatus } from "@/generated/prisma/client";
import { formatMoney, getClientApplicationByToken, statusLabel } from "@/lib/applications";
import { documentHref, documentLabel, documentTypeDescriptions } from "@/lib/documents";
import { applicationPipeline } from "@/lib/workflow";

export const dynamic = "force-dynamic";

function paymentSummary(application: NonNullable<Awaited<ReturnType<typeof getClientApplicationByToken>>>) {
  const confirmedPayments = application.payments.filter((payment) => payment.status === PaymentStatus.CONFIRMED);
  const outstandingCharges = application.charges.filter((charge) => charge.status === "PENDING");

  if (outstandingCharges.length > 0) {
    const total = outstandingCharges.reduce((sum, charge) => sum + Number(charge.amount.toString()), 0);
    return `Outstanding charge: ${new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(total)}`;
  }

  if (confirmedPayments.length > 0) {
    return `Paid ${formatMoney(confirmedPayments[0].amount, confirmedPayments[0].currency)}`;
  }

  return "Payment awaiting confirmation";
}

function clientIdLabel(application: NonNullable<Awaited<ReturnType<typeof getClientApplicationByToken>>>) {
  if (application.client.southAfricanIdEncrypted.startsWith("encrypted-demo-id-hash-")) {
    return "Demo ID on file";
  }

  return "Stored securely";
}

export default async function ClientApplicationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const application = await getClientApplicationByToken(token).catch((error: unknown) => {
    console.error(error);
    return undefined;
  });

  if (application === undefined) {
    return <DatabaseSetup message="Client application data could not be loaded from PostgreSQL." />;
  }

  if (!application) {
    notFound();
  }

  const visibleSteps = applicationPipeline.filter((step) => step.status !== "CANCELLED");
  const currentStepIndex = Math.max(
    0,
    visibleSteps.findIndex((step) => step.status === application.currentStatus),
  );
  const currentStage = applicationPipeline.find((step) => step.status === application.currentStatus);
  const mandateForm = application.documents.find((document) => document.type === DocumentType.MANDATE_FORM);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-medium text-[#6b5e4f]">
              Back
            </Link>
            <h1 className="mt-4 text-3xl font-semibold">{application.service.name} Application</h1>
            <p className="mt-2 text-sm text-[#52615b]">Application {application.id}</p>
          </div>
          <div className="border border-[#d8d1c3] bg-white px-4 py-3">
            <p className="text-xs uppercase text-[#6b5e4f]">Current status</p>
            <p className="mt-1 font-semibold">{statusLabel(application.currentStatus)}</p>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {visibleSteps.map((step, index) => {
            const state = index < currentStepIndex ? "done" : index === currentStepIndex ? "current" : "next";

            return (
              <div
                key={step.label}
                className={[
                  "min-h-24 border p-3",
                  state === "current" ? "border-[#8a6a2a] bg-[#fff8df]" : "border-[#d8d1c3] bg-white",
                ].join(" ")}
              >
                <p className="text-xs font-semibold text-[#8a6a2a]">{index + 1}</p>
                <p className="mt-3 text-sm font-semibold">{step.label}</p>
                <p className="mt-2 text-xs leading-5 text-[#68736e]">{step.owner}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">
              {application.currentStatus === "DOCUMENTS_RESUBMIT_REQUIRED" ? "Action Required" : "Progress"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#52615b]">
              {currentStage?.clientDescription ?? "Your application is being processed."}
            </p>

            <div className="mt-5 space-y-3">
              {application.documents.map((document) => (
                <div
                  key={document.id}
                  className="border border-[#e4ded2] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium">{documentLabel(document.type, document.fileName)}</span>
                    <span className="text-sm text-[#6b5e4f]">
                      {document.status === "REJECTED" ? document.rejectionReason : statusLabel(document.status)}
                    </span>
                  </div>
                  {documentTypeDescriptions[document.type] ? (
                    <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">{documentTypeDescriptions[document.type]}</p>
                  ) : null}
                  {documentHref(document.storageKey) ? (
                    <a
                      className="mt-2 inline-block text-xs font-semibold text-[#07315f] underline"
                      href={documentHref(document.storageKey) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open generated PDF
                    </a>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-5">
              <MandateFormPreview
                clientName={`${application.client.firstName} ${application.client.surname}`}
                clientIdLabel={clientIdLabel(application)}
                registrationNumber={application.registrationNumber}
                vin={application.vin}
                make={application.vehicleMake}
                model={application.vehicleModel}
                colour={application.vehicleColour}
                date={mandateForm?.createdAt ?? application.submittedAt ?? application.createdAt}
              />
            </div>

            <div className="mt-5">
              <MandateCaptureForm
                applicationId={application.id}
                submittedAt={application.mandateFormSubmission?.submittedAt}
                idPhotoFileName={application.mandateFormSubmission?.idPhotoFileName}
              />
            </div>

            {application.currentStatus === "DOCUMENTS_RESUBMIT_REQUIRED" ? (
              <button className="mt-5 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                Upload Replacement
              </button>
            ) : null}
          </div>

          <aside className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-lg font-semibold">Application Details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b5e4f]">Client</dt>
                <dd className="font-medium">
                  {application.client.firstName} {application.client.surname}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b5e4f]">Registration</dt>
                <dd className="font-medium">{application.registrationNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b5e4f]">Vehicle</dt>
                <dd className="font-medium">
                  {application.vehicleMake} {application.vehicleModel}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b5e4f]">Payment</dt>
                <dd className="font-medium">{paymentSummary(application)}</dd>
              </div>
              {application.dispatch ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[#6b5e4f]">Tracking</dt>
                  <dd className="font-medium">{application.dispatch.trackingNumber}</dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </section>
      </div>
    </main>
  );
}
