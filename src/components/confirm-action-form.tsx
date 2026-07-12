"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

type ConfirmActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  children: ReactNode;
  className?: string;
  confirmLabel?: string;
  confirmationCheckboxLabel?: string;
  confirmationCheckboxName?: string;
  destructive?: boolean;
  message: string;
  title?: string;
};

export function ConfirmActionForm({
  action,
  applicationId,
  children,
  className,
  confirmLabel = "Confirm",
  confirmationCheckboxLabel,
  confirmationCheckboxName = "confirmed",
  destructive = false,
  message,
  title = "Confirm action",
}: ConfirmActionFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const checkboxId = useId();

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      {confirmationCheckboxLabel ? <input type="hidden" name={confirmationCheckboxName} value={isConfirmed ? "true" : "false"} /> : null}
      <button
        type="button"
        className={className}
        onClick={() => {
          setIsConfirmed(false);
          setIsOpen(true);
        }}
      >
        {children}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111815]/60 px-4">
          <div
            aria-modal="true"
            className="w-full max-w-md border border-[#d8d1c3] bg-[#fffdf8] p-6 text-[#1f2724] shadow-2xl"
            role="dialog"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a2a]">Workflow confirmation</p>
            <h2 className="mt-3 text-2xl font-semibold">{title}</h2>
            <p className="mt-4 text-sm leading-6 text-[#52615b]">{message}</p>
            {confirmationCheckboxLabel ? (
              <label className="mt-5 flex items-start gap-3 rounded border border-[#d8d1c3] bg-white px-3 py-3 text-sm leading-6 text-[#52615b]">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={(event) => setIsConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 border-[#8a6a2a] text-[#1f2724]"
                />
                <span>{confirmationCheckboxLabel}</span>
              </label>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#cfc6b8] px-4 py-2 text-sm font-semibold text-[#52615b]"
                onClick={() => {
                  setIsConfirmed(false);
                  setIsOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={confirmationCheckboxLabel ? !isConfirmed : undefined}
                className={[
                  "border px-4 py-2 text-sm font-semibold text-white",
                  destructive ? "border-[#b3261e] bg-[#b3261e]" : "border-[#1f2724] bg-[#1f2724]",
                  confirmationCheckboxLabel && !isConfirmed ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
