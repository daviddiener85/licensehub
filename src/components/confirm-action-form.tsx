"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type ConfirmActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  children: ReactNode;
  className?: string;
  message: string;
  title?: string;
};

export function ConfirmActionForm({
  action,
  applicationId,
  children,
  className,
  message,
  title = "Confirm action",
}: ConfirmActionFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
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

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#cfc6b8] px-4 py-2 text-sm font-semibold text-[#52615b]"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
