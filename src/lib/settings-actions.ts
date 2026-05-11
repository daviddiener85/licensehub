"use server";

import { revalidatePath } from "next/cache";

import { UserRole, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createService(formData: FormData) {
  const name = stringField(formData, "name");
  const description = stringField(formData, "description");
  const basePrice = stringField(formData, "basePrice");

  if (!name || !basePrice) {
    throw new Error("Service name and price are required.");
  }

  await prisma.service.create({
    data: {
      name,
      slug: slugify(name),
      description,
      basePrice,
      isActive: formData.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/settings");
}

export async function updateService(formData: FormData) {
  const serviceId = stringField(formData, "serviceId");
  const name = stringField(formData, "name");
  const description = stringField(formData, "description");
  const basePrice = stringField(formData, "basePrice");

  if (!serviceId || !name || !basePrice) {
    throw new Error("Service id, name and price are required.");
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      name,
      description,
      basePrice,
      isActive: formData.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}

export async function updateRetentionSetting(formData: FormData) {
  const days = stringField(formData, "daysAfterCompletion");

  await prisma.retentionSetting.upsert({
    where: { id: "default" },
    update: {
      daysAfterCompletion: days ? Number(days) : null,
      updatedByName: stringField(formData, "updatedByName") || "License Hub Admin",
    },
    create: {
      id: "default",
      daysAfterCompletion: days ? Number(days) : null,
      updatedByName: stringField(formData, "updatedByName") || "License Hub Admin",
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}

export async function createUser(formData: FormData) {
  const name = stringField(formData, "name");
  const email = stringField(formData, "email").toLowerCase();
  const cellphone = stringField(formData, "cellphone");
  const role = stringField(formData, "role") as keyof typeof UserRole;

  if (!name || !email || !cellphone || !(role in UserRole)) {
    throw new Error("Name, email, cellphone and role are required.");
  }

  await prisma.user.create({
    data: {
      name,
      email,
      cellphone,
      role: UserRole[role],
      status: UserStatus.ACTIVE,
      passwordHash: "replace-with-real-password-hash",
    },
  });

  revalidatePath("/admin/settings");
}

export async function updateUser(formData: FormData) {
  const userId = stringField(formData, "userId");
  const name = stringField(formData, "name");
  const email = stringField(formData, "email").toLowerCase();
  const cellphone = stringField(formData, "cellphone");
  const role = stringField(formData, "role") as keyof typeof UserRole;
  const status = stringField(formData, "status") as keyof typeof UserStatus;

  if (!userId || !name || !email || !cellphone || !(role in UserRole) || !(status in UserStatus)) {
    throw new Error("User id, name, email, cellphone, role and status are required.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      email,
      cellphone,
      role: UserRole[role],
      status: UserStatus[status],
    },
  });

  revalidatePath("/admin/settings");
}

export async function updateUserStatus(formData: FormData) {
  const userId = stringField(formData, "userId");
  const status = stringField(formData, "status") as keyof typeof UserStatus;

  if (!userId || !(status in UserStatus)) {
    throw new Error("User id and status are required.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: UserStatus[status],
    },
  });

  revalidatePath("/admin/settings");
}
