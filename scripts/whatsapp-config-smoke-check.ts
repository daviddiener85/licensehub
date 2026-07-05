import "dotenv/config";

function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

const provider = value("WHATSAPP_PROVIDER");
const accessToken = value("WHATSAPP_ACCESS_TOKEN");
const phoneNumberId = value("WHATSAPP_PHONE_NUMBER_ID");
const appSecret = value("WHATSAPP_APP_SECRET");
const webhookVerifyToken = value("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
const apiVersion = value("WHATSAPP_API_VERSION") || "v23.0";
const appBaseUrl = value("APP_BASE_URL") || "http://localhost:3000";
const webhookUrl = `${appBaseUrl.replace(/\/+$/, "")}/api/webhooks/whatsapp`;

type CheckResult = {
  name: string;
  ok: boolean;
  message: string;
};

const staticResults: CheckResult[] = [
  {
    name: "WHATSAPP_PROVIDER",
    ok: provider.toLowerCase() === "meta_cloud_api",
    message: provider
      ? provider.toLowerCase() === "meta_cloud_api"
        ? "present"
        : `unexpected value "${provider}", expected "meta_cloud_api"`
      : 'missing (should be "meta_cloud_api")',
  },
  {
    name: "WHATSAPP_ACCESS_TOKEN",
    ok: Boolean(accessToken),
    message: accessToken ? "present" : "missing",
  },
  {
    name: "WHATSAPP_PHONE_NUMBER_ID",
    ok: Boolean(phoneNumberId),
    message: phoneNumberId ? "present" : "missing",
  },
  {
    name: "WHATSAPP_APP_SECRET",
    ok: Boolean(appSecret),
    message: appSecret ? "present" : "missing (incoming webhook calls are rejected without this)",
  },
  {
    name: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    ok: Boolean(webhookVerifyToken),
    message: webhookVerifyToken ? "present" : "missing",
  },
  {
    name: "Webhook URL",
    ok: true,
    message: `${webhookUrl} (must match the Callback URL configured in Meta's WhatsApp webhook settings)`,
  },
];

function metaErrorMessage(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error
  ) {
    return String(payload.error.message);
  }

  return `Meta API error (${status})`;
}

async function checkLivePhoneNumber(): Promise<CheckResult> {
  if (!accessToken || !phoneNumberId) {
    return {
      name: "Live phone number check",
      ok: false,
      message: "skipped (WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are both required)",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return { name: "Live phone number check", ok: false, message: metaErrorMessage(payload, response.status) };
    }

    const displayNumber =
      typeof payload === "object" && payload !== null && "display_phone_number" in payload
        ? String(payload.display_phone_number)
        : "unknown number";
    const verifiedName =
      typeof payload === "object" && payload !== null && "verified_name" in payload
        ? String(payload.verified_name)
        : "unverified name";

    return {
      name: "Live phone number check",
      ok: true,
      message: `token can read this phone number — ${displayNumber} (${verifiedName})`,
    };
  } catch (error) {
    return {
      name: "Live phone number check",
      ok: false,
      message: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}

async function run() {
  const liveResult = await checkLivePhoneNumber();
  const results = [...staticResults, liveResult];
  const failed = results.filter((result) => !result.ok);

  console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

  if (failed.length > 0) {
    console.error(
      `Missing or invalid WhatsApp config: ${failed.map((result) => `${result.name} (${result.message})`).join(", ")}`,
    );
    process.exitCode = 1;
  }
}

run();
