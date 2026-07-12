import { ChargeStatus, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type ConfirmedPayment = {
  applicationId: string;
  chargeId: string | null;
  status: PaymentStatus;
};

export async function markChargesPaidForConfirmedPayment(payment: ConfirmedPayment) {
  if (payment.status !== PaymentStatus.CONFIRMED) {
    return;
  }

  if (payment.chargeId) {
    await prisma.charge.updateMany({
      where: {
        id: payment.chargeId,
        applicationId: payment.applicationId,
      },
      data: {
        status: ChargeStatus.PAID,
        paidAt: new Date(),
      },
    });
    return;
  }

  await prisma.charge.updateMany({
    where: {
      applicationId: payment.applicationId,
      status: ChargeStatus.PENDING,
    },
    data: {
      status: ChargeStatus.PAID,
      paidAt: new Date(),
    },
  });
}
