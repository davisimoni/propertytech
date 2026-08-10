import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Rotte dell'area riservata. `/invito` non è qui di proposito: chi accetta un
 * invito non ha ancora un account, e proteggerla lo rimanderebbe a un accesso
 * che non può ancora effettuare.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/documents",
  "/social",
  "/properties",
  "/voice-reports",
  "/settings",
];
const AUTH_PAGES = ["/login", "/register"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => nextUrl.pathname.startsWith(prefix));
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
