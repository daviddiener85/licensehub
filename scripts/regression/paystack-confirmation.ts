import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as generated from "@/generated/prisma/client";

// Load the real implementation with isolated dependencies. No .env, real
// database, provider calls, applications, or payments are used by these tests.
function loadModule<T>(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const source = ts.transpileModule(readFileSync(resolve(file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, {
    exports, Response, Request, URL, URLSearchParams, AbortSignal, Buffer, Date,
    console: { warn() {}, error() {} },
    require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  }, { filename: file });
  return exports as T;
}

const secret = "isolated-test-secret";
const reference = "PAY-TEST-APPLICATION-Q1";
const initialPayment = {
  id: "payment-1", applicationId: "application-1", chargeId: null as string | null,
  method: "PAYSTACK", status: "PENDING", amount: "3500.00", currency: "ZAR",
  reference, checkoutUrl: "https://checkout.paystack.com/test", type: "BASE_FEE",
};
type Payment = typeof initialPayment;
type State = {
  payments: Payment[];
  application: { id: string; currentStatus: string; previousStatus: string | null };
  charges: Array<{ id: string; applicationId: string; status: string }>;
  history: unknown[];
};

function matches(record: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, expected]) => {
    if (typeof expected === "object" && expected !== null && "in" in expected) {
      return (expected.in as unknown[]).includes(record[key]);
    }
    return record[key] === expected;
  });
}

function fixture() {
  let state: State = {
    payments: [{ ...initialPayment }],
    application: { id: "application-1", currentStatus: "QUOTE_APPROVED_AWAITING_PAYMENT", previousStatus: null },
    charges: [{ id: "charge-1", applicationId: "application-1", status: "PENDING" }],
    history: [],
  };
  const controls = {
    failAt: "", conflicts: 0, databaseUnavailable: false, providerUnavailable: false, calls: 0, commits: 0,
    payload: { status: true, data: { id: 123, reference, status: "success", amount: 350000, currency: "ZAR" } } as unknown,
  };
  function failAt(stage: string) {
    if (controls.failAt === stage) { controls.failAt = ""; throw new Error(`Simulated failure: ${stage}`); }
  }
  const database = {
    payment: {
      async findMany({ where, take }: { where: Record<string, unknown>; take: number }) {
        return state.payments.filter(payment => matches(payment, where)).slice(0, take)
          .map(payment => ({ ...payment, amount: new generated.Prisma.Decimal(payment.amount), application: { ...state.application } }));
      },
      async findFirst({ where }: { where: Record<string, unknown> }) {
        if (controls.databaseUnavailable) throw new Error("Database unavailable");
        return state.payments.find(payment => matches(payment, where)) ?? null;
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Partial<Payment> }) {
        const rows = state.payments.filter(payment => matches(payment, where));
        rows.forEach(payment => Object.assign(payment, data));
        return { count: rows.length };
      },
    },
    charge: {
      async updateMany({ where, data }: { where: Record<string, unknown>; data: { status: string } }) {
        failAt("charge");
        const rows = state.charges.filter(charge => matches(charge, where));
        rows.forEach(charge => Object.assign(charge, data));
        return { count: rows.length };
      },
    },
    application: {
      async update({ data }: { data: Partial<State["application"]> }) {
        failAt("application"); Object.assign(state.application, data); return { id: state.application.id };
      },
      async findUnique() {
        return {
          ...state.application, publicToken: "test-public-token", service: { name: "Test service" },
          charges: [], documents: [], payments: state.payments,
        };
      },
    },
    statusHistory: { async create({ data }: { data: unknown }) { failAt("history"); state.history.push(data); } },
    retentionSetting: { async findUnique() { return null; } },
  };
  let transactionQueue = Promise.resolve();
  const prisma = {
    ...database,
    async $transaction<T>(callback: (client: typeof database) => Promise<T>, options: { isolationLevel: string }) {
      assert.equal(options.isolationLevel, "Serializable");
      const previous = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      const snapshot = structuredClone(state);
      try {
        if (controls.databaseUnavailable) throw new Error("Database unavailable");
        if (controls.conflicts > 0) { controls.conflicts--; throw Object.assign(new Error("Serialization conflict"), { code: "P2034" }); }
        const result = await callback(database);
        controls.commits++;
        return result;
      } catch (error) {
        state = snapshot;
        throw error;
      } finally { release(); }
    },
  };
  const dependencies: Record<string, unknown> = {
    "@/generated/prisma/client": generated,
    "@/lib/prisma": { prisma },
    "@/lib/app-url": { appBaseUrl: () => "https://example.invalid" },
    "node:crypto": { createHmac, timingSafeEqual },
    "next/cache": { revalidatePath() {} },
  };
  const paystack = loadModule<typeof import("@/lib/paystack")>("src/lib/paystack.ts", dependencies, {
    process: { env: { PAYSTACK_SECRET_KEY: secret } },
    fetch: async (url: string, options: RequestInit) => {
      controls.calls++;
      assert.equal(url, `https://api.paystack.co/transaction/verify/${reference}`);
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
      if (controls.providerUnavailable) throw new Error("Provider unavailable");
      return Response.json(controls.payload);
    },
  });
  dependencies["@/lib/paystack"] = paystack;
  dependencies["@/lib/payment-confirmation"] = loadModule("src/lib/payment-confirmation.ts", dependencies);
  const confirmation = loadModule<typeof import("@/lib/paystack-confirmation")>("src/lib/paystack-confirmation.ts", dependencies);
  dependencies["@/lib/paystack-confirmation"] = confirmation;
  const webhook = loadModule<typeof import("@/app/api/webhooks/paystack/route")>("src/app/api/webhooks/paystack/route.ts", dependencies);
  const callback = loadModule<typeof import("@/app/api/payments/paystack/callback/route")>("src/app/api/payments/paystack/callback/route.ts", dependencies);
  Object.assign(dependencies, {
    "react/jsx-runtime": jsxRuntime,
    "next/link": { default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) },
    "next/navigation": { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } },
    "@/components/eft-proof-upload-form": { EftProofUploadForm: () => null },
    "@/components/public-footer": { PublicFooter: () => null },
    "@/lib/applications": { formatMoney: () => "R3500.00" },
    "@/lib/workflow-actions": { approveClientQuote() {}, uploadEftProof() {} },
  });
  const page = loadModule<typeof import("@/app/apply/submitted/page")>("src/app/apply/submitted/page.tsx", dependencies);
  const event = (overrides: Record<string, unknown> = {}) => ({
    event: "charge.success", data: { id: 123, reference, status: "success", amount: 350000, currency: "ZAR", ...overrides },
  });
  function webhookRequest(payload: unknown = event(), signed = true) {
    const body = JSON.stringify(payload);
    return new Request("https://example.invalid/api/webhooks/paystack", { method: "POST", body,
      headers: signed ? { "x-paystack-signature": createHmac("sha512", secret).update(body).digest("hex") } : {} });
  }
  const callbackRequest = (query = `application=application-1&reference=${reference}`) => new Request(`https://example.invalid/api/payments/paystack/callback?${query}`);
  return { get state() { return state; }, controls, paystack, confirmation, webhook, callback, page, event, webhookRequest, callbackRequest };
}

test("signed success atomically confirms payment, charge and application; duplicates are harmless", async () => {
  const f = fixture();
  assert.equal((await f.webhook.POST(f.webhookRequest())).status, 200);
  assert.equal(f.state.payments[0].status, "CONFIRMED");
  assert.equal(f.state.charges[0].status, "PAID");
  assert.equal(f.state.application.currentStatus, "PENDING_REVIEW");
  assert.equal(f.state.payments[0].checkoutUrl, null);
  assert.equal((await f.webhook.POST(f.webhookRequest())).status, 200);
  assert.equal(f.state.history.length, 1);
});

for (const stage of ["charge", "application", "history"]) {
  test(`failure during ${stage} rolls everything back; redelivery completes the payment`, async () => {
    const f = fixture(); const original = structuredClone(f.state); f.controls.failAt = stage;
    assert.equal((await f.webhook.POST(f.webhookRequest())).status, 500);
    assert.deepEqual(f.state, original);
    assert.equal((await f.webhook.POST(f.webhookRequest())).status, 200);
    assert.equal(f.state.application.currentStatus, "PENDING_REVIEW");
    assert.equal(f.state.history.length, 1);
  });
}

for (const bad of [{ amount: 1 }, { amount: 350001 }, { currency: "NGN" }, { amount: 0 }, { amount: "350000" }, { currency: null }, { id: null }]) {
  test(`reject invalid or mismatched payment details: ${JSON.stringify(bad)}`, async () => {
    const f = fixture(); const original = structuredClone(f.state);
    assert.equal((await f.webhook.POST(f.webhookRequest(f.event(bad)))).status, 400);
    assert.deepEqual(f.state, original);
  });
}

test("missing signature, unknown event and unknown reference never confirm payment", async () => {
  const f = fixture();
  assert.equal((await f.webhook.POST(f.webhookRequest(f.event(), false))).status, 401);
  assert.equal((await f.webhook.POST(f.webhookRequest({ event: "other" }))).status, 200);
  assert.equal((await f.webhook.POST(f.webhookRequest(f.event({ reference: "unknown" })))).status, 200);
  assert.equal(f.state.payments[0].status, "PENDING");
});

test("cancelled payment, cancelled application and duplicate references fail closed", async () => {
  for (const scenario of ["payment", "application", "ambiguous"]) {
    const f = fixture();
    if (scenario === "payment") f.state.payments[0].status = "CANCELLED";
    if (scenario === "application") f.state.application.currentStatus = "CANCELLED";
    if (scenario === "ambiguous") f.state.payments.push({ ...initialPayment, id: "payment-2" });
    const original = structuredClone(f.state);
    await f.webhook.POST(f.webhookRequest());
    assert.deepEqual(f.state, original);
  }
});

test("additional charge pays only its linked charge and restores the previous workflow status", async () => {
  const f = fixture();
  f.state.payments[0].chargeId = "charge-1";
  f.state.application.currentStatus = "ADDITIONAL_CHARGE_RAISED";
  f.state.application.previousStatus = "APPROVED";
  f.state.charges.push({ id: "charge-2", applicationId: "application-1", status: "PENDING" });
  assert.equal((await f.webhook.POST(f.webhookRequest())).status, 200);
  assert.equal(f.state.charges[0].status, "PAID");
  assert.equal(f.state.charges[1].status, "PENDING");
  assert.equal(f.state.application.currentStatus, "APPROVED");
});

test("serialization conflicts are retried with a bounded limit", async () => {
  const f = fixture(); f.controls.conflicts = 2;
  assert.equal((await f.webhook.POST(f.webhookRequest())).status, 200);
  const g = fixture(); g.controls.conflicts = 3;
  assert.equal((await g.webhook.POST(g.webhookRequest())).status, 500);
  assert.equal(g.state.payments[0].status, "PENDING");
});

test("callback verifies with Paystack and confirms even when the webhook has not arrived", async () => {
  const f = fixture();
  const response = await f.callback.GET(f.callbackRequest());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(new URL(response.headers.get("Location")!, "https://example.invalid").searchParams.get("paymentCheck"), "confirmed");
  assert.equal(f.controls.calls, 1);
  assert.equal(f.state.payments[0].status, "CONFIRMED");
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ application: "application-1", paymentCheck: "confirmed" }) }));
  assert.match(html, /Submitted for review/);
});

test("callback and webhook arriving together create one confirmation", async () => {
  const f = fixture();
  const responses = await Promise.all([f.callback.GET(f.callbackRequest()), f.webhook.POST(f.webhookRequest())]);
  assert.deepEqual(responses.map(response => response.status), [303, 200]);
  assert.equal(f.state.history.length, 1);
});

for (const status of ["pending", "ongoing", "failed", "abandoned", "reversed"]) {
  test(`Paystack status ${status} is not mistaken for successful verification`, async () => {
    const f = fixture(); f.controls.payload = { status: true, data: { ...f.event().data, status } };
    const response = await f.callback.GET(f.callbackRequest());
    assert.equal(new URL(response.headers.get("Location")!, "https://example.invalid").searchParams.get("paymentCheck"), "pending");
    assert.equal(f.state.payments[0].status, "PENDING");
  });
}

test("provider errors, malformed responses, mismatched references and amounts do not confirm", async () => {
  for (const scenario of ["network", "database", "invalid", "api-failure", "reference", "amount", "currency"]) {
    const f = fixture();
    if (scenario === "network") f.controls.providerUnavailable = true;
    if (scenario === "database") f.controls.databaseUnavailable = true;
    if (scenario === "invalid") f.controls.payload = {};
    if (scenario === "api-failure") f.controls.payload = { status: false, data: f.event().data };
    if (scenario === "reference") f.controls.payload = { status: true, data: { ...f.event().data, reference: "another-reference" } };
    if (scenario === "amount") f.controls.payload = { status: true, data: { ...f.event().data, amount: 1 } };
    if (scenario === "currency") f.controls.payload = { status: true, data: { ...f.event().data, currency: "NGN" } };
    const response = await f.callback.GET(f.callbackRequest());
    assert.equal(new URL(response.headers.get("Location")!, "https://example.invalid").searchParams.get("paymentCheck"), "unavailable", scenario);
    assert.equal(f.state.payments[0].status, "PENDING", scenario);
  }
});

test("callback rejects references belonging to other applications and conflicting reference parameters", async () => {
  for (const query of [`application=other&reference=${reference}`, `application=application-1&reference=${reference}&trxref=other`, "application=application-1", `reference=${reference}`]) {
    const f = fixture();
    await f.callback.GET(f.callbackRequest(query));
    assert.equal(f.controls.calls, 0);
    assert.equal(f.state.payments[0].status, "PENDING");
  }
});

test("legacy return URLs go through verification; fabricated success flags never show success", async () => {
  const f = fixture();
  await assert.rejects(() => f.page.default({ searchParams: Promise.resolve({ application: "application-1", reference }) }), /REDIRECT:\/api\/payments\/paystack\/callback/);
  await assert.rejects(() => f.page.default({ searchParams: Promise.resolve({ application: "application-1", trxref: reference }) }), /REDIRECT:\/api\/payments\/paystack\/callback/);
  const html = renderToStaticMarkup(await f.page.default({ searchParams: Promise.resolve({ application: "application-1", paymentCheck: "confirmed" }) }));
  assert.doesNotMatch(html, /Submitted for review/);
  assert.match(html, /could not confirm your payment/);
  assert.match(html, /do not pay again/);
  assert.match(html, /Check payment status/);
  assert.match(html, /Continue to Paystack/);
  assert.equal(f.controls.calls, 0);
});

test("new checkout callbacks use the verification handler", () => {
  const f = fixture();
  assert.equal(f.paystack.paystackCallbackUrl("application-1", "https://example.invalid"), "https://example.invalid/api/payments/paystack/callback?application=application-1");
});

test("malformed signatures and incomplete success payloads are rejected", async () => {
  const f = fixture();
  const request = f.webhookRequest();
  request.headers.set("x-paystack-signature", `${request.headers.get("x-paystack-signature")}junk`);
  assert.equal((await f.webhook.POST(request)).status, 401);
  assert.equal((await f.webhook.POST(f.webhookRequest({ event: "charge.success" }))).status, 400);
  assert.equal(f.state.payments[0].status, "PENDING");
});
