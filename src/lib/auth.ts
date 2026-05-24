export const AUTH_COOKIE_NAME = "lh_role";

export type AuthRole = "ADMIN" | "SUPPLIER";

export function rolePasscodeFor(role: AuthRole) {
  if (role === "ADMIN") {
    return process.env.ADMIN_ACCESS_KEY?.trim() || "";
  }

  return process.env.SUPPLIER_ACCESS_KEY?.trim() || "";
}

export function isValidRole(value: string): value is AuthRole {
  return value === "ADMIN" || value === "SUPPLIER";
}

