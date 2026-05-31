import { CommunicationStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { extractMetaStatuses, verifyMetaWebhookSignature, verifyMetaWebhookToken } from "@/lib/whatsapp-meta";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!verifyMetaWebhookToken(mode, token)) {
    return new Response("Invalid webhook verification token", { status: 403 });
  }

  return new Response(challenge ?? "", { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signatureHeader)) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }
  const statuses = extractMetaStatuses(payload);

  for (const item of statuses) {
    const updates: {
      status: CommunicationStatus;
      deliveredAt?: Date;
      readAt?: Date;
      failedAt?: Date;
      providerPayload?: Prisma.InputJsonValue;
    } = {
      status: CommunicationStatus.SENT,
    };

    if (item.status === "delivered") {
      updates.status = CommunicationStatus.DELIVERED;
      updates.deliveredAt = new Date();
    } else if (item.status === "read") {
      updates.status = CommunicationStatus.READ;
      updates.readAt = new Date();
    } else if (item.status === "failed") {
      updates.status = CommunicationStatus.FAILED;
      updates.failedAt = new Date();
    } else {
      updates.status = CommunicationStatus.SENT;
    }

    updates.providerPayload = item.raw as Prisma.InputJsonValue;

    await prisma.communication.updateMany({
      where: { providerMessageId: item.providerMessageId },
      data: updates,
    });
  }

  return Response.json({ ok: true, processed: statuses.length });
}
