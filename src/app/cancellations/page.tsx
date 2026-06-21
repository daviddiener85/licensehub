import type { Metadata } from "next";

import { LegalPageShell } from "@/components/legal-page-shell";
import { PublicFooter } from "@/components/public-footer";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | License Hub",
  description: "Refund and cancellation policy for License Hub customers.",
};

const sections = [
  {
    title: "1. Before submission",
    content: [
      "You may cancel an application before it has been submitted for processing.",
      "If the request has already been placed and processing has started, it is treated as non-refundable unless we approve an exception manually.",
    ],
  },
  {
    title: "2. After submission",
    content: [
      "Once an application has been submitted, work may already have started on document review, mandate preparation or payment processing.",
      "From that point onward, the normal rule is no refund because the request is already in motion.",
      "Any refund after submission is only considered manually on the merits by admin, for example where a major issue was not reasonably visible before processing started.",
    ],
  },
  {
    title: "3. EFT payments",
    content: [
      "For EFT applications, the same rule applies: once the request is placed and processing starts, the order is expected to continue.",
      "Any exception or refund for EFT is handled manually and only where admin approves it on the merits.",
    ],
  },
  {
    title: "4. Paystack and card payments",
    content: [
      "If you paid using a Paystack-supported method, the payment is still subject to this policy once the request has entered processing.",
      "We may assist with a refund request where admin approves an exception, but we cannot guarantee reversals once processing has begun.",
    ],
  },
  {
    title: "5. How to request cancellation",
    content: [
      "Send your cancellation request with the application reference number, the customer name and the reason for cancellation.",
      "If you are using the customer status page, include the status details shown there so we can identify the correct file quickly.",
      "Cancellation requests are reviewed by admin, and approval of any refund is always manual.",
    ],
  },
  {
    title: "6. Our right to cancel or pause",
    content: [
      "We may pause or cancel a request if the information supplied is incomplete, inaccurate, misleading or appears to be unauthorised.",
      "We may also pause a request if payment is not completed or if required documents are not provided after a reasonable request.",
    ],
  },
  {
    title: "7. Contact",
    content: [
      "For cancellation help, contact the License Hub team using the usual customer support or application channels.",
    ],
  },
] as const;

export default function CancellationsPage() {
  return (
    <>
      <LegalPageShell
        eyebrow="Refund & Cancellation Policy"
        title="How cancellations and refunds are handled"
        intro="This policy explains when an application can be cancelled, when refunds are not available, and the limited cases where admin may approve a manual exception."
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
