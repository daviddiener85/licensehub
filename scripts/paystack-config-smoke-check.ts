import "dotenv/config";

function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

function looksLikePaystackKey(key: string, prefix: "pk_test" | "sk_test" | "pk_live" | "sk_live") {
  return key.startsWith(prefix);
}

const publicKey = value("PAYSTACK_PUBLIC_KEY");
const secretKey = value("PAYSTACK_SECRET_KEY");
const webhookSecret = value("PAYSTACK_WEBHOOK_SECRET");
const appBaseUrl = value("APP_BASE_URL") || "http://localhost:3000";
const callbackUrl = `${appBaseUrl.replace(/\/+$/, "")}/apply/submitted`;
const webhookUrl = `${appBaseUrl.replace(/\/+$/, "")}/api/webhooks/paystack`;

const results = [
  {
    name: "PAYSTACK_PUBLIC_KEY",
    ok: Boolean(publicKey),
    message: publicKey
      ? looksLikePaystackKey(publicKey, "pk_test") || looksLikePaystackKey(publicKey, "pk_live")
        ? "present"
        : "present but unusual prefix"
      : "missing",
  },
  {
    name: "PAYSTACK_SECRET_KEY",
    ok: Boolean(secretKey),
    message: secretKey
      ? looksLikePaystackKey(secretKey, "sk_test") || looksLikePaystackKey(secretKey, "sk_live")
        ? "present"
        : "present but unusual prefix"
      : "missing",
  },
  {
    name: "PAYSTACK_WEBHOOK_SECRET",
    ok: Boolean(webhookSecret) || Boolean(secretKey),
    message: webhookSecret ? "present" : "not set, will fall back to PAYSTACK_SECRET_KEY",
  },
  {
    name: "Callback URL",
    ok: true,
    message: callbackUrl,
  },
  {
    name: "Webhook URL",
    ok: true,
    message: webhookUrl,
  },
];

const failed = results.filter((result) => !result.ok);
const warning = results.filter((result) => result.ok && result.message.includes("unusual prefix"));

console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

if (warning.length > 0) {
  console.warn(
    `Warnings: ${warning.map((result) => `${result.name} (${result.message})`).join(", ")}`,
  );
}

if (failed.length > 0) {
  console.error(
    `Missing or invalid Paystack config: ${failed.map((result) => `${result.name} (${result.message})`).join(", ")}`,
  );
  process.exitCode = 1;
}
