import { Suspense } from "react";
import { isGoogleAuthEnabled } from "@/lib/auth-providers";
import { LoginForm } from "./login-form";

/** Come /register: il flag del provider Google va valutato a runtime. */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={isGoogleAuthEnabled()} />
    </Suspense>
  );
}
