"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME, isValidRole, rolePasscodeFor } from "@/lib/auth";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginWithRolePasscode(formData: FormData) {
  const role = stringField(formData, "role");
  const passcode = stringField(formData, "passcode");
  const nextPath = stringField(formData, "nextPath") || (role === "SUPPLIER" ? "/supplier" : "/admin");

  if (!isValidRole(role)) {
    throw new Error("Invalid role selected.");
  }

  const expectedPasscode = rolePasscodeFor(role);

  if (!expectedPasscode) {
    throw new Error(`No ${role} access key has been configured on the server.`);
  }

  if (passcode !== expectedPasscode) {
    throw new Error("Incorrect access key.");
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { error: "", redirectTo: nextPath };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
