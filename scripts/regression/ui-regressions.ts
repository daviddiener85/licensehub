import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { Client } from "pg";

type ApplicationSnapshot = {
  currentStatus: string;
  previousStatus: string | null;
  popDueAt: string | null;
  lastPopReminderAt: string | null;
  popReminderCount: number;
  autoCancelOnNoPop: boolean;
};

declare global {
  interface Window {
    __printCalls?: number;
  }
}

// Next.js loads `.env` automatically, but standalone `tsx` scripts need to do it themselves.
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

const applicationId = process.env.REGRESSION_APPLICATION_ID ?? "LH-2026-38F009";
const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const chromePath =
  process.env.CHROME_PATH ??
  (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);
const dbUrl = process.env.DATABASE_URL?.replace(/\?schema=public$/, "");

function requireValue(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep retrying until Next.js is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function createDbClient() {
  const connectionString = requireValue(dbUrl, "DATABASE_URL");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function readApplicationSnapshot(client: Client): Promise<ApplicationSnapshot> {
  const result = await client.query<ApplicationSnapshot>(
    `select
       "currentStatus",
       "previousStatus",
       "popDueAt",
       "lastPopReminderAt",
       "popReminderCount",
       "autoCancelOnNoPop"
     from "Application"
     where "id" = $1`,
    [applicationId],
  );

  if (result.rowCount !== 1) {
    throw new Error(`Application ${applicationId} was not found.`);
  }

  return result.rows[0];
}

async function readApplicationPublicToken(client: Client) {
  const result = await client.query<{ publicToken: string }>(
    `select "publicToken"
     from "Application"
     where "id" = $1`,
    [applicationId],
  );

  if (result.rowCount !== 1) {
    throw new Error(`Application ${applicationId} was not found.`);
  }

  return result.rows[0].publicToken;
}

async function restoreApplication(client: Client, snapshot: ApplicationSnapshot) {
  await client.query(
    `update "Application"
     set "currentStatus" = $2,
         "previousStatus" = $3,
         "popDueAt" = $4,
         "lastPopReminderAt" = $5,
         "popReminderCount" = $6,
         "autoCancelOnNoPop" = $7
     where "id" = $1`,
    [
      applicationId,
      snapshot.currentStatus,
      snapshot.previousStatus,
      snapshot.popDueAt,
      snapshot.lastPopReminderAt,
      snapshot.popReminderCount,
      snapshot.autoCancelOnNoPop,
    ],
  );
}

async function cleanupAdditionalChargeArtifacts(client: Client, chargeDescription: string) {
  const chargeResult = await client.query<{ id: string }>(
    `select "id"
     from "Charge"
     where "applicationId" = $1 and "description" = $2`,
    [applicationId, chargeDescription],
  );

  if (chargeResult.rowCount === 0) {
    return;
  }

  const chargeIds = chargeResult.rows.map((row) => row.id);
  const paymentResult = await client.query<{ id: string }>(
    `select "id"
     from "Payment"
     where "applicationId" = $1 and "chargeId" = any($2::text[])`,
    [applicationId, chargeIds],
  );
  const paymentIds = paymentResult.rows.map((row) => row.id);

  await client.query(`delete from "Communication" where "applicationId" = $1 and "body" like $2`, [
    applicationId,
    `%${chargeDescription}%`,
  ]);
  await client.query(`delete from "StatusHistory" where "applicationId" = $1 and "note" like $2`, [
    applicationId,
    `%${chargeDescription}%`,
  ]);

  if (paymentIds.length > 0) {
    await client.query(`delete from "Payment" where "id" = any($1::text[])`, [paymentIds]);
  }

  await client.query(`delete from "Charge" where "id" = any($1::text[])`, [chargeIds]);
}

async function cleanupStatusLinkResends(client: Client) {
  await client.query(
    `delete from "Communication"
     where "applicationId" = $1 and "templateKey" = 'client-status-link-resend'`,
    [applicationId],
  );
}

async function main() {
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  await waitForServer();

  const db = await createDbClient();
  const snapshot = await readApplicationSnapshot(db);
  const publicToken = await readApplicationPublicToken(db);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });

  try {
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies([{ name: "lh_role", value: "ADMIN", domain: "localhost", path: "/" }]);

    let chargeDescription = "";

    try {
      const adminPage = await context.newPage();
      await adminPage.goto(`/admin?application=${applicationId}`, { waitUntil: "networkidle" });

      await adminPage.getByRole("button", { name: "Payment reminder" }).click();
      await expect(adminPage.locator('textarea[name="body"]')).toHaveValue(/waiting for payment confirmation/);

      const statusPage = await context.newPage();
      await statusPage.goto(`/client/${publicToken}`, { waitUntil: "networkidle" });
      await expect(statusPage.getByRole("heading", { name: `Application ${applicationId}` })).toBeVisible();
      await expect(statusPage.getByText("Current status")).toBeVisible();

      await cleanupStatusLinkResends(db);
      await adminPage.getByRole("button", { name: "Resend status link" }).click();
      await expect
        .poll(async () => {
          const result = await db.query<{ count: string }>(
            `select count(*)::text as count
             from "Communication"
             where "applicationId" = $1 and "templateKey" = 'client-status-link-resend' and "body" like $2`,
            [applicationId, `%/client/${publicToken}%`],
          );

          return Number(result.rows[0].count);
        })
        .toBe(1);

      const chargeAmount = "321.09";
      chargeDescription = `Regression charge ${Date.now()}`;

      await adminPage.getByRole("button", { name: "Add Charge" }).click();
      await expect(adminPage.getByRole("heading", { name: "Create a charge" })).toBeVisible();
      await adminPage.locator('input[name="chargeAmount"]').fill(chargeAmount);
      await adminPage.locator('input[name="chargeDescription"]').fill(chargeDescription);
      await adminPage.getByRole("button", { name: "Send Charge" }).click();
      await expect(adminPage.getByRole("heading", { name: "Create a charge" })).toBeHidden({ timeout: 10000 });
      await expect(adminPage.getByText("Additional charge pending")).toBeVisible({ timeout: 10000 });

      const submittedPage = await context.newPage();
      await submittedPage.goto(`/apply/submitted?application=${applicationId}`, { waitUntil: "networkidle" });
      await expect(submittedPage.getByRole("heading", { name: "Additional charge required" })).toBeVisible();
      await expect(submittedPage.getByText("R321.09")).toBeVisible();
      await expect(submittedPage.getByText("Continue to Paystack")).toBeVisible();

      const chargeResult = await db.query<{ id: string; description: string; amount: string }>(
        `select "id", "description", "amount"
         from "Charge"
         where "applicationId" = $1 and "description" = $2`,
        [applicationId, chargeDescription],
      );
      expect(chargeResult.rowCount).toBe(1);

      const paymentResult = await db.query<{ id: string; type: string; status: string; reference: string }>(
        `select "id", "type", "status", "reference"
         from "Payment"
         where "applicationId" = $1 and "chargeId" = $2`,
        [applicationId, chargeResult.rows[0].id],
      );
      expect(paymentResult.rowCount).toBe(1);
      expect(paymentResult.rows[0].type).toBe("ADDITIONAL_CHARGE");
      expect(paymentResult.rows[0].status).toBe("PENDING");

      const statusResult = await db.query<{ currentStatus: string }>(
        `select "currentStatus"
         from "Application"
         where "id" = $1`,
        [applicationId],
      );
      expect(statusResult.rows[0].currentStatus).toBe("ADDITIONAL_CHARGE_RAISED");
    } finally {
      if (chargeDescription) {
        await cleanupAdditionalChargeArtifacts(db, chargeDescription);
      }
      await cleanupStatusLinkResends(db);
      await restoreApplication(db, snapshot);
    }

    try {
      await db.query(`update "Application" set "currentStatus" = 'AT_SUPPLIER' where "id" = $1`, [applicationId]);

      const supplierPage = await context.newPage();
      await supplierPage.addInitScript(() => {
        window.__printCalls = 0;
        window.print = () => {
          window.__printCalls = (window.__printCalls ?? 0) + 1;
        };
      });
      await supplierPage.goto(`/supplier?order=${applicationId}`, { waitUntil: "networkidle" });
      await expect(supplierPage.getByRole("button", { name: "Print Pack" })).toBeVisible();
      await supplierPage.getByRole("button", { name: "Print Pack" }).click();
      await expect.poll(async () => supplierPage.evaluate(() => window.__printCalls)).toBe(1);
    } finally {
      await restoreApplication(db, snapshot);
    }

    console.log("Regression checks passed.");
  } finally {
    await browser.close();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
