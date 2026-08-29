import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";
import { isGoogleAuthEnabled } from "@/lib/auth-providers";
import { createOrganizationWithReferralCode } from "@/lib/referrals/code";
import { linkReferral } from "@/lib/referrals/link";
import { REFERRAL_COOKIE_NAME } from "@/lib/referrals/constants";
import type { UserRole } from "@prisma/client";
import type { PlanId } from "@/lib/plans";

/**
 * Crea l'agenzia al primo accesso Google, con lo stesso corredo di
 * `/api/register`: subscription trial + contatori azzerati. `agencyName` parte
 * dal nome dell'account Google e resta modificabile dalle impostazioni: Google
 * non conosce la ragione sociale dell'agenzia.
 */
/**
 * Separa il nome visualizzato di Google in nome e cognome.
 *
 * Il primo token è il nome, tutto il resto il cognome: "Anna Maria De Luca"
 * diventa "Anna" + "Maria De Luca", che è sbagliato ma recuperabile, mentre
 * prendere solo l'ultimo token perderebbe metà del cognome. Restano entrambi
 * `null` se dal profilo non arriva nulla di utilizzabile: meglio un campo
 * vuoto che un cognome inventato.
 */
function splitDisplayName(displayName?: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const tokens = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (tokens.length < 2) return { firstName: tokens[0] ?? null, lastName: null };

  return { firstName: tokens[0] ?? null, lastName: tokens.slice(1).join(" ") };
}

async function provisionGoogleOrganization(email: string, displayName?: string | null) {
  // Chi accede con Google può essere un collaboratore già invitato: in quel
  // caso l'agenzia esiste già e non va creata una seconda organizzazione.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  });
  if (existingUser) return existingUser.organization;

  const { firstName, lastName } = splitDisplayName(displayName);

  const organization = await createOrganizationWithReferralCode((referralCode) => ({
    email,
    firstName,
    lastName,
    agencyName: displayName?.trim() || email.split("@")[0] || "La mia agenzia",
    // Dedotto dall'account Google, non dichiarato: la dashboard chiederà
    // all'utente il vero nome dell'agenzia al primo accesso.
    agencyNameConfirmed: false,
    passwordHash: null,
    referralCode,
    subscription: { create: { status: "trial" } },
    usageTracker: { create: {} },
    // Chi apre l'agenzia ne è il titolare. `acceptedAt` è valorizzato subito:
    // l'accesso Google è già la prova che quell'indirizzo gli appartiene.
    users: {
      create: {
        email,
        firstName,
        lastName,
        role: "OWNER",
        acceptedAt: new Date(),
      },
    },
  }));

  // Il redirect OAuth di Google non lascia passare un campo di form: il
  // codice referral, se c'era, viaggia nel cookie scritto da `/register`
  // prima del clic su "Accedi con Google".
  const cookieStore = await cookies();
  await linkReferral(organization.id, cookieStore.get(REFERRAL_COOKIE_NAME)?.value);

  return organization;
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw) => {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      // L'identità è l'utente, non più l'agenzia: dentro la stessa
      // organizzazione possono accedere titolare e collaboratori con
      // credenziali proprie.
      const account = await prisma.user.findUnique({
        where: { email },
        include: { organization: { include: { subscription: true } } },
      });
      if (!account) return null;

      // Senza hash: account creato via Google, oppure invito mai accettato.
      // In entrambi i casi questo provider non può autenticarlo.
      if (!account.passwordHash) return null;

      const isValid = await verifyPassword(password, account.passwordHash);
      if (!isValid) return null;

      return {
        id: account.organizationId,
        email: account.email,
        name: account.organization.agencyName,
        userId: account.id,
        role: account.role,
        planId: (account.organization.subscription?.status ?? "trial") as PlanId,
      };
    },
  }),
];

if (isGoogleAuthEnabled()) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  /**
   * `events` e non `callbacks`: il risultato viene ignorato per costruzione,
   * quindi un guasto qui non puo' impedire un accesso. Registrare il
   * dispositivo e' telemetria di sicurezza, non una condizione per entrare.
   */
  events: {
    async signIn({ user }) {
      if (!user.email) return;

      try {
        const { headers } = await import("next/headers");
        const { prisma } = await import("@/lib/prisma");
        const { recordSignIn } = await import("@/lib/notifications/new-device");

        // L'utente si cerca per EMAIL e non da `user.id`: con il provider
        // Credentials quel campo trasporta l'id dell'ORGANIZZAZIONE (vedi
        // auth.config.ts), e useremmo una chiave sbagliata.
        const record = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, email: true, firstName: true },
        });
        if (!record) return;

        const h = await headers();
        await recordSignIn({
          userId: record.id,
          email: record.email,
          firstName: record.firstName,
          userAgent: h.get("user-agent"),
          // Su Vercel l'IP del client e' il primo della catena in
          // `x-forwarded-for`: gli altri sono i proxy attraversati.
          ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        });
      } catch (error) {
        console.error("[auth] Registrazione del dispositivo non riuscita", {
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    },
  },

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      if (!user.email) return false;

      await provisionGoogleOrganization(user.email, user.name);
      return true;
    },

    /**
     * Sovrascrive il callback edge-safe di `auth.config.ts` con una versione
     * che può interrogare Prisma. Gira solo nel runtime Node (route handler di
     * NextAuth), mai nel middleware, che si limita a leggere il token.
     */
    async jwt({ token, user, account, trigger }) {
      // `update()` lato client (es. dopo aver completato il nome agenzia):
      // rilegge i dati dal database, altrimenti il token continuerebbe a
      // esporre il valore precedente fino al prossimo login.
      if (trigger === "update" && token.organizationId) {
        const organization = await prisma.organization.findUnique({
          where: { id: token.organizationId },
          include: { subscription: true },
        });

        if (organization) {
          token.agencyName = organization.agencyName;
          token.planId = (organization.subscription?.status ?? "trial") as PlanId;
        }
        return token;
      }

      if (!user) return token;

      if (account?.provider === "google" && user.email) {
        // Si parte dall'utente: è lui a dire a quale agenzia appartiene e con
        // quale ruolo. Un collaboratore invitato che accede con Google deve
        // entrare nell'agenzia che lo ha invitato, non in una nuova.
        const member = await prisma.user.findUnique({
          where: { email: user.email },
          include: { organization: { include: { subscription: true } } },
        });

        if (member) {
          token.organizationId = member.organizationId;
          token.agencyName = member.organization.agencyName;
          token.userId = member.id;
          token.role = member.role;
          token.planId = (member.organization.subscription?.status ?? "trial") as PlanId;
        }
        return token;
      }

      const credentialsUser = user as { userId?: string; role?: UserRole; planId: PlanId };

      token.organizationId = user.id as string;
      token.agencyName = user.name as string;
      token.userId = credentialsUser.userId ?? "";
      token.role = credentialsUser.role ?? "OWNER";
      token.planId = credentialsUser.planId;
      return token;
    },
  },
});
