import { revalidatePath } from "next/cache";
import { confirmPaystackPayment } from "@/lib/paystack-confirmation";
import { extractPaystackChargeSuccess, verifyPaystackWebhookSignature } from "@/lib/paystack";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"))) {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let items;
  try {
    items = extractPaystackChargeSuccess(JSON.parse(rawBody));
  } catch {
    return new Response("Invalid webhook payload", { status: 400 });
  }

  let processed = 0;
  try {
    for (const item of items) {
      const result = await confirmPaystackPayment(item);
      if (result === "mismatch") {
        console.error("Paystack confirmation rejected: payment details mismatch.", { reference: item.reference });
        return new Response("Payment details mismatch", { status: 400 });
      }
      if (result === "confirmed" || result === "already_confirmed") {
        processed += 1;
      } else {
        console.warn("Paystack confirmation requires reconciliation.", { reference: item.reference, result });
      }
    }
    if (processed > 0) {
      revalidatePath("/admin");
      revalidatePath("/apply/submitted");
      revalidatePath("/client/[token]", "page");
    }
  } catch {
    console.error("Paystack confirmation failed; returning 500 so the webhook can be retried.");
    return new Response("Payment confirmation temporarily unavailable", { status: 500 });
  }
  return Response.json({ ok: true, processed });
}
