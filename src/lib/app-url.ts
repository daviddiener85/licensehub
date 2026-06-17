import { headers } from "next/headers";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function appBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim();

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  return "http://localhost:3000";
}

export async function requestBaseUrl() {
  const headersList = await headers();
  const forwardedHost = headersList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headersList.get("host")?.split(",")[0]?.trim();

  if (!host) {
    return appBaseUrl();
  }

  const forwardedProto = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || (host.includes("localhost") ? "http" : "https");

  return normalizeBaseUrl(`${protocol}://${host}`);
}
