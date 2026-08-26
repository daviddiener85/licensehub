"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function UploadStatus({ selectedFileName }: { selectedFileName: string }) {
  const { pending } = useFormStatus();

  if (pending) {
    return <p className="text-sm font-semibold text-[#8a6a2a]">Uploading proof of payment...</p>;
  }

  return selectedFileName ? (
    <p className="text-sm font-semibold text-[#1f7a4d]">Upload starting automatically...</p>
  ) : (
    <p className="text-xs text-[#6b5e4f]">The file uploads automatically after selection.</p>
  );
}

type EftProofUploadFormProps = {
  applicationId: string;
  publicToken: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function EftProofUploadForm({ applicationId, publicToken, action }: EftProofUploadFormProps) {
  const [selectedFileName, setSelectedFileName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="space-y-3 border border-[#e4ded2] bg-white p-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="publicToken" value={publicToken} />
      <div className="space-y-2">
        <p className="text-sm font-semibold">Upload proof of EFT payment</p>
        <label className="inline-flex cursor-pointer border border-[#d8d1c3] bg-white px-3 py-2 text-sm font-semibold text-[#52615b]">
          Choose file
          <input
            type="file"
            name="eftProof"
            required
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const selectedFile = event.currentTarget.files?.[0] ?? null;

              setSelectedFileName(selectedFile?.name ?? "");
              if (selectedFile) {
                window.requestAnimationFrame(() => formRef.current?.requestSubmit());
              }
            }}
          />
        </label>
        <p className="text-sm text-[#52615b]">{selectedFileName || "No file chosen yet."}</p>
      </div>
      <UploadStatus selectedFileName={selectedFileName} />
    </form>
  );
}
