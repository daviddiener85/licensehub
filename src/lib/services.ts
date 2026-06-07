import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ServiceSummary = {
  slug: string;
  name: string;
  description: string;
  basePrice: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
};

export type ServiceDetail = ServiceSummary & {
  id: string;
  isActive: boolean;
};

async function hasDeliveryFeeColumn() {
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Service'
  `;

  return columns.some((column) => column.column_name === "deliveryFee");
}

export async function listActiveServices(): Promise<ServiceSummary[]> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceSummary>>`
      SELECT slug, name, description, "basePrice", "deliveryFee"
      FROM "Service"
      WHERE "isActive" = true
      ORDER BY name ASC
    `;

    return rows;
  }

  const rows = await prisma.$queryRaw<Array<ServiceSummary>>`
    SELECT slug, name, description, "basePrice", 0::numeric AS "deliveryFee"
    FROM "Service"
    WHERE "isActive" = true
    ORDER BY name ASC
  `;

  return rows;
}

export async function findActiveServiceBySlug(slug: string): Promise<ServiceDetail> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
      SELECT id, slug, name, description, "basePrice", "deliveryFee", "isActive"
      FROM "Service"
      WHERE slug = ${slug} AND "isActive" = true
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new Error("Service not found.");
    }

    return rows[0];
  }

  const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", "isActive"
    FROM "Service"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error("Service not found.");
  }

  return rows[0];
}

export async function listServiceDetails(): Promise<ServiceDetail[]> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    return prisma.$queryRaw<Array<ServiceDetail>>`
      SELECT id, slug, name, description, "basePrice", "deliveryFee", "isActive"
      FROM "Service"
      ORDER BY name ASC
    `;
  }

  return prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", "isActive"
    FROM "Service"
    ORDER BY name ASC
  `;
}
