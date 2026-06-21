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
    console.log("Opening /apply...");
    await page.goto("/apply", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Proceed" })).toBeVisible();

    console.log("Completing service and ownership steps...");
    await clickProceed(page);
    await clickProceed(page);
    await clickProceed(page);

    console.log("Completing client details...");
    await page.locator("select").selectOption("sa-citizen");
    await page.getByLabel("Full name").fill("Regression Intake");
    await page.getByLabel("Cellphone number").fill("0820000000");
    await page.getByLabel("Email address").fill(`intake-${Date.now()}@example.com`);
    await page.getByLabel("ID number").fill(`900101500908${Math.floor(Math.random() * 10)}`);
    await page.getByLabel("Address line 1").fill("1 Regression Street");
    await page.getByLabel("City").fill("Johannesburg");
    await page.getByLabel("Postal code").fill("2000");
    await page.getByLabel(/License Hub may use these details/).check();
    await clickProceed(page);

    console.log("Completing vehicle details...");
    await page.locator('input[name="licenceDiskPhoto"]').setInputFiles(licenceDiskPath);
    await page.getByRole("textbox", { name: "Registration number" }).fill("REG123GP");
    await page.getByLabel("VIN / chassis number").fill("VINREGRESSION12345");
    await page.getByLabel("Vehicle make").fill("Toyota");
    await page.getByLabel("Vehicle model").fill("Corolla");
    await page.getByLabel(/I confirm these vehicle details/).check();
    await clickProceed(page);

    console.log("Reviewing document checklist...");
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
    console.log(`Client intake payment submit regression passed for ${applicationId}.`);
  } finally {
    await browser.close();

    if (submittedApplicationId) {
      await cleanupApplication(db, submittedApplicationId);
    }

    await db.end();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
