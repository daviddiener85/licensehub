import {
  CommunicationChannel,
  CommunicationDirection,
  CommunicationStatus,
  Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  extractMetaInboundMessages,
  extractMetaStatuses,
  normalizeWhatsappNumber,
  verifyMetaWebhookSignature,
  verifyMetaWebhookToken,
} from "@/lib/whatsapp-meta";

function extractMetaFailureMessage(rawStatus: unknown) {
  if (typeof rawStatus !== "object" || rawStatus === null) {
    return null;
  }

  const status = rawStatus as Record<string, unknown>;
  const errors = "errors" in status && Array.isArray(status.errors) ? status.errors : [];

  for (const error of errors) {
    if (typeof error !== "object" || error === null) {
      continue;
    }

    const entry = error as Record<string, unknown>;
    const code = "code" in entry ? String(entry.code ?? "") : "";
    const title = "title" in entry ? String(entry.title ?? "").trim() : "";
    const message = "message" in entry ? String(entry.message ?? "").trim() : "";
    const details =
      "error_data" in entry &&
      typeof entry.error_data === "object" &&
      entry.error_data !== null &&
      "details" in entry.error_data
        ? String((entry.error_data as Record<string, unknown>).details ?? "").trim()
        : "";

    if (code === "131047") {
      return details || "Re-engagement message: more than 24 hours have passed since the customer last replied.";
    }

    return [title || message, details].filter(Boolean).join(" - ") || null;
  }

  return null;
}

async function resolveApplicationForWhatsappNumber(number: string) {
  const normalizedNumber = normalizeWhatsappNumber(number);

  if (!normalizedNumber) {
    return null;
  }

  const match = await prisma.$queryRaw<
    Array<{
      id: string;
      publicToken: string;
      firstName: string;
      surname: string;
      cellphone: string;
    }>
  >`
    SELECT
      a."id",
      a."publicToken",
      c."firstName",
      c."surname",
      c."cellphone"
    FROM "Application" a
    INNER JOIN "Client" c ON c."id" = a."clientId"
    WHERE regexp_replace(c."cellphone", '\\D', '', 'g') = ${normalizedNumber}
    ORDER BY a."createdAt" DESC
    LIMIT 1
  `;

  return match[0] ?? null;
}

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
  const inboundMessages = extractMetaInboundMessages(payload);

  for (const item of statuses) {
    const updates: {
      status: CommunicationStatus;
      deliveredAt?: Date;
      readAt?: Date;
      failedAt?: Date;
      providerPayload?: Prisma.InputJsonValue;
      errorMessage?: string | null;
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
      updates.errorMessage = extractMetaFailureMessage(item.raw);
    } else {
      updates.status = CommunicationStatus.SENT;
      updates.errorMessage = null;
    }

    updates.providerPayload = item.raw as Prisma.InputJsonValue;

    await prisma.communication.updateMany({
      where: { providerMessageId: item.providerMessageId },
      data: updates,
    });
  }

  let inboundProcessed = 0;
  let inboundSkipped = 0;

  for (const item of inboundMessages) {
    const application = await resolveApplicationForWhatsappNumber(item.from);

    if (!application) {
      inboundSkipped += 1;
      continue;
    }

    await prisma.communication.create({
      data: {
        applicationId: application.id,
        channel: CommunicationChannel.WHATSAPP,
        direction: CommunicationDirection.INBOUND,
        status: CommunicationStatus.RECEIVED,
        senderId: null,
        recipientName: item.senderName,
        recipientAddress: item.from,
        body: item.body,
        providerMessageId: item.providerMessageId,
        providerPayload: item.raw as Prisma.InputJsonValue,
        receivedAt: new Date(),
      },
    });

    inboundProcessed += 1;
  }

  return Response.json({
    ok: true,
    processed: statuses.length + inboundProcessed,
    statusesProcessed: statuses.length,
    inboundProcessed,
    inboundSkipped,
  });
}
