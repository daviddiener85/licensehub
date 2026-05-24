import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
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
  matcher: ["/admin/:path*", "/supplier/:path*"],
};

