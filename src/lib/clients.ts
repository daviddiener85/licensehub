import { prisma } from "@/lib/prisma";

export async function listAdminClients(query = "") {
  const search = query.trim();

  return prisma.client.findMany({
    where: search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { surname: { contains: search, mode: "insensitive" } },
            { cellphone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { deliveryCity: { contains: search, mode: "insensitive" } },
            { deliveryPostalCode: { contains: search, mode: "insensitive" } },
            {
              applications: {
                some: {
                  OR: [
                    { id: { contains: search, mode: "insensitive" } },
                    { registrationNumber: { contains: search, mode: "insensitive" } },
                    { vin: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : undefined,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      applications: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          service: true,
          payments: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}
