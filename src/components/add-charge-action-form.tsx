"use client";

type AddChargeActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  paystackEnabled: boolean;
  className?: string;
};

export function AddChargeActionForm({ action, applicationId, paystackEnabled, className }: AddChargeActionFormProps) {
  return (
    <form action={action} className={className}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6a2a]">Additional charge</p>
      <h2 className="mt-3 text-2xl font-semibold">Create a charge</h2>
      <p className="mt-3 text-sm leading-6 text-[#52615b]">
        Add a new amount, choose EFT or Paystack, and the client will be asked to pay it before the workflow continues.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">
          Payment method
          <select
            name="paymentMethod"
            defaultValue="EFT"
            className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal"
          >
            <option value="EFT">EFT transfer</option>
            {paystackEnabled ? <option value="PAYSTACK">Paystack</option> : null}
          </select>
        </label>

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

      <div className="mt-6 flex justify-end">
        <button type="submit" className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
          Send Charge
        </button>
      </div>
    </form>
  );
}
