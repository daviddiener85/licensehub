import { ApplicationStatus, PaymentMethod, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { markChargesPaidForConfirmedPayment } from "@/lib/payment-confirmation";
import type { PaystackTransaction } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export type PaystackConfirmationResult =
  | "confirmed"
  | "already_confirmed"
  | "not_found"
  | "inactive"
  | "mismatch"
  | "not_successful";

// Both authenticated webhooks and server-verified callbacks use this path.
// Never call it with transaction details supplied directly by a browser.
export async function confirmPaystackPayment(
  transaction: PaystackTransaction,
  applicationId?: string,
): Promise<PaystackConfirmationResult> {
  if (transaction.status !== "success") return "not_successful";

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (database) => {
        const payments = await database.payment.findMany({
          where: { reference: transaction.reference, method: PaymentMethod.PAYSTACK, ...(applicationId ? { applicationId } : {}) },
          take: 2,
          select: {
            id: true, applicationId: true, chargeId: true, status: true, amount: true, currency: true,
            application: { select: { currentStatus: true, previousStatus: true } },
          },
        });
        if (payments.length === 0) return "not_found";
        // References are indexed, not unique in the existing schema. Fail closed on ambiguity.
        if (payments.length !== 1) return "mismatch";
        const payment = payments[0];
        const expectedSubunits = payment.amount.mul(100);
        if (
          !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0 ||
          !expectedSubunits.equals(transaction.amount) || payment.currency !== transaction.currency
        ) return "mismatch";
        if (payment.status === PaymentStatus.CONFIRMED) return "already_confirmed";
        if (payment.status !== PaymentStatus.PENDING) return "inactive";

        const application = payment.application;
        const nextStatus = application.currentStatus === ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT
          ? ApplicationStatus.PENDING_REVIEW
          : application.currentStatus === ApplicationStatus.ADDITIONAL_CHARGE_RAISED
            ? application.previousStatus ?? ApplicationStatus.PENDING_REVIEW
            : null;
        // Never revive a cancelled application or an obsolete payment request.
        if (!nextStatus) return "inactive";

        const updated = await database.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING, method: PaymentMethod.PAYSTACK },
          data: {
            status: PaymentStatus.CONFIRMED,
            confirmedAt: new Date(),
            checkoutUrl: null,
            providerReference: transaction.providerReference,
          },
        });
        if (updated.count !== 1) throw new Error("Payment changed during confirmation.");

        await markChargesPaidForConfirmedPayment({ ...payment, status: PaymentStatus.CONFIRMED }, database);
        await database.application.update({
          where: { id: payment.applicationId },
          data: { currentStatus: nextStatus, previousStatus: application.currentStatus },
          select: { id: true },
        });
        await database.statusHistory.create({
          data: {
            applicationId: payment.applicationId,
            fromStatus: application.currentStatus,
            toStatus: nextStatus,
            note: payment.chargeId
              ? "Paystack additional charge confirmed automatically."
              : "Paystack payment confirmed automatically.",
          },
        });
        return "confirmed";
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // Callback and webhook can arrive together. Retry serialization conflicts,
      // then let genuine failures surface so Paystack can redeliver the event.
      if (attempt < 2 && typeof error === "object" && error !== null && "code" in error && error.code === "P2034") continue;
      throw error;
    }
  }
}
