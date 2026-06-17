import { createHmac, timingSafeEqual } from "node:crypto";

import { appBaseUrl } from "@/lib/app-url";

const PAYSTACK_API_BASE = "https://api.paystack.co";

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name: string) {
  const value = envValue(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function isPaystackConfigured() {
  return Boolean(envValue("PAYSTACK_PUBLIC_KEY") && envValue("PAYSTACK_SECRET_KEY"));
}

export function paystackCallbackUrl(applicationId: string, baseUrl = appBaseUrl()) {
  return `${baseUrl}/apply/submitted?application=${encodeURIComponent(applicationId)}`;
}

export async function initializePaystackTransaction(options: {
  amount: string | number;
  email: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
}) {
  const secretKey = requiredEnv("PAYSTACK_SECRET_KEY");
  const amountInSubunits = Math.round(Number(options.amount) * 100);

  if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {
    throw new Error("Paystack amount must be greater than zero.");
  }

  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: options.email,
      amount: amountInSubunits.toString(),
      reference: options.reference,
      callback_url: options.callbackUrl,
      metadata: options.metadata ?? {},
      ...(options.channels?.length ? { channels: options.channels } : {}),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        status?: boolean;
        message?: unknown;
        data?: unknown;
      }
    | null;

  if (!response.ok || !payload || payload.status !== true) {
    const message = typeof payload?.message === "string" && payload.message.length > 0
      ? payload.message
      : `Paystack initialization failed (${response.status})`;

    throw new Error(message);
  }

  const data = typeof payload.data === "object" && payload.data !== null ? (payload.data as Record<string, unknown>) : null;
  const authorizationUrl = data && "authorization_url" in data ? String(data.authorization_url ?? "") : "";
  const accessCode = data && "access_code" in data ? String(data.access_code ?? "") : "";
  const reference = data && "reference" in data ? String(data.reference ?? options.reference) : options.reference;

  if (!authorizationUrl || !accessCode) {
    throw new Error("Paystack initialization did not return a checkout URL.");
  }

  return {
    authorizationUrl,
    accessCode,
    reference,
    raw: payload,
  };
}

export function verifyPaystackWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const signingSecret = envValue("PAYSTACK_WEBHOOK_SECRET") || envValue("PAYSTACK_SECRET_KEY");

  if (!signingSecret) {
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const expectedSignature = createHmac("sha512", signingSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signatureHeader.toLowerCase(), "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

export function extractPaystackChargeSuccess(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !("event" in payload) || !("data" in payload)) {
    return [];
  }

  if ((payload as { event?: unknown }).event !== "charge.success") {
    return [];
  }

  const data = (payload as { data?: unknown }).data;

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const reference = "reference" in data ? String((data as { reference?: unknown }).reference ?? "") : "";
  const status = "status" in data ? String((data as { status?: unknown }).status ?? "") : "";

  if (!reference || status !== "success") {
    return [];
  }

  return [
    {
      reference,
      raw: data,
    },
  ];
}
