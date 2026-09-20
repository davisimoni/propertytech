/**
 * Assegna manualmente un piano a un'agenzia, senza passare da Stripe.
 *
 * Serve alle **agenzie partner in anteprima**: usano tutte le funzioni senza
 * carta di credito, mentre il paywall resta attivo per tutti gli altri.
 *
 * # Come funziona
 *
 * Il piano di un'agenzia è `Subscription.status`, ed è da lì che leggono sia
 * il gate a crediti (`checkUsageLimit`) sia quello per piano
 * (`checkFeatureAccess`). Scriverlo a mano è quindi sufficiente e non
 * richiede nessuna deroga nel codice: nessun ramo speciale, nessuna
 * variabile d'ambiente che qualcuno può dimenticare accesa in produzione.
 *
 * # Perché NON si usa DEV_BYPASS_PAYWALL
 *
 * Perché quello disattiva il paywall per **tutti** e solo fuori produzione:
 * è uno strumento di collaudo locale, non un modo di regalare il prodotto a
 * un'agenzia specifica su un ambiente vero.
 *
 * # Uso
 *
 *   npx --yes tsx scripts/assegna-piano.ts --lista
 *   npx --yes tsx scripts/assegna-piano.ts --stato <email | organizationId>
 *   npx --yes tsx scripts/assegna-piano.ts <email | organizationId> <piano>
 *   npx --yes tsx scripts/assegna-piano.ts mario@agenzia.it enterprise
 *   npx --yes tsx scripts/assegna-piano.ts mario@agenzia.it trial        # revoca
 *
 * Piani validi: trial · starter · pro · enterprise
 * (attenzione: "pro", non "professional")
 *
 * Le variabili d'ambiente vanno caricate prima, come per le migrazioni:
 *   set -a && source .env.local && set +a
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { PLANS, type PlanId } from "../lib/plans";
import { datiCambioPiano } from "../lib/billing/usage-period";

const PIANI_VALIDI = Object.keys(PLANS) as PlanId[];

function esci(messaggio: string, codice = 1): never {
  console.error(messaggio);
  process.exit(codice);
}

async function elencaAgenzie(): Promise<void> {
  const agenzie = await prisma.organization.findMany({
    select: {
      id: true,
      agencyName: true,
      subscription: { select: { status: true, stripeSubscriptionId: true } },
      users: { select: { email: true, role: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${agenzie.length} agenzie:\n`);
  for (const a of agenzie) {
    const piano = a.subscription?.status ?? "nessun abbonamento";
    const pagante = a.subscription?.stripeSubscriptionId ? " [PAGANTE su Stripe]" : "";
    console.log(`  ${(a.agencyName ?? "—").padEnd(24)} ${piano.padEnd(11)}${pagante}`);
    console.log(`    id: ${a.id}`);
    console.log(`    titolare: ${a.users[0]?.email ?? "—"}\n`);
  }
}

/**
 * Stato di un singolo account, prima di consegnarlo a qualcuno.
 *
 * # Perché serve, e perché il piano da solo non basta
 *
 * Assegnare l'Enterprise sblocca le funzioni, ma non è l'unica cosa che può
 * fermare chi accede. L'area riservata mostra **solo** l'accettazione del DPA
 * finché `dpaAcceptedAt` è vuoto (`app/(app)/layout.tsx`): un account creato
 * via Google o Microsoft non passa dal form di registrazione e quindi ci
 * arriva senza. Chi entra non vede la dashboard, vede un modulo da firmare —
 * e se è un revisore esterno, per esempio quello dell'App Review di Meta, non
 * ha modo di sapere che dietro c'è tutto il resto.
 *
 * Quel campo non si compila da qui, mai: vale come prova di un consenso
 * prestato da una persona, e precompilarlo significherebbe fabbricare quella
 * prova. Il comando lo **segnala** e basta; ad accettare va chi possiede
 * l'account, dalla dashboard.
 *
 * Dei segreti si stampa l'esistenza, non il valore: un token WhatsApp finito
 * in un terminale è un token da revocare.
 */
async function mostraStato(riferimento: string): Promise<void> {
  const organizzazione = await prisma.organization.findFirst({
    where: {
      OR: [{ id: riferimento }, { users: { some: { email: riferimento.toLowerCase() } } }],
    },
    select: {
      id: true,
      agencyName: true,
      dpaAcceptedAt: true,
      dpaAcceptedVersion: true,
      subscription: { select: { status: true, stripeSubscriptionId: true, billingCycleAnchor: true } },
      whatsAppConfig: { select: { provider: true, isConnected: true, metaAccessToken: true } },
      users: { select: { email: true, role: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!organizzazione) {
    esci(`Nessuna agenzia trovata per "${riferimento}".`);
  }

  const wa = organizzazione.whatsAppConfig;
  const spunta = (condizione: boolean) => (condizione ? "✔" : "✘");

  console.log(`\n${organizzazione.agencyName ?? "—"}`);
  console.log(`  id: ${organizzazione.id}`);
  console.log(`  piano: ${organizzazione.subscription?.status ?? "nessun abbonamento"}`);
  console.log(
    `  abbonamento Stripe: ${organizzazione.subscription?.stripeSubscriptionId ?? "nessuno (piano assegnato a mano)"}`
  );
  // Da qui ripartono i crediti ogni mese anche senza Stripe: su un piano dato
  // a mano è l'unica data che dice quando il contatore si azzera.
  console.log(
    `  crediti rinnovati dal: ${
      organizzazione.subscription?.billingCycleAnchor?.toISOString().slice(0, 10) ?? "—"
    } di ogni mese`
  );
  console.log(
    `  ${spunta(Boolean(organizzazione.dpaAcceptedAt))} DPA accettato: ` +
      (organizzazione.dpaAcceptedAt
        ? `${organizzazione.dpaAcceptedAt.toISOString().slice(0, 10)} (versione ${organizzazione.dpaAcceptedVersion ?? "—"})`
        : "NO — chi accede vede solo il modulo di accettazione, non la dashboard")
  );
  console.log(
    `  ${spunta(Boolean(wa?.isConnected))} WhatsApp: ` +
      (wa
        ? `provider ${wa.provider}, ${wa.isConnected ? "collegato" : "non collegato"}, token ${wa.metaAccessToken ? "presente" : "assente"}`
        : "nessuna configurazione")
  );
  console.log(`  utenti: ${organizzazione.users.map((u) => `${u.email} (${u.role})`).join(", ")}\n`);
}

async function main(): Promise<void> {
  const [riferimento, piano] = process.argv.slice(2);

  if (riferimento === "--lista" || riferimento === "--list") {
    await elencaAgenzie();
    return;
  }

  if (riferimento === "--stato") {
    if (!piano) esci("Uso: npx --yes tsx scripts/assegna-piano.ts --stato <email | organizationId>");
    await mostraStato(piano);
    return;
  }

  if (!riferimento || !piano) {
    esci(
      "Uso: npx --yes tsx scripts/assegna-piano.ts <email | organizationId> <piano>\n" +
        `Piani: ${PIANI_VALIDI.join(" · ")}\n` +
        "Elenco agenzie: npx --yes tsx scripts/assegna-piano.ts --lista"
    );
  }

  if (!PIANI_VALIDI.includes(piano as PlanId)) {
    esci(`Piano "${piano}" non valido. Ammessi: ${PIANI_VALIDI.join(" · ")}`);
  }

  // Si accetta l'email di un utente o l'id dell'agenzia: in pratica il
  // partner comunica l'indirizzo con cui accede, non un identificativo
  // interno che non conosce.
  const organizzazione = await prisma.organization.findFirst({
    where: {
      OR: [{ id: riferimento }, { users: { some: { email: riferimento.toLowerCase() } } }],
    },
    select: {
      id: true,
      agencyName: true,
      subscription: { select: { status: true, stripeSubscriptionId: true } },
    },
  });

  if (!organizzazione) {
    esci(
      `Nessuna agenzia trovata per "${riferimento}".\n` +
        "Controlla con: npx --yes tsx scripts/assegna-piano.ts --lista"
    );
  }

  /*
   * Guardia sulle agenzie che pagano davvero.
   *
   * Se esiste un abbonamento Stripe attivo, cambiare lo stato a mano crea una
   * divergenza: il database dice una cosa, Stripe un'altra, e al primo evento
   * del webhook il valore scritto qui viene sovrascritto senza preavviso.
   * Peggio, su un declassamento l'agenzia continuerebbe a pagare per un piano
   * che non ha più.
   */
  if (organizzazione.subscription?.stripeSubscriptionId) {
    esci(
      `"${organizzazione.agencyName}" ha un abbonamento Stripe attivo ` +
        `(${organizzazione.subscription.stripeSubscriptionId}).\n` +
        "Non lo tocco: il piano va cambiato da Stripe, altrimenti il webhook " +
        "sovrascrive questa modifica e il cliente paga per un piano diverso da quello che ha."
    );
  }

  const precedente = organizzazione.subscription?.status ?? "nessun abbonamento";

  /*
   * Stesse regole del webhook Stripe (`datiCambioPiano`): al cambio di piano
   * i contatori ripartono e il mese di consumo si ancora a oggi, così anche un
   * piano assegnato a mano rinnova le conversazioni ogni mese. Riassegnare lo
   * stesso piano non azzera nulla.
   */
  const adesso = new Date();
  const pianoPrecedente = (organizzazione.subscription?.status ?? "trial") as PlanId;
  const consumo = await prisma.organization.findUnique({
    where: { id: organizzazione.id },
    select: { bonusWhatsappCredits: true, usageTracker: { select: { whatsappCreditsUsed: true } } },
  });

  const scritture: Prisma.PrismaPromise<unknown>[] = [
    // upsert: un'agenzia potrebbe non avere ancora una riga di abbonamento.
    prisma.subscription.upsert({
      where: { organizationId: organizzazione.id },
      create: { organizationId: organizzazione.id, status: piano as PlanId, billingCycleAnchor: adesso },
      update: {
        status: piano as PlanId,
        ...(pianoPrecedente !== piano && { billingCycleAnchor: adesso }),
      },
    }),
  ];

  if (pianoPrecedente !== piano && consumo?.usageTracker) {
    const { tracker, bonusDaScalare } = datiCambioPiano({
      pianoPrecedente,
      usatiWhatsapp: consumo.usageTracker.whatsappCreditsUsed,
      bonus: consumo.bonusWhatsappCredits,
      ancora: adesso,
      adesso,
    });
    scritture.push(prisma.usageTracker.update({ where: { organizationId: organizzazione.id }, data: tracker }));
    if (bonusDaScalare > 0) {
      scritture.push(
        prisma.organization.update({
          where: { id: organizzazione.id },
          data: { bonusWhatsappCredits: { decrement: bonusDaScalare } },
        })
      );
    }
  }

  await prisma.$transaction(scritture);

  console.log(`\n✔ ${organizzazione.agencyName}`);
  console.log(`  ${precedente} → ${piano}`);
  console.log(`  id: ${organizzazione.id}\n`);

  if (piano === "enterprise") {
    console.log("  Ora ha accesso a Social & Annunci, Report Vocali e reportistica avanzata,");
    console.log("  con postazioni e agende illimitate. Nessun addebito: non esiste un");
    console.log("  abbonamento Stripe collegato.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((errore) => {
    console.error("Errore:", errore instanceof Error ? errore.message : errore);
    process.exit(1);
  });
