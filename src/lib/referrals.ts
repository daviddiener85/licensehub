import { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminReferralFilters = {
  query?: string;
  referralSource?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function listAdminReferrals(filters: AdminReferralFilters = {}) {
  const search = (filters.query ?? "").trim();
  const referralSource = (filters.referralSource ?? "").trim();

  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) {
    createdAt.gte = new Date(`${filters.dateFrom}T00:00:00`);
  }
  if (filters.dateTo) {
    createdAt.lte = new Date(`${filters.dateTo}T23:59:59.999`);
  }

  return prisma.application.findMany({
    where: {
      referralSource: referralSource || { not: null },
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
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

export async function listReferralSourceOptions() {
  const rows = await prisma.application.findMany({
    where: { referralSource: { not: null } },
    select: { referralSource: true },
    distinct: ["referralSource"],
    orderBy: { referralSource: "asc" },
  });

  return rows.map((row) => row.referralSource!).filter(Boolean);
}

export function referralAmountPaid(payments: { amount: { toString(): string } }[]) {
  return payments.reduce((total, payment) => total + Number(payment.amount.toString()), 0);
}
