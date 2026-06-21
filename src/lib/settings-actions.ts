"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

function redirectToSettings(notice: string) {
  redirect(`/admin/settings?notice=${encodeURIComponent(notice)}`);
}

export async function createService(formData: FormData) {
  const name = stringField(formData, "name");
  const description = stringField(formData, "description");
  const basePrice = stringField(formData, "basePrice");
  const deliveryFee = stringField(formData, "deliveryFee");

  if (!name || !basePrice || !deliveryFee) {
    throw new Error("Service name, price and delivery fee are required.");
  }

  await prisma.service.create({
    data: {
      name,
      slug: slugify(name),
      description,
      basePrice,
      deliveryFee,
      isActive: formData.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/settings");
  redirectToSettings("Service added.");
}

export async function updateService(formData: FormData) {
  const serviceId = stringField(formData, "serviceId");
  const name = stringField(formData, "name");
  const description = stringField(formData, "description");
  const basePrice = stringField(formData, "basePrice");
  const deliveryFee = stringField(formData, "deliveryFee");

  if (!serviceId || !name || !basePrice || !deliveryFee) {
    throw new Error("Service id, name, price and delivery fee are required.");
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      name,
      description,
      basePrice,
      deliveryFee,
      isActive: formData.get("isActive") === "on",
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  redirectToSettings("Service saved.");
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
  redirectToSettings("Retention saved.");
}

export async function updateAdminWorkspaceSetting(formData: FormData) {
  const interval = Number(stringField(formData, "adminRefreshIntervalSeconds") || 30);
  const safeInterval = Math.max(5, Math.min(600, interval));
  const autoRefreshEnabled = formData.get("adminAutoRefreshEnabled") === "on";
  const aiDocumentVerificationEnabled = formData.get("aiDocumentVerificationEnabled") === "on";
  const eftBankName = stringField(formData, "eftBankName");
  const eftAccountNumber = stringField(formData, "eftAccountNumber");
  const eftBranchCode = stringField(formData, "eftBranchCode");
  const eftAccountType = stringField(formData, "eftAccountType");
  const eftAccountHolder = stringField(formData, "eftAccountHolder");
  const eftReferenceInstruction = stringField(formData, "eftReferenceInstruction");

  await prisma.retentionSetting.upsert({
    where: { id: "default" },
    update: {
      adminAutoRefreshEnabled: autoRefreshEnabled,
      adminRefreshIntervalSeconds: safeInterval,
      aiDocumentVerificationEnabled,
      eftBankName: eftBankName || null,
      eftAccountNumber: eftAccountNumber || null,
      eftBranchCode: eftBranchCode || null,
      eftAccountType: eftAccountType || null,
      eftAccountHolder: eftAccountHolder || null,
      eftReferenceInstruction: eftReferenceInstruction || null,
      updatedByName: stringField(formData, "updatedByName") || "License Hub Admin",
    },
    create: {
      id: "default",
      adminAutoRefreshEnabled: autoRefreshEnabled,
      adminRefreshIntervalSeconds: safeInterval,
      aiDocumentVerificationEnabled,
      eftBankName: eftBankName || null,
      eftAccountNumber: eftAccountNumber || null,
      eftBranchCode: eftBranchCode || null,
      eftAccountType: eftAccountType || null,
      eftAccountHolder: eftAccountHolder || null,
      eftReferenceInstruction: eftReferenceInstruction || null,
      updatedByName: stringField(formData, "updatedByName") || "License Hub Admin",
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  redirectToSettings("Workspace settings saved.");
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
  redirectToSettings("User added.");
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
  redirectToSettings("User saved.");
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
  redirectToSettings(`User ${status === "ACTIVE" ? "activated" : "deactivated"}.`);
}
