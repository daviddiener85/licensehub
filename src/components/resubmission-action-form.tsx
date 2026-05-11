"use client";

import { useState } from "react";

type ResubmissionDocument = {
  id: string;
  label: string;
  currentReason?: string | null;
};

type ResubmissionActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  className?: string;
  clientFirstName: string;
  documents: ResubmissionDocument[];
};

export function ResubmissionActionForm({
  action,
  applicationId,
  className,
  clientFirstName,
  documents,
}: ResubmissionActionFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>(
    Object.fromEntries(documents.map((document) => [document.id, document.currentReason ?? ""])),
  );
  const [adminComment, setAdminComment] = useState("");

  const selectedDocuments = documents.filter((document) => selectedDocumentIds.includes(document.id));
  const whatsappMessage = [
    `Hi ${clientFirstName}, your License Hub application ${applicationId} needs a few document updates:`,
    "",
    ...selectedDocuments.map((document) => `- ${document.label}: ${reasons[document.id] || "Please update this document."}`),
    adminComment.trim().length > 0 ? "" : null,
    adminComment.trim().length > 0 ? `Additional note: ${adminComment.trim()}` : null,
    "",
    "Please upload the corrected document(s) using your License Hub link.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="whatsappMessage" value={whatsappMessage} />
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        Resubmit
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111815]/60 px-4">
          <div
            aria-modal="true"
            className="w-full max-w-2xl border border-[#d8d1c3] bg-[#fffdf8] p-6 text-[#1f2724] shadow-2xl"
            role="dialog"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a2a]">
              Resubmission request
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Specify required documents</h2>
            <p className="mt-4 text-sm leading-6 text-[#52615b]">
              Select each document the client must upload again and add the reason that will be shown to them.
            </p>

            <div className="mt-5 grid max-h-[64vh] gap-5 overflow-y-auto pr-1 lg:grid-cols-[1fr_0.9fr]">
              <div className="space-y-3">
                {documents.map((document) => {
                  const isSelected = selectedDocumentIds.includes(document.id);

                  return (
                    <label key={document.id} className="block border border-[#e4ded2] bg-white p-4">
                      <span className="flex items-center gap-3 text-sm font-semibold">
                        <input
                          name="documentId"
                          type="checkbox"
                          value={document.id}
                          onChange={(event) => {
                            setSelectedDocumentIds((current) =>
                              event.target.checked
                                ? [...current, document.id]
                                : current.filter((id) => id !== document.id),
                            );
                          }}
                        />
                        {document.label}
                      </span>
                      <textarea
                        className="mt-3 h-20 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm outline-none disabled:opacity-50"
                        disabled={!isSelected}
                        name={`reason:${document.id}`}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                        placeholder="Reason for resubmission"
                        required={isSelected}
                        value={reasons[document.id] ?? ""}
                      />
                    </label>
                  );
                })}
              </div>

              <div className="border border-[#e4ded2] bg-white p-4">
                <h3 className="text-sm font-semibold">WhatsApp draft</h3>
                <textarea
                  className="mt-3 h-40 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm leading-6 outline-none"
                  name="whatsappPreview"
                  readOnly
                  value={whatsappMessage}
                />
                <label className="mt-4 block text-sm font-semibold">
                  Further comment
                  <textarea
                    className="mt-2 h-24 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm leading-6 outline-none"
                    name="adminComment"
                    onChange={(event) => setAdminComment(event.target.value)}
                    placeholder="Optional note to add to the WhatsApp message"
                    value={adminComment}
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#cfc6b8] px-4 py-2 text-sm font-semibold text-[#52615b]"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={selectedDocumentIds.length === 0}
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
