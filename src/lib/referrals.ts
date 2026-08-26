import { PaymentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function listAdminReferrals(query = "") {
  const search = query.trim();

  return prisma.application.findMany({
    where: {
      referralSource: { not: null },
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: "insensitive" } },
              { registrationNumber: { contains: search, mode: "insensitive" } },
              { referralSource: { contains: search, mode: "insensitive" } },
              { client: { firstName: { contains: search, mode: "insensitive" } } },
              { client: { surname: { contains: search, mode: "insensitive" } } },
              { client: { cellphone: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      client: true,
      payments: {
        where: { status: PaymentStatus.CONFIRMED },
      },
    },
  });
}

export function referralAmountPaid(payments: { amount: { toString(): string } }[]) {
  return payments.reduce((total, payment) => total + Number(payment.amount.toString()), 0);
}
