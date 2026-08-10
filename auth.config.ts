import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@prisma/client";
import type { PlanId } from "@/lib/plans";

/**
 * Edge-safe subset of the NextAuth config: no Prisma/bcrypt imports here,
 * so `middleware.ts` (Edge runtime) can use it without pulling in Node-only
 * dependencies. The Credentials provider is added on top of this in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  /**
   * In produzione Auth.js valida l'host della richiesta contro `AUTH_URL`.
   * Dietro un reverse proxy (Docker, Vercel, Railway…) l'host effettivo non è
   * noto in build, quindi va accettato quello inoltrato dal proxy.
   * Presuppone che il proxy normalizzi l'header Host: se l'app venisse esposta
   * direttamente, `AUTH_URL` va impostata sull'host reale.
   */
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const account = user as { userId?: string; role?: UserRole; planId: PlanId };

        token.organizationId = user.id as string;
        token.agencyName = user.name as string;
        // Il ripiego su OWNER copre i token emessi prima dell'introduzione dei
        // ruoli: chi era già dentro è il titolare della propria agenzia.
        token.userId = account.userId ?? "";
        token.role = account.role ?? "OWNER";
        token.planId = account.planId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.organizationId = token.organizationId;
      session.user.agencyName = token.agencyName;
      session.user.userId = token.userId;
      session.user.role = token.role;
      session.user.planId = token.planId;
      return session;
    },
  },
} satisfies NextAuthConfig;
