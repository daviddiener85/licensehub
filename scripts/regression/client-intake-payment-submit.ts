import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { chromium, expect, type Page } from "@playwright/test";
import { Client } from "pg";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const chromePath =
  process.env.CHROME_PATH ??
  (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);
const dbUrl = process.env.DATABASE_URL?.replace(/\?schema=public$/, "");
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3ZK7sAAAAASUVORK5CYII=",
  "base64",
);

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

  throw new Error(`Timed out waiting for ${baseUrl}. Start the app with npm run dev first.`);
}

async function createDbClient() {
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}

async function cleanupApplication(db: Client, applicationId: string) {
  const application = await db.query<{ clientId: string }>(
    `select "clientId" from "Application" where "id" = $1`,
    [applicationId],
  );

  if (application.rowCount !== 1) {
    return;
  }

  const documentKeys = await db.query<{ storageKey: string }>(
    `select "storageKey" from "Document" where "applicationId" = $1`,
    [applicationId],
  );
  const mandateKeys = await db.query<{ idPhotoStorageKey: string }>(
    `select "idPhotoStorageKey" from "MandateFormSubmission" where "applicationId" = $1`,
    [applicationId],
  );
  const storageKeys = [
    ...documentKeys.rows.map((row) => row.storageKey),
    ...mandateKeys.rows.map((row) => row.idPhotoStorageKey),
    `mandates/${applicationId}/mandate-form.pdf`,
  ];

  await db.query(`delete from "Application" where "id" = $1`, [applicationId]);
  await db.query(
    `delete from "Client"
     where "id" = $1
       and not exists (select 1 from "Application" where "clientId" = $1)`,
    [application.rows[0].clientId],
  );

  await Promise.all(
    storageKeys.map((storageKey) =>
      rm(join(process.cwd(), "public", "uploads", storageKey), { force: true }).catch(() => undefined),
    ),
  );
}

async function clickProceed(page: Page) {
  await page.getByRole("button", { name: "Proceed" }).click();
}

function southAfricanIdNumber(prefix: string) {
  const sum = prefix.split("").reduce((total, value, index) => {
    let digit = Number(value);

    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    return total + digit;
  }, 0);

  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

async function verifyServicePreselection(page: Page) {
  console.log("Checking public service preselection...");
  await page.goto("/apply?service=change-of-ownership", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Duplicate Certificate/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Change of Ownership/ }).getByText("Selected")).toBeVisible();
  await expect(page.getByRole("button", { name: /Licence Renewal/ })).toBeVisible();
}

async function main() {
  await waitForServer();

  console.log("Connecting to regression database...");
  const db = await createDbClient();
  const tmpDir = await mkdtemp(join(tmpdir(), "license-hub-intake-"));
  const idPhotoPath = join(tmpDir, "owner-id.png");
  const licenceDiskPath = join(tmpDir, "licence-disk.png");
  const proofOfAddressPath = join(tmpDir, "proof-of-address.png");
  let submittedApplicationId = "";

  await Promise.all([
    writeFile(idPhotoPath, onePixelPng),
    writeFile(licenceDiskPath, onePixelPng),
    writeFile(proofOfAddressPath, onePixelPng),
  ]);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });

  try {
    const page = await browser.newPage({ baseURL: baseUrl });
    page.setDefaultTimeout(10000);
    await verifyServicePreselection(page);
    console.log("Opening /apply...");
    await page.goto("/apply", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Proceed" })).toBeVisible();

    console.log("Completing service and ownership steps...");
    await clickProceed(page);
    await clickProceed(page);
    await page.getByRole("button", { name: /Private owner/ }).click();
    await clickProceed(page);

    console.log("Completing client details...");
    await page.locator("select").selectOption("sa-citizen");
    await page.getByLabel("Full name").fill("Regression Intake");
    await page.getByLabel("Cellphone number").fill("0820000000");
    await page.getByLabel("Email address").fill(`intake-${Date.now()}@example.com`);
    const idSequence = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    await page.getByLabel("ID number").fill(southAfricanIdNumber(`900101${idSequence}08`));
    await page.getByLabel("Address line 1").fill("1 Regression Street");
    await page.getByLabel("City").fill("Johannesburg");
    await page.getByLabel("Postal code").fill("2000");
    await page.getByLabel(/License Hub may use these details/).check();
    await clickProceed(page);

    console.log("Completing vehicle details...");
    await page.locator('input[name="licenceDiskPhoto"]').setInputFiles(licenceDiskPath);
    await page.getByRole("textbox", { name: "Register" }).fill("REG123GP");
    await page.getByLabel("VIN / chassis number").fill("VINREGRESSION12345");
    await page.getByLabel("Vehicle make").fill("Toyota");
    await page.getByLabel("Vehicle model").fill("Corolla");
    await page.getByLabel(/I confirm these vehicle details/).check();
    await clickProceed(page);

    console.log("Completing referral step...");
    await page.getByRole("textbox", { name: "Who/which company referred you to us?" }).fill("Regression referrer");
    await clickProceed(page);

    console.log("Uploading mandate documents and signing...");
    await page.locator('input[name="idPhoto"]').setInputFiles(idPhotoPath);
    await page.locator('input[name="proofOfAddress"]').setInputFiles(proofOfAddressPath);
    await expect(page.getByText("owner-id.png")).toBeVisible();
    await expect(page.getByText("proof-of-address.png")).toBeVisible();

    const canvas = page.locator("#public-mandate-signature-pad");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error("Signature canvas was not visible.");
    }

    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 120);
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Proceed" })).toBeEnabled();
    await clickProceed(page);

    console.log("Submitting EFT payment step...");
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page.getByText("Proof of address is required.")).toBeHidden({ timeout: 10000 });
    await page.waitForURL(/\/apply\/submitted\?application=/, { timeout: 15000 });

    const applicationId = new URL(page.url()).searchParams.get("application");

    if (!applicationId) {
      throw new Error("Submitted application id was not present in the URL.");
    }

    submittedApplicationId = applicationId;
    await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
    const submittedApplication = await db.query<{ publicToken: string; referralSource: string }>(
      `select "publicToken", "referralSource" from "Application" where id = $1`,
      [applicationId],
    );
    const publicToken = submittedApplication.rows[0]?.publicToken;

    if (!publicToken) {
      throw new Error("Submitted application public token was not found.");
    }

    await db.query(
      `update "Payment"
       set method = 'PAYSTACK', "checkoutUrl" = 'https://example.com/regression-checkout', "providerReference" = 'regression-access-code'
       where "applicationId" = $1 and status = 'PENDING'`,
      [applicationId],
    );

    console.log("Changing the pending payment method from the client status page...");
    await page.goto(`/client/${encodeURIComponent(publicToken)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("PAYSTACK · pending")).toBeVisible();
    await page.getByText("Change payment method", { exact: true }).click();
    await page.getByRole("button", { name: "Switch to EFT" }).click();
    await expect(page.getByText("EFT · pending")).toBeVisible();
    await expect(page.getByText("View EFT banking details", { exact: true })).toBeVisible();

    console.log("Uploading EFT proof and confirming the payment method is locked...");
    await page.getByRole("link", { name: "Continue payment" }).last().click();
    await page.locator('input[name="eftProof"]').setInputFiles(proofOfAddressPath);
    await page.waitForURL(/eftUploaded=1/, { timeout: 15000 });
    await expect(page.getByText("Your EFT proof has been uploaded.")).toBeVisible();
    await page.getByRole("link", { name: "Manage payment options" }).click();
    await expect(
      page.getByText("The payment method can no longer be changed because EFT proof has already been uploaded."),
    ).toBeVisible();
    await expect(page.getByText("Change payment method", { exact: true })).toHaveCount(0);

    const applicationCount = await db.query<{ count: string }>(
      `select count(*)::text as count from "Application" where id = $1`,
      [applicationId],
    );
    expect(Number(applicationCount.rows[0]?.count)).toBe(1);
    const unchangedApplication = await db.query<{ referralSource: string }>(
      `select "referralSource" from "Application" where id = $1`,
      [applicationId],
    );
    expect(unchangedApplication.rows[0]?.referralSource).toBe("Regression referrer");
    const paymentAttempts = await db.query<{ method: string; status: string; proofDocumentId: string | null }>(
      `select method, status, "proofDocumentId" from "Payment" where "applicationId" = $1 order by "createdAt" asc`,
      [applicationId],
    );
    expect(paymentAttempts.rows[0]).toMatchObject({ method: "PAYSTACK", status: "CANCELLED" });
    expect(paymentAttempts.rows[1]).toMatchObject({ method: "EFT", status: "PENDING" });
    expect(paymentAttempts.rows[1]?.proofDocumentId).toBeTruthy();
    console.log(`Client intake payment submit regression passed for ${applicationId}.`);
  } finally {
    await browser.close();

    if (submittedApplicationId) {
      await cleanupApplication(db, submittedApplicationId);
    }

    await db.end();
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
