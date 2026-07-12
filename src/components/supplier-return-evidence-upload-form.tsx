"use client";

import { useActionState } from "react";

type UploadState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: UploadState = {
  status: "idle",
  message: "",
};

type SupplierReturnEvidenceUploadFormProps = {
  applicationId: string;
  action: (formData: FormData) => Promise<UploadState>;
};

export function SupplierReturnEvidenceUploadForm({
  applicationId,
  action,
}: SupplierReturnEvidenceUploadFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_previousState: UploadState, formData: FormData): Promise<UploadState> => action(formData),
    initialState,
  );

  return (
    <form action={formAction} className="mt-6 border border-[#d6d0c1] bg-[#fffdf8] p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <h3 className="text-sm font-semibold">Produced document evidence</h3>
      <p className="mt-1 text-xs leading-5 text-[#6b5e4f]">
        Upload a photo of the produced document and a second photo of the barcode before you return the order.
        Admin can view these files. The client cannot unless the setting is enabled.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-semibold">
          Produced document photo
          <input
            capture="environment"
            accept="image/jpeg,image/png,image/heic,image/heif"
            className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
            name="producedDocumentPhoto"
            required
            type="file"
          />
        </label>
        <label className="block text-sm font-semibold">
          Barcode photo
          <input
            capture="environment"
            accept="image/jpeg,image/png,image/heic,image/heif"
            className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
            name="barcodePhoto"
            required
            type="file"
          />
        </label>
      </div>

      {state.status !== "idle" ? (
        <p
          className={[
            "mt-4 border px-3 py-2 text-sm",
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
        className="mt-4 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Uploading..." : "Upload evidence"}
      </button>
    </form>
  );
}
