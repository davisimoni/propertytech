import type { DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";
import type { PlanId } from "@/lib/plans";

declare module "next-auth" {
  interface Session {
    user: {
      /** Confine del multi-tenancy: ogni query ne è filtrata. */
      organizationId: string;
      agencyName: string;
      /** Identità della persona, distinta dall'agenzia a cui appartiene. */
      userId: string;
      role: UserRole;
      planId: PlanId;
    } & DefaultSession["user"];
  }

  interface User {
    userId?: string;
    role?: UserRole;
    planId: PlanId;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    organizationId: string;
    agencyName: string;
    userId: string;
    role: UserRole;
    planId: PlanId;
  }
}
