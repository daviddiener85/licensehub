"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "border px-4 py-2 text-sm font-semibold",
        pending
          ? "cursor-wait border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]"
          : "border-[#1f2724] bg-[#1f2724] text-white",
      ].join(" ")}
    >
      {pending ? "Uploading..." : "Upload EFT Proof"}
    </button>
  );
}

type EftProofUploadFormProps = {
  applicationId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function EftProofUploadForm({ applicationId, action }: EftProofUploadFormProps) {
  const [selectedFileName, setSelectedFileName] = useState("");

  return (
    <form action={action} className="space-y-3 border border-[#e4ded2] bg-white p-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="space-y-2">
        <p className="text-sm font-semibold">Upload proof of EFT payment</p>
        <label className="inline-flex cursor-pointer border border-[#d8d1c3] bg-white px-3 py-2 text-sm font-semibold text-[#52615b]">
          Choose file
          <input
            type="file"
            name="eftProof"
            required
            accept="image/jpeg,image/png,application/pdf"
            className="sr-only"
            onChange={(event) => {
              setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "");
            }}
          />
        </label>
        <p className="text-sm text-[#52615b]">{selectedFileName || "No file chosen yet."}</p>
      </div>
      <SubmitButton />
    </form>
  );
}
