import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";

// Keep in sync with the same bare -> www canonicalization in lib/app-url.ts.
const BARE_HOST = "lichub.co.za";
const WWW_HOST = "www.lichub.co.za";

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function canonicalHostRedirect(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");

  if (host !== BARE_HOST) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.protocol = "https";
  url.host = WWW_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export function middleware(request: NextRequest) {
  const hostRedirect = canonicalHostRedirect(request);

  if (hostRedirect) {
    return hostRedirect;
  }

  const pathname = request.nextUrl.pathname;
  const role = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      return loginRedirect(request);
    }
  }

  if (pathname.startsWith("/supplier")) {
    if (role !== "SUPPLIER" && role !== "ADMIN") {
      return loginRedirect(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

