import Link from "next/link";

import { ApplicationStatus, DocumentType, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { EftProofUploadForm } from "@/components/eft-proof-upload-form";
import { formatMoney } from "@/lib/applications";
import { prisma } from "@/lib/prisma";
import { approveClientQuote, uploadEftProof } from "@/lib/workflow-actions";

export const dynamic = "force-dynamic";

export default async function ApplicationSubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string;
    eftUploaded?: string;
    showUpload?: string;
    reference?: string;
    trxref?: string;
  }>;
}) {
  const { application, eftUploaded, showUpload, reference, trxref } = await searchParams;
  const applicationRecord = application
    ? await prisma.application.findUnique({
        where: { id: application },
        select: {
          id: true,
          publicToken: true,
          currentStatus: true,
          service: {
            select: {
              name: true,
            },
          },
          charges: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              description: true,
              amount: true,
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              method: true,
              status: true,
              amount: true,
              reference: true,
              checkoutUrl: true,
            },
          },
          documents: {
            where: { type: DocumentType.PROOF_OF_EFT_PAYMENT },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              fileName: true,
              createdAt: true,
            },
          },
        },
      })
    : null;
  const retentionSetting = await prisma.retentionSetting.findUnique({
    where: { id: "default" },
    select: {
      eftBankName: true,
      eftAccountHolder: true,
      eftAccountNumber: true,
      eftBranchCode: true,
      eftAccountType: true,
      eftReferenceInstruction: true,
    },
  });
  const payment = applicationRecord?.payments[0] ?? null;
  const amountLabel = payment ? `R${Number(payment.amount).toFixed(2)}` : null;
  const quoteLines = applicationRecord?.charges ?? [];
  const quoteTotal = quoteLines.reduce((sum, charge) => sum + Number(charge.amount.toString()), 0);
  const latestEftProof = applicationRecord?.documents[0] ?? null;
  const hasEftProof = Boolean(latestEftProof);
  const shouldShowUploadForm = !hasEftProof || showUpload === "1";
  const quoteAwaitingAdmin = applicationRecord?.currentStatus === ApplicationStatus.AWAITING_ADMIN_QUOTE;
  const quotePendingClientApproval = applicationRecord?.currentStatus === ApplicationStatus.QUOTE_PENDING_CLIENT_APPROVAL;
  const quoteApprovedAwaitingPayment =
    applicationRecord?.currentStatus === ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT;
  const paystackReturnReference = reference ?? trxref;
  const returnedFromPaystack =
    payment?.method === PaymentMethod.PAYSTACK &&
    typeof paystackReturnReference === "string" &&
    paystackReturnReference === payment.reference;
  const paymentConfirmed = payment?.status === PaymentStatus.CONFIRMED;
  const applicationProcessing =
    applicationRecord?.currentStatus === ApplicationStatus.PENDING_REVIEW || paymentConfirmed || returnedFromPaystack;

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-4 py-10 text-[#1f2724] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl border border-[#d8d1c3] bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase text-[#6b5e4f]">License Hub</p>
        <h1 className="mt-4 text-3xl font-semibold">Application received</h1>
        <p className="mt-4 text-sm leading-6 text-[#52615b]">
          The application, supporting documents, and mandate form were saved successfully.
        </p>

        {application ? (
          <div className="mt-6 border border-[#eee8dc] bg-[#fffdf8] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Application reference</p>
            <p className="mt-2 text-2xl font-semibold">{application}</p>
          </div>
        ) : null}

        {quoteAwaitingAdmin ? (
          <div className="mt-6 border border-[#d8d1c3] bg-[#fffdf8] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Quote status</p>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">
              Your application is waiting for admin pricing. We will notify you as soon as your quote is ready to approve.
            </p>
          </div>
        ) : null}

        {quotePendingClientApproval ? (
          <div className="mt-6 border border-[#d8d1c3] bg-[#fffdf8] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Quote ready for approval</p>
            {quoteLines.length > 0 ? (
              <div className="mt-3 space-y-2">
                {quoteLines.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{charge.description}</span>
                    <span className="font-semibold">{formatMoney(charge.amount)}</span>
                  </div>
                ))}
                <div className="mt-2 border-t border-[#d8d1c3] pt-2 text-sm font-semibold">
                  Total: {formatMoney({ toString: () => quoteTotal.toFixed(2) })}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[#52615b]">No quote line items were found yet.</p>
            )}
            {applicationRecord ? (
              <form action={approveClientQuote} className="mt-4">
                <input type="hidden" name="applicationId" value={applicationRecord.id} />
                <input type="hidden" name="publicToken" value={applicationRecord.publicToken} />
                <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                  Approve quote
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {applicationProcessing ? (
          <div className="mt-6 border border-[#1f7a4d] bg-[#f4fbf7] p-4">
            <p className="text-xs font-semibold uppercase text-[#1f7a4d]">Payment received</p>
            <h2 className="mt-2 text-xl font-semibold">License Hub is processing your order</h2>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">
              Your application is now with License Hub for processing. Please keep an eye on WhatsApp for progress
              updates and any requests from our team.
            </p>
            {returnedFromPaystack && !paymentConfirmed ? (
              <p className="mt-3 border border-[#d8d1c3] bg-white p-3 text-sm text-[#52615b]">
                Paystack has returned you after payment. Confirmation can take a short moment to finish in our system.
              </p>
            ) : null}
          </div>
        ) : null}

        {payment && amountLabel && quoteApprovedAwaitingPayment && !applicationProcessing ? (
          <div className="mt-6 border border-[#d8d1c3] bg-[#fffdf8] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Payment instruction</p>
            <p className="mt-2 text-lg font-semibold">{amountLabel}</p>
            <p className="mt-1 text-sm text-[#52615b]">{applicationRecord?.service.name}</p>
            <div className="mt-3 space-y-3">
              {payment.method === PaymentMethod.PAYSTACK ? (
                <>
                  <p className="text-sm leading-6 text-[#52615b]">
                    Complete your Paystack payment using reference{" "}
                    <span className="font-semibold">{payment.reference}</span>.
                  </p>
                  <div className="border border-[#d8d1c3] bg-white p-3 text-sm text-[#52615b]">
                    <p className="text-xs font-semibold uppercase text-[#6b5e4f]">What happens next</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Open the Paystack checkout link below.</li>
                      <li>Pay with the test card or payment method provided by Paystack.</li>
                      <li>After payment succeeds, your application moves to document review automatically.</li>
                    </ol>
                  </div>
                  {payment.checkoutUrl ? (
                    <a
                      href={payment.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Pay now with Paystack
                    </a>
                  ) : (
                    <p className="border border-[#d8b267] bg-[#fff8df] p-3 text-sm font-semibold text-[#6b5e4f]">
                      Paystack checkout is still being prepared. Please refresh this page in a moment.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm leading-6 text-[#52615b]">
                    Please complete EFT payment and use reference{" "}
                    <span className="font-semibold">{payment.reference}</span>.
                    Admin will confirm payment before review continues.
                  </p>
                  {retentionSetting?.eftBankName &&
                  retentionSetting?.eftAccountNumber &&
                  retentionSetting?.eftAccountHolder ? (
                    <div className="border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm">
                      <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Banking details</p>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Bank</dt>
                          <dd>{retentionSetting.eftBankName}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Account holder</dt>
                          <dd>{retentionSetting.eftAccountHolder}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Account number</dt>
                          <dd>{retentionSetting.eftAccountNumber}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Branch code</dt>
                          <dd>{retentionSetting.eftBranchCode || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Account type</dt>
                          <dd>{retentionSetting.eftAccountType || "Not provided"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Reference</dt>
                          <dd className="font-semibold">{payment.reference}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-xs text-[#6b5e4f]">
                        {retentionSetting.eftReferenceInstruction || "Use your application reference as payment reference."}
                      </p>
                    </div>
                  ) : (
                    <p className="border border-[#d8b267] bg-[#fff8df] p-3 text-sm font-semibold text-[#6b5e4f]">
                      EFT banking details are not configured yet. Please contact License Hub support before paying.
                    </p>
                  )}
                  <div className="border border-[#d8d1c3] bg-white p-3 text-sm text-[#52615b]">
                    <p className="text-xs font-semibold uppercase text-[#6b5e4f]">What happens next</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Use the EFT banking details and reference shown above.</li>
                      <li>
                        {hasEftProof
                          ? "Your proof of payment is uploaded and waiting for admin confirmation."
                          : "Upload your EFT proof below so admin can verify payment."}
                      </li>
                      <li>Admin confirms payment, then your application moves to document review.</li>
                    </ol>
                  </div>
                  {eftUploaded === "1" ? (
                    <p className="border border-[#1f7a4d] bg-[#f4fbf7] p-3 text-sm font-semibold text-[#1f7a4d]">
                      EFT proof uploaded successfully.
                    </p>
                  ) : null}
                  {latestEftProof ? (
                    <p className="border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm text-[#52615b]">
                      Latest uploaded proof: <span className="font-semibold">{latestEftProof.fileName}</span>
                    </p>
                  ) : null}
                  {shouldShowUploadForm && application ? (
                    <EftProofUploadForm applicationId={application} action={uploadEftProof} />
                  ) : null}
                  {hasEftProof && !shouldShowUploadForm && application ? (
                    <Link
                      href={`/apply/submitted?application=${encodeURIComponent(application)}&showUpload=1`}
                      className="inline-flex border border-[#d8d1c3] bg-white px-3 py-2 text-sm font-semibold text-[#52615b]"
                    >
                      Replace uploaded proof
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/apply" className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]">
            Start another application
          </Link>
          <Link href="/" className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
            Back to website
          </Link>
        </div>
      </section>
    </main>
  );
}
