import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal-page-shell";
import { PublicFooter } from "@/components/public-footer";

export const metadata: Metadata = {
  title: "Terms & Conditions | The License Hub",
  description: "Draft terms and conditions for The License Hub customers.",
};

const sections = [
  {
    title: "1. About The License Hub",
    content: [
      "The License Hub helps customers prepare and submit vehicle document requests, supporting documents, signed mandate forms and payment details.",
      "We act as a service platform and administration team. We do not guarantee approval by third parties, licensing authorities or payment providers.",
    ],
  },
  {
    title: "2. Your use of the service",
    content: [
      "You must provide accurate, current and complete information when you create or submit an application.",
      "You confirm that you are authorised to act for the vehicle owner, company, trust or estate where applicable.",
      "You must only upload documents that you are allowed to share and that relate to the application being submitted.",
    ],
  },
  {
    title: "3. Documents and verification",
    content: [
      "Applications can only move forward when the required documents are supplied in a clear, readable format.",
      "We may ask you to resubmit documents, provide extra proof or correct information before processing continues.",
      "Submitted files may be reviewed by The License Hub staff and, where needed, shared with payment or processing partners involved in the request.",
    ],
  },
  {
    title: "4. Fees and payment",
    content: [
      "Any quoted fees should be reviewed carefully before submission.",
      "Where EFT is selected, proof of payment may be required before an application is released for processing.",
      "Where card or Paystack payment is selected, the transaction is handled through the configured payment flow and may be subject to additional provider terms.",
    ],
  },
  {
    title: "5. Processing time",
    content: [
      "Timeframes shown on the site are estimates unless we clearly state otherwise in writing.",
      "Delays can happen because of missing documents, third-party processing, public holiday schedules or additional verification requirements.",
      "We will use reasonable efforts to keep you informed when an application needs attention.",
    ],
  },
  {
    title: "6. Cancellations and refunds",
    content: [
      "Cancellation rights and refund handling are described in the cancellations policy.",
      "If work has already started on your request, part or all of the fee may remain payable depending on the stage reached and any third-party costs incurred.",
    ],
  },
  {
    title: "7. Customer responsibility",
    content: [
      "You are responsible for keeping your login details, application reference numbers and contact information safe and up to date.",
      "You are responsible for checking the details shown before submitting the application and for notifying us promptly if anything changes.",
    ],
  },
  {
    title: "8. Limitation",
    content: [
      "We are not liable for outcomes outside our control, including processing delays caused by authorities, banks, courier services or inaccurate information supplied by the customer.",
      "To the extent allowed by law, our liability is limited to the amount paid for the specific service giving rise to the claim.",
    ],
  },
  {
    title: "9. Contact",
    content: [
      "If you have any questions about these terms, contact The License Hub team using the details shown on the site or through your application reference.",
    ],
  },
] as const;

export default function TermsAndConditionsPage() {
  return (
    <>
      <LegalPageShell
        eyebrow="Terms & Conditions"
        title="Clear terms for customers using The License Hub"
        intro="These terms explain how The License Hub application flow works, what we need from you, and how payment and processing are handled. Please review them before submitting an application."
        updatedOn="21 June 2026"
      >
        <div className="grid gap-5">
          {sections.map((section) => (
            <section key={section.title} className="border border-[#d7cfbf] bg-white p-5 sm:p-6">
              <h2 className="text-xl font-black uppercase text-[#182024]">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[#51605a]">
                {section.content.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </LegalPageShell>
      <PublicFooter />
    </>
  );
}
