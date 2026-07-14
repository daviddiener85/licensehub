import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ServiceSummary = {
  slug: string;
  name: string;
  description: string;
  basePrice: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  requiresQuote: boolean;
};

export type ServiceDetail = ServiceSummary & {
  id: string;
  isActive: boolean;
};

const fallbackServices: Record<
  string,
  { name: string; description: string; basePrice: string; deliveryFee: string; requiresQuote: boolean }
> = {
  "duplicate-certificate": {
    name: "Duplicate Certificate",
    description: "Replacement of lost vehicle certificates.",
    basePrice: "499.00",
    deliveryFee: "150.00",
    requiresQuote: false,
  },
  "change-of-ownership": {
    name: "Change of Ownership",
    description: "Vehicle ownership transfer assistance. Available in Gauteng only.",
    basePrice: "0.00",
    deliveryFee: "150.00",
    requiresQuote: true,
  },
  "licence-renewal": {
    name: "License Fees",
    description: "Vehicle license fee renewal assistance. Available in Gauteng only.",
    basePrice: "0.00",
    deliveryFee: "150.00",
    requiresQuote: true,
  },
};

function normalizeServicePricing<T extends { slug: string; basePrice: Prisma.Decimal; deliveryFee: Prisma.Decimal }>(
  service: T,
) {
  return service;
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
  await ensureFallbackServices();

  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceSummary>>`
      SELECT slug, name, description, "basePrice", "deliveryFee", "requiresQuote"
      FROM "Service"
      WHERE "isActive" = true
      ORDER BY name ASC
    `;

    return rows.map((row) => normalizeServicePricing(row));
  }

  const rows = await prisma.$queryRaw<Array<ServiceSummary>>`
    SELECT slug, name, description, "basePrice", 0::numeric AS "deliveryFee", false AS "requiresQuote"
    FROM "Service"
    WHERE "isActive" = true
    ORDER BY name ASC
  `;

  return rows.map((row) => normalizeServicePricing(row));
}

async function ensureFallbackServices() {
  await Promise.all(Object.keys(fallbackServices).map((slug) => ensureFallbackServiceExists(slug)));
}

export async function findActiveServiceBySlug(slug: string): Promise<ServiceDetail> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
      SELECT id, slug, name, description, "basePrice", "deliveryFee", "requiresQuote", "isActive"
      FROM "Service"
      WHERE slug = ${slug} AND "isActive" = true
      LIMIT 1
    `;

    if (rows.length === 0) {
      const fallbackService = await ensureFallbackServiceExists(slug);

      if (!fallbackService) {
        throw new Error(`Service not found for slug "${slug}".`);
      }

      return fallbackService;
    }

    return normalizeServicePricing(rows[0]);
  }

  const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", false AS "requiresQuote", "isActive"
    FROM "Service"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    const fallbackService = await ensureFallbackServiceExists(slug);

    if (!fallbackService) {
      throw new Error(`Service not found for slug "${slug}".`);
    }

    return fallbackService;
  }

  return normalizeServicePricing(rows[0]);
}

async function ensureFallbackServiceExists(slug: string): Promise<ServiceDetail | null> {
  const fallback = fallbackServices[slug];

  if (!fallback) {
    return null;
  }

  const existingService = await prisma.service.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      basePrice: true,
      deliveryFee: true,
      requiresQuote: true,
      isActive: true,
    },
  });

  if (existingService) {
    return normalizeServicePricing(existingService);
  }

  const service = await prisma.service.create({
    data: {
      id: slug,
      slug,
      name: fallback.name,
      description: fallback.description,
      basePrice: fallback.basePrice,
      deliveryFee: fallback.deliveryFee,
      requiresQuote: fallback.requiresQuote,
      isActive: true,
    },
  });

  return normalizeServicePricing(service);
}

export async function listServiceDetails(): Promise<ServiceDetail[]> {
  const columnExists = await hasDeliveryFeeColumn();

  if (columnExists) {
    const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
      SELECT id, slug, name, description, "basePrice", "deliveryFee", "requiresQuote", "isActive"
      FROM "Service"
      ORDER BY name ASC
    `;

    return rows.map((row) => normalizeServicePricing(row));
  }

  const rows = await prisma.$queryRaw<Array<ServiceDetail>>`
    SELECT id, slug, name, description, "basePrice", 0::numeric AS "deliveryFee", false AS "requiresQuote", "isActive"
    FROM "Service"
    ORDER BY name ASC
  `;

  return rows.map((row) => normalizeServicePricing(row));
}
