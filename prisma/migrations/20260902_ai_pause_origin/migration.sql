-- Origine della sospensione dell'assistente.
--
-- `aiEnabled = false` da solo non distingue due situazioni opposte: l'agente
-- che ha preso in mano la conversazione, e il filtro che ha zittito un numero
-- che sembrava sbagliato. La seconda non deve sopravvivere a una richiesta
-- immobiliare vera; la prima si'.

-- CreateEnum
CREATE TYPE "AiPauseOrigin" AS ENUM ('AGENTE', 'FILTRO');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "aiPausedBy" "AiPauseOrigin";

-- Backfill delle conversazioni gia' sospese.
--
-- Il filtro sospende solo a `offTopicStreak >= 2` e non azzera il contatore
-- quando lo fa: quel valore e' quindi la firma di una sospensione automatica.
-- Tutto il resto e' stato spento da una persona, ed e' l'ipotesi prudente —
-- riaccendere l'assistente su una chat presa in carico da un agente
-- significherebbe farlo parlare sopra di lui davanti al cliente.
UPDATE "Lead"
SET "aiPausedBy" = 'FILTRO'
WHERE "aiEnabled" = false AND "offTopicStreak" >= 2;

UPDATE "Lead"
SET "aiPausedBy" = 'AGENTE'
WHERE "aiEnabled" = false AND "aiPausedBy" IS NULL;
