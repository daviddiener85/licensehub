import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaWhatsAppStatus = "sent" | "delivered" | "read" | "failed";

export type MetaSendResult = {
  providerMessageId: string;
  raw: unknown;
};

export type MetaWhatsAppInboundMessage = {
  providerMessageId: string;
  from: string;
  senderName: string;
  body: string;
  raw: unknown;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function isMetaProviderEnabled() {
  return (process.env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase() === "meta_cloud_api";
}

export function normalizeWhatsappNumber(input: string) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `27${digits.slice(1)}`;
  }

  if (trimmed.startsWith("+")) {
    return digits;
  }

  return digits;
}

export async function sendMetaWhatsAppText(options: {
  to: string;
  body: string;
  previewUrl?: boolean;
}) {
  const accessToken = requiredEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = (process.env.WHATSAPP_API_VERSION ?? "v23.0").trim();
  const to = normalizeWhatsappNumber(options.to);

  if (!to) {
    throw new Error("Recipient cellphone is invalid.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: Boolean(options.previewUrl),
        body: options.body,
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const providerMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error
        ? String(payload.error.message)
        : `Meta API error (${response.status})`;

    throw new Error(providerMessage);
  }

  const providerMessageId =
    typeof payload === "object" &&
    payload !== null &&
    "messages" in payload &&
    Array.isArray(payload.messages) &&
    payload.messages.length > 0 &&
    typeof payload.messages[0] === "object" &&
    payload.messages[0] !== null &&
    "id" in payload.messages[0]
      ? String(payload.messages[0].id)
      : "";

  if (!providerMessageId) {
    throw new Error("Meta API response did not include a message id.");
  }

  return {
    providerMessageId,
    raw: payload,
  } satisfies MetaSendResult;
}

export function verifyMetaWebhookToken(mode: string | null, token: string | null) {
  const verifyToken = requiredEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

  if (mode !== "subscribe") {
    return false;
  }

  return token === verifyToken;
}

export function verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

  if (!appSecret) {
    return false;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const sentSignature = signatureHeader.slice("sha256=".length);
  const expectedSignature = createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(sentSignature, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

export function extractMetaStatuses(payload: unknown): Array<{ providerMessageId: string; status: MetaWhatsAppStatus; raw: unknown }> {
  if (typeof payload !== "object" || payload === null || !("entry" in payload) || !Array.isArray(payload.entry)) {
    return [];
  }

  const statuses: Array<{ providerMessageId: string; status: MetaWhatsAppStatus; raw: unknown }> = [];

  for (const entry of payload.entry) {
    if (typeof entry !== "object" || entry === null || !("changes" in entry) || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (typeof change !== "object" || change === null || !("value" in change)) {
        continue;
      }

      const value = change.value;
      if (typeof value !== "object" || value === null || !("statuses" in value) || !Array.isArray(value.statuses)) {
        continue;
      }

      for (const statusItem of value.statuses) {
        if (typeof statusItem !== "object" || statusItem === null) {
          continue;
        }

        const providerMessageId = "id" in statusItem ? String(statusItem.id ?? "") : "";
        const rawStatus = "status" in statusItem ? String(statusItem.status ?? "") : "";

        if (!providerMessageId) {
          continue;
        }

        if (rawStatus === "sent" || rawStatus === "delivered" || rawStatus === "read" || rawStatus === "failed") {
          statuses.push({
            providerMessageId,
            status: rawStatus,
            raw: statusItem,
          });
        }
      }
    }
  }

  return statuses;
}

function extractTextBody(message: Record<string, unknown>) {
  if (message.type === "text" && typeof message.text === "object" && message.text !== null) {
    const text = message.text as Record<string, unknown>;

    if ("body" in text) {
      return String(text.body ?? "").trim();
    }
  }

  if (
    message.type === "interactive" &&
    typeof message.interactive === "object" &&
    message.interactive !== null &&
    "button_reply" in message.interactive
  ) {
    const interactive = message.interactive as Record<string, unknown>;
    const buttonReply = interactive.button_reply;

    if (typeof buttonReply === "object" && buttonReply !== null) {
      const reply = buttonReply as Record<string, unknown>;

      if ("title" in reply) {
        const title = String(reply.title ?? "").trim();
        return title ? `[Interactive reply] ${title}` : "[Interactive reply]";
      }
    }
  }

  const type = typeof message.type === "string" && message.type.trim().length > 0 ? message.type.trim() : "message";
  return `[${type}]`;
}

export function extractMetaInboundMessages(
  payload: unknown,
): Array<MetaWhatsAppInboundMessage> {
  if (typeof payload !== "object" || payload === null || !("entry" in payload) || !Array.isArray(payload.entry)) {
    return [];
  }

  const inboundMessages: Array<MetaWhatsAppInboundMessage> = [];

  for (const entry of payload.entry) {
    if (typeof entry !== "object" || entry === null || !("changes" in entry) || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (typeof change !== "object" || change === null || !("value" in change)) {
        continue;
      }

      const value = change.value;
      if (typeof value !== "object" || value === null || !("messages" in value) || !Array.isArray(value.messages)) {
        continue;
      }

      const contacts = "contacts" in value && Array.isArray(value.contacts) ? value.contacts : [];

      for (const message of value.messages) {
        if (typeof message !== "object" || message === null) {
          continue;
        }

        const record = message as Record<string, unknown>;
        const providerMessageId = "id" in record ? String(record.id ?? "") : "";
        const from = "from" in record ? String(record.from ?? "") : "";
        const firstContact =
          contacts.length > 0 && typeof contacts[0] === "object" && contacts[0] !== null
            ? (contacts[0] as Record<string, unknown>)
            : null;
        const profile =
          firstContact && "profile" in firstContact && typeof firstContact.profile === "object" && firstContact.profile !== null
            ? (firstContact.profile as Record<string, unknown>)
            : null;
        const senderName = profile && "name" in profile ? String(profile.name ?? "").trim() : "";
        const body = extractTextBody(record);

        if (!providerMessageId || !from) {
          continue;
        }

        inboundMessages.push({
          providerMessageId,
          from,
          senderName: senderName || from,
          body,
          raw: record,
        });
      }
    }
  }

  return inboundMessages;
}
