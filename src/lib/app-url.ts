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

