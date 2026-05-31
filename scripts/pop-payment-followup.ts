import {
  ApplicationStatus,
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  DocumentType,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function paymentUploadLink(applicationId: string) {
  const baseUrl = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  return `${baseUrl}/apply/submitted?application=${encodeURIComponent(applicationId)}`;
}

function isReminderDue(lastPopReminderAt: Date | null) {
  if (!lastPopReminderAt) {
    return true;
  }

  return Date.now() - lastPopReminderAt.getTime() >= DAY_MS;
}

async function queueWhatsapp(options: {
  applicationId: string;
  firstName: string;
  surname: string;
  cellphone: string;
  templateKey: string;
  body: string;
}) {
  await prisma.communication.create({
    data: {
      applicationId: options.applicationId,
      channel: CommunicationChannel.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      status: CommunicationStatus.QUEUED,
      senderId: null,
      recipientName: `${options.firstName} ${options.surname}`.trim(),
      recipientAddress: options.cellphone,
      templateKey: options.templateKey,
      body: options.body,
    },
  });
}

async function run() {
  const applications = await prisma.application.findMany({
    where: {
      currentStatus: ApplicationStatus.QUOTE_APPROVED_AWAITING_PAYMENT,
      autoCancelOnNoPop: true,
      payments: {
        some: {
          method: PaymentMethod.EFT,
          status: PaymentStatus.PENDING,
        },
      },
    },
    include: {
      client: true,
      documents: {
        where: {
          type: DocumentType.PROOF_OF_EFT_PAYMENT,
        },
      },
    },
  });

  let remindersQueued = 0;
  let cancelled = 0;

  for (const application of applications) {
    const hasPop = application.documents.length > 0;

    if (hasPop) {
      continue;
    }

    const dueAt = application.popDueAt ?? new Date(application.createdAt.getTime() + 7 * DAY_MS);
    const now = new Date();

    if (now >= dueAt) {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStatus: ApplicationStatus.CANCELLED,
          previousStatus: application.currentStatus,
          cancelledAt: now,
        },
      });

      await prisma.statusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: application.currentStatus,
          toStatus: ApplicationStatus.CANCELLED,
          note: "System auto-cancelled after 7 days with no proof of payment uploaded.",
        },
      });

      await queueWhatsapp({
        applicationId: application.id,
        firstName: application.client.firstName,
        surname: application.client.surname,
        cellphone: application.client.cellphone,
        templateKey: "payment-pop-auto-cancelled",
        body: `Hi ${application.client.firstName}, your application ${application.id} was cancelled because no proof of payment was uploaded within 7 days. Please contact us if you want to restart.`,
      });

      cancelled += 1;
      continue;
    }

    if (!isReminderDue(application.lastPopReminderAt)) {
      continue;
    }

    const nextReminderCount = application.popReminderCount + 1;
    await queueWhatsapp({
      applicationId: application.id,
      firstName: application.client.firstName,
      surname: application.client.surname,
      cellphone: application.client.cellphone,
      templateKey: "payment-pop-reminder",
      body: `Reminder ${nextReminderCount}/7: Please upload your proof of payment for application ${application.id} here: ${paymentUploadLink(application.id)}.`,
    });

    await prisma.application.update({
      where: { id: application.id },
      data: {
        lastPopReminderAt: now,
        popReminderCount: nextReminderCount,
      },
    });

    remindersQueued += 1;
  }

  console.log(JSON.stringify({ scanned: applications.length, remindersQueued, cancelled }));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

