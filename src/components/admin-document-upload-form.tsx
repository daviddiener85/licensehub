"use client";

import { useActionState } from "react";

import { adminUploadDocument } from "@/lib/workflow-actions";
import { DocumentType } from "@/generated/prisma/client";

const uploadableDocumentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: DocumentType.ID_PHOTO, label: "ID photo" },
  { value: DocumentType.LICENCE_DISK_PHOTO, label: "Licence disk photo" },
  { value: DocumentType.PROOF_OF_ADDRESS, label: "Proof of address" },
  { value: DocumentType.MANDATE_FORM, label: "Completed mandate form" },
  { value: DocumentType.PROOF_OF_EFT_PAYMENT, label: "Proof of EFT payment" },
  { value: DocumentType.OTHER, label: "Other document" },
];

type AdminDocumentUploadFormProps = {
  applicationId: string;
};

type UploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: UploadState = {
  status: "idle",
  message: "",
};

export function AdminDocumentUploadForm({ applicationId }: AdminDocumentUploadFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_previousState: UploadState, formData: FormData): Promise<UploadState> => {
      const result = await adminUploadDocument(formData);
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3 border border-[#e4ded2] bg-[#fffdf8] p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <h3 className="text-sm font-semibold">Admin upload document</h3>
      <p className="text-xs leading-5 text-[#6b5e4f]">
        Upload a document on behalf of the client and mark it accepted once you have verified it.
      </p>
      <label className="block text-sm font-semibold">
        Document type
        <select name="documentType" defaultValue={DocumentType.PROOF_OF_ADDRESS} className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal">
          {uploadableDocumentTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        File
        <input
          type="file"
          name="documentFile"
          required
          className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold">
        Proof document date
        <input
          type="date"
          name="proofDocumentDate"
          className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
        />
      </label>
      {state.status !== "idle" ? (
        <p
          className={[
            "border px-3 py-2 text-sm",
            state.status === "success"
              ? "border-[#1f7a4d] bg-[#f4fbf7] text-[#1f7a4d]"
              : "border-[#b3261e] bg-[#fff5f3] text-[#7d3128]",
          ].join(" ")}
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Uploading..." : "Upload Document"}
      </button>
    </form>
  );
}
