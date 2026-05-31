import { CommunicationChannel, CommunicationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isMetaProviderEnabled, sendMetaWhatsAppText } from "@/lib/whatsapp-meta";

const BATCH_SIZE = Number(process.env.WHATSAPP_DISPATCH_BATCH_SIZE ?? 30);

async function run() {
  if (!isMetaProviderEnabled()) {
    console.log(JSON.stringify({ skipped: true, reason: "WHATSAPP_PROVIDER is not meta_cloud_api" }));
    return;
  }

  const queued = await prisma.communication.findMany({
    where: {
      channel: CommunicationChannel.WHATSAPP,
      status: CommunicationStatus.QUEUED,
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;

  for (const communication of queued) {
    try {
      const result = await sendMetaWhatsAppText({
        to: communication.recipientAddress,
        body: communication.body,
        previewUrl: true,
      });

      await prisma.communication.update({
        where: { id: communication.id },
        data: {
          status: CommunicationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          providerPayload: result.raw,
          errorMessage: null,
          failedAt: null,
        },
      });

      sent += 1;
    } catch (error) {
      await prisma.communication.update({
        where: { id: communication.id },
        data: {
          status: CommunicationStatus.FAILED,
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown Meta dispatch error",
        },
      });

      failed += 1;
    }
  }

  console.log(JSON.stringify({ scanned: queued.length, sent, failed }));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
