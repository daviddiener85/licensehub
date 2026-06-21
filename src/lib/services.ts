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

const fallbackServices: Record<
  string,
  { name: string; description: string; basePrice: string; deliveryFee: string }
> = {
  "duplicate-certificate": {
    name: "Duplicate Certificate",
    description: "Replacement of lost vehicle certificates.",
    basePrice: "499.00",
    deliveryFee: "150.00",
  },
};

function normalizeServicePricing<T extends { slug: string; basePrice: Prisma.Decimal; deliveryFee: Prisma.Decimal }>(
  service: T,
) {
  const fallback = fallbackServices[service.slug];

  if (!fallback) {
    return service;
  }

  const basePrice = Number(service.basePrice.toString());
  const deliveryFee = Number(service.deliveryFee.toString());

  return {
    ...service,
    basePrice: Number.isFinite(basePrice) && basePrice > 0 ? service.basePrice : new Prisma.Decimal(fallback.basePrice),
    deliveryFee:
      Number.isFinite(deliveryFee) && deliveryFee > 0
        ? service.deliveryFee
        : new Prisma.Decimal(fallback.deliveryFee),
  };
}

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

    return rows.map((row) => normalizeServicePricing(row));
  }

  const rows = await prisma.$queryRaw<Array<ServiceSummary>>`
    SELECT slug, name, description, "basePrice", 0::numeric AS "deliveryFee"
    FROM "Service"
    WHERE "isActive" = true
    ORDER BY name ASC
  `;

  return rows.map((row) => normalizeServicePricing(row));
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
      const fallbackService = await upsertFallbackService(slug);

      if (!fallbackService) {
        throw new Error(`Service not found for slug "${slug}".`);
      }

      return fallbackService;
    }

    return normalizeServicePricing(rows[0]);
  }

  const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", "isActive"
    FROM "Service"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    const fallbackService = await upsertFallbackService(slug);

    if (!fallbackService) {
      throw new Error(`Service not found for slug "${slug}".`);
    }

    return fallbackService;
  }

  return normalizeServicePricing(rows[0]);
}

async function upsertFallbackService(slug: string): Promise<ServiceDetail | null> {
  const fallback = fallbackServices[slug];

  if (!fallback) {
    return null;
  }

  const service = await prisma.service.upsert({
    where: { slug },
    update: {
      name: fallback.name,
      description: fallback.description,
      basePrice: fallback.basePrice,
      deliveryFee: fallback.deliveryFee,
      isActive: true,
    },
    create: {
      id: slug,
      slug,
      name: fallback.name,
      description: fallback.description,
      basePrice: fallback.basePrice,
      deliveryFee: fallback.deliveryFee,
      isActive: true,
    },
  });

  return normalizeServicePricing(service);
}

export async function listServiceDetails(): Promise<ServiceDetail[]> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
      SELECT id, slug, name, description, "basePrice", "deliveryFee", "isActive"
      FROM "Service"
      ORDER BY name ASC
    `;

    return rows.map((row) => normalizeServicePricing(row));
  }

  const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", "isActive"
    FROM "Service"
    ORDER BY name ASC
  `;

  return rows.map((row) => normalizeServicePricing(row));
}
