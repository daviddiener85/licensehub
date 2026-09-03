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
  return `${baseUrl}/api/payments/paystack/callback?application=${encodeURIComponent(applicationId)}`;
}

export type PaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string;
};

export function isValidPaystackReference(reference: string) {
  return /^[a-zA-Z0-9.=-]{1,200}$/.test(reference);
}

function parsePaystackTransaction(data: unknown): PaystackTransaction {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid Paystack transaction data.");
  }

  const transaction = data as Record<string, unknown>;
  const id = transaction.id;
  if (
    typeof transaction.reference !== "string" || !isValidPaystackReference(transaction.reference) ||
    typeof transaction.status !== "string" || !transaction.status ||
    typeof transaction.amount !== "number" || !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0 ||
    typeof transaction.currency !== "string" || !/^[A-Z]{3}$/.test(transaction.currency) ||
    !((typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
      (typeof id === "string" && /^[1-9][0-9]*$/.test(id)))
  ) {
    throw new Error("Invalid Paystack transaction data.");
  }

  return {
    reference: transaction.reference,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    providerReference: String(id),
  };
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackTransaction> {
  if (!isValidPaystackReference(reference)) {
    throw new Error("Invalid Paystack reference.");
  }

  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${requiredEnv("PAYSTACK_SECRET_KEY")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== true) {
    throw new Error("Unable to verify the Paystack transaction.");
  }

  const transaction = parsePaystackTransaction(payload.data);
  if (transaction.reference !== reference) {
    throw new Error("Paystack returned a different transaction reference.");
  }
  return transaction;
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

  if (!signatureHeader || !/^[a-f0-9]{128}$/i.test(signatureHeader)) {
    return false;
  }

  const expectedSignature = createHmac("sha512", signingSecret).update(rawBody).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(signatureHeader.toLowerCase(), "hex"), Buffer.from(expectedSignature, "hex"));
  } catch {
    return false;
  }
}

export function extractPaystackChargeSuccess(payload: unknown): PaystackTransaction[] {
  if (typeof payload !== "object" || payload === null || !("event" in payload)) {
    throw new Error("Invalid Paystack event.");
  }

  if ((payload as { event?: unknown }).event !== "charge.success") {
    return [];
  }

  const transaction = parsePaystackTransaction("data" in payload ? payload.data : undefined);
  if (transaction.status !== "success") {
    throw new Error("Invalid Paystack success event.");
  }
  return [transaction];
}
