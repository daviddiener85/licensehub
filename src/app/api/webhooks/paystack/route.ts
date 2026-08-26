import { ApplicationStatus, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { markChargesPaidForConfirmedPayment } from "@/lib/payment-confirmation";
import {
  extractPaystackChargeSuccess,
  verifyPaystackWebhookSignature,
} from "@/lib/paystack";

function nextStatusAfterPaymentConfirmation(application: {
  currentStatus: ApplicationStatus;
  previousStatus: ApplicationStatus | null;
}) {
  if (application.currentStatus === ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT) {
    return ApplicationStatus.PENDING_REVIEW;
  }

  if (application.currentStatus === ApplicationStatus.ADDITIONAL_CHARGE_RAISED) {
    return application.previousStatus ?? ApplicationStatus.PENDING_REVIEW;
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signatureHeader)) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const items = extractPaystackChargeSuccess(payload);

  for (const item of items) {
    const payment = await prisma.payment.findFirst({
      where: {
        reference: item.reference,
        method: PaymentMethod.PAYSTACK,
        status: PaymentStatus.PENDING,
      },
      select: {
        id: true,
        applicationId: true,
        chargeId: true,
        providerReference: true,
        application: {
          select: {
            id: true,
            currentStatus: true,
            previousStatus: true,
          },
        },
      },
    });

    if (!payment) {
      continue;
    }

    const confirmedPayment = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        method: PaymentMethod.PAYSTACK,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        checkoutUrl: null,
        providerReference: (() => {
          const rawData = item.raw as Record<string, unknown>;
          return "id" in rawData && rawData.id !== null ? String(rawData.id) : payment.providerReference;
        })(),
      },
    });

    if (confirmedPayment.count !== 1) {
      continue;
    }

    await markChargesPaidForConfirmedPayment({
      applicationId: payment.application.id,
      chargeId: payment.chargeId,
      status: PaymentStatus.CONFIRMED,
    });

    const nextStatus = nextStatusAfterPaymentConfirmation(payment.application);

    if (nextStatus) {
      await prisma.application.update({
        where: { id: payment.application.id },
        data: {
          currentStatus: nextStatus,
          previousStatus: payment.application.currentStatus,
        },
        select: { id: true },
      });

      await prisma.statusHistory.create({
        data: {
          applicationId: payment.application.id,
          fromStatus: payment.application.currentStatus,
          toStatus: nextStatus,
          note:
            nextStatus === ApplicationStatus.PENDING_REVIEW
              ? "Paystack payment confirmed automatically."
              : "Paystack additional charge confirmed automatically.",
        },
      });
    }
  }

  return Response.json({ ok: true, processed: items.length });
}
