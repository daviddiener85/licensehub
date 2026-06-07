import "dotenv/config";

type DryRunOptions = {
  applicationId: string;
  email: string;
  amount: string;
  reference: string;
  channels: string[];
};

function value(name: string) {
  return process.env[name]?.trim() ?? "";
}

function parseArgs(argv: string[]): Partial<DryRunOptions> {
  const result: Partial<DryRunOptions> = { channels: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = current.split("=", 2);
    const nextValue = inlineValue ?? argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      continue;
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    switch (flag) {
      case "--application-id":
        result.applicationId = nextValue;
        break;
      case "--email":
        result.email = nextValue;
        break;
      case "--amount":
        result.amount = nextValue;
        break;
      case "--reference":
        result.reference = nextValue;
        break;
      case "--channel":
        result.channels = [...(result.channels ?? []), nextValue];
        break;
      default:
        break;
    }
  }

  return result;
}

const argv = parseArgs(process.argv.slice(2));
const applicationId = argv.applicationId || "LH-DRYRUN-0001";
const email = argv.email || "test@example.com";
const amount = argv.amount || "499.00";
const reference = argv.reference || `PAY-${applicationId}-Q1`;
const channels = argv.channels && argv.channels.length > 0 ? argv.channels : ["card", "bank_transfer", "eft"];
const appBaseUrl = value("APP_BASE_URL") || "http://localhost:3000";
const callbackUrl = `${appBaseUrl.replace(/\/+$/, "")}/apply/submitted?application=${encodeURIComponent(applicationId)}`;
const webhookUrl = `${appBaseUrl.replace(/\/+$/, "")}/api/webhooks/paystack`;
const amountInSubunits = Math.round(Number(amount) * 100);
const publicKey = value("PAYSTACK_PUBLIC_KEY");
const secretKey = value("PAYSTACK_SECRET_KEY");

if (!Number.isFinite(amountInSubunits) || amountInSubunits <= 0) {
  console.error(JSON.stringify({ ok: false, error: "Amount must be greater than zero." }, null, 2));
  process.exitCode = 1;
  process.exit();
}

const requestBody = {
  email,
  amount: amountInSubunits.toString(),
  reference,
  callback_url: callbackUrl,
  metadata: {
    applicationId,
    paymentReference: reference,
    flow: "paystack-test-dry-run",
  },
  channels,
};

const output = {
  ok: true,
  environment: {
    hasPublicKey: Boolean(publicKey),
    hasSecretKey: Boolean(secretKey),
    callbackUrl,
    webhookUrl,
  },
  request: {
    method: "POST",
    url: "https://api.paystack.co/transaction/initialize",
    headers: {
      Authorization: "Bearer <PAYSTACK_SECRET_KEY>",
      "Content-Type": "application/json",
    },
    body: requestBody,
  },
};

console.log(JSON.stringify(output, null, 2));
