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

import { prisma } from "../lib/prisma";
import { PLANS, type PlanId } from "../lib/plans";

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

async function main(): Promise<void> {
  const [riferimento, piano] = process.argv.slice(2);

  if (riferimento === "--lista" || riferimento === "--list") {
    await elencaAgenzie();
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

  // upsert: un'agenzia potrebbe non avere ancora una riga di abbonamento.
  await prisma.subscription.upsert({
    where: { organizationId: organizzazione.id },
    create: { organizationId: organizzazione.id, status: piano as PlanId },
    update: { status: piano as PlanId },
  });

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
