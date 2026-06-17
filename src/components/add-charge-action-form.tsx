"use client";

import { useState } from "react";

type AddChargeActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  className?: string;
};

export function AddChargeActionForm({ action, applicationId, className }: AddChargeActionFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  async function handleSubmit(formData: FormData) {
    await action(formData);
    setIsOpen(false);
  }

  return (
    <form
      action={handleSubmit}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <button type="button" className={className} onClick={() => setIsOpen(true)}>
        Add Charge
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111815]/60 px-4">
          <div
            aria-modal="true"
            className="w-full max-w-md border border-[#d8d1c3] bg-[#fffdf8] p-6 text-[#1f2724] shadow-2xl"
            role="dialog"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a2a]">Additional charge</p>
            <h2 className="mt-3 text-2xl font-semibold">Create a charge</h2>
            <p className="mt-4 text-sm leading-6 text-[#52615b]">
              Add a new amount, and the client will be asked to pay it before the workflow continues.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">
                Amount (ZAR)
                <input
                  name="chargeAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal"
                />
              </label>

              <label className="block text-sm font-semibold">
                Description
                <input
                  name="chargeDescription"
                  placeholder="Why this charge is being added"
                  required
                  className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#cfc6b8] px-4 py-2 text-sm font-semibold text-[#52615b]"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                Send Charge
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
