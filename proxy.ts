import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth/nextAuth";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";

/**
 * Optimistic session gate only. Server services still re-check authorization.
 * Demo/test runtime is unchanged and does not require authentication.
 */
export async function proxy(request: NextRequest) {
  if (!isProductionRuntime()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/")
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (!session?.user) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
