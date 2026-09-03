import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

async function main() {
  // Explicit opt-in only. Never load .env or use a remote/production database.
  const connectionString = process.env.PAYSTACK_TEST_DATABASE_URL;
  assert.ok(connectionString, "Set PAYSTACK_TEST_DATABASE_URL to a local PostgreSQL test database.");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString).hostname), "Only loopback test databases are allowed.");
  const schema = `paystack_regression_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^paystack_regression_[a-f0-9]{32}$/);
  const admin = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  const database = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }) });
  let created = false;
  try {
    await admin.connect();
    const ddl = execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: connectionString }, stdio: ["ignore", "pipe", "pipe"],
    }).replace('CREATE SCHEMA IF NOT EXISTS "public";', "");
    assert.ok(!ddl.includes('"public"'), "Generated DDL must not target public schema.");
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(ddl);

    // Inject the test-only Prisma instance before importing the implementation.
    process.env.DATABASE_URL = connectionString;
    (globalThis as unknown as { prisma: PrismaClient }).prisma = database;
    const { confirmPaystackPayment } = await import("@/lib/paystack-confirmation");
    const service = await database.service.create({ data: { name: "Regression", slug: "regression", description: "Test", basePrice: "3500.00" } });
    const client = await database.client.create({ data: {
      firstName: "Payment", surname: "Regression", southAfricanIdEncrypted: "synthetic", southAfricanIdHash: schema,
      cellphone: "0800000000", email: "paystack-test@example.invalid", deliveryAddressLine1: "Test",
      deliveryCity: "Test", deliveryPostalCode: "0000", popiaConsentAcceptedAt: new Date(),
    } });
    async function createPayment(id: string) {
      await database.application.create({ data: { id, publicToken: id, clientId: client.id, serviceId: service.id, currentStatus: "QUOTE_APPROVED_AWAITING_PAYMENT" } });
      await database.charge.create({ data: { id: `${id}-charge`, applicationId: id, description: "Test", reason: "QUOTE_V1", amount: "3500.00" } });
      await database.payment.create({ data: { id: `${id}-payment`, applicationId: id, method: "PAYSTACK", type: "BASE_FEE", amount: "3500.00", reference: `PAY-${id}`, checkoutUrl: "https://example.invalid/checkout" } });
      return { reference: `PAY-${id}`, status: "success", amount: 350000, currency: "ZAR", providerReference: "123" };
    }
    const rollback = await createPayment("rollback");
    await admin.query(`CREATE FUNCTION fail_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated history failure'; END $$`);
    await admin.query(`CREATE TRIGGER fail_confirmation BEFORE INSERT ON "StatusHistory" FOR EACH ROW EXECUTE FUNCTION fail_confirmation()`);
    await assert.rejects(() => confirmPaystackPayment(rollback));
    assert.equal((await database.payment.findUniqueOrThrow({ where: { id: "rollback-payment" } })).status, "PENDING");
    assert.equal((await database.charge.findUniqueOrThrow({ where: { id: "rollback-charge" } })).status, "PENDING");
    assert.equal((await database.application.findUniqueOrThrow({ where: { id: "rollback" } })).currentStatus, "QUOTE_APPROVED_AWAITING_PAYMENT");
    await admin.query(`DROP TRIGGER fail_confirmation ON "StatusHistory"`);
    assert.equal(await confirmPaystackPayment(rollback), "confirmed");
    assert.equal((await database.charge.findUniqueOrThrow({ where: { id: "rollback-charge" } })).status, "PAID");
    assert.equal((await database.application.findUniqueOrThrow({ where: { id: "rollback" } })).currentStatus, "PENDING_REVIEW");
    console.log("PASS: a real PostgreSQL failure rolls back all confirmation writes; retry succeeds.");

    const concurrent = await createPayment("concurrent");
    const results = await Promise.all(Array.from({ length: 6 }, () => confirmPaystackPayment(concurrent)));
    assert.equal(results.filter(result => result === "confirmed").length, 1);
    assert.equal(results.filter(result => result === "already_confirmed").length, 5);
    assert.equal(await database.statusHistory.count({ where: { applicationId: "concurrent" } }), 1);
    console.log("PASS: six concurrent confirmations produce one committed transition and one history entry.");

    const mismatch = await createPayment("mismatch");
    assert.equal(await confirmPaystackPayment({ ...mismatch, amount: 1 }), "mismatch");
    assert.equal(await confirmPaystackPayment({ ...mismatch, currency: "NGN" }), "mismatch");
    assert.equal((await database.payment.findUniqueOrThrow({ where: { id: "mismatch-payment" } })).status, "PENDING");
    console.log("PASS: amount and currency mismatches leave real database records unchanged.");
  } finally {
    await database.$disconnect();
    if (created) {
      // This uniquely named schema was created above solely for these tests.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      console.log("Removed the disposable regression schema; existing schemas were untouched.");
    }
    await admin.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
