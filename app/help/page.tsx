import { redirect } from "next/navigation";

/** Alias di `/guida`. Vedi la nota in `app/docs/page.tsx`. */
export default function HelpPage() {
  redirect("/guida");
}
