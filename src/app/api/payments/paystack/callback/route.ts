import { revalidatePath } from "next/cache";
import { PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { isValidPaystackReference, verifyPaystackTransaction } from "@/lib/paystack";
import { confirmPaystackPayment } from "@/lib/paystack-confirmation";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const applicationId = url.searchParams.get("application");
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  const alternateReference = url.searchParams.get("trxref");
  const destination = new URL("/apply/submitted", url.origin);
  if (applicationId) destination.searchParams.set("application", applicationId);

  let check = "unavailable";
  try {
    if (
      applicationId && applicationId.length <= 128 && reference && isValidPaystackReference(reference) &&
      (!alternateReference || alternateReference === reference)
    ) {
      // Do not let arbitrary references query another application's payment.
      const payment = await prisma.payment.findFirst({
        where: {
          applicationId,
          reference,
          method: PaymentMethod.PAYSTACK,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.CONFIRMED] },
        },
        select: { status: true },
      });
      if (payment?.status === PaymentStatus.CONFIRMED) {
        check = "confirmed";
      } else if (payment) {
        const transaction = await verifyPaystackTransaction(reference);
        const result = await confirmPaystackPayment(transaction, applicationId);
        check = result === "confirmed" || result === "already_confirmed"
          ? "confirmed" : result === "not_successful" ? "pending" : "unavailable";
        if (result === "mismatch" || result === "inactive") {
          console.warn("Paystack callback requires reconciliation.", { reference, result });
        }
      }
    }
    if (check === "confirmed") {
      revalidatePath("/admin");
      revalidatePath("/apply/submitted");
      revalidatePath("/client/[token]", "page");
    }
  } catch {
    console.error("Paystack callback could not verify or confirm payment.");
    check = "unavailable";
  }

  // The query flag only chooses explanatory copy. The page trusts stored status,
  // never this flag, to decide whether payment is confirmed.
  destination.searchParams.set("paymentCheck", check);
  return new Response(null, {
    status: 303,
    // A relative redirect preserves the public host/protocol behind Render's proxy.
    headers: { Location: `${destination.pathname}${destination.search}`, "Cache-Control": "no-store" },
  });
}
