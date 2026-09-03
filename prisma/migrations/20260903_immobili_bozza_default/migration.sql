-- Nuovi immobili in bozza, non pubblicati.
--
-- Cambia SOLO il valore predefinito: le righe gia' a portafoglio mantengono lo
-- stato che hanno, e nessun immobile pubblicato viene ritirato dai portali.
-- Il feed XML continua a esportare gli stati pubblicabili e non e' toccato.
ALTER TABLE "Property" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
