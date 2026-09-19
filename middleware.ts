import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isProtectedPath } from "@/lib/app-routes";

const { auth } = NextAuth(authConfig);

// Le rotte dell'area riservata stanno in `lib/app-routes.ts`, dove le
// controlla anche il menu: qui ne erano rimaste fuori due.
const AUTH_PAGES = ["/login", "/register"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isProtected = isProtectedPath(nextUrl.pathname);
  const isAuthPage = AUTH_PAGES.includes(nextUrl.pathname);

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
