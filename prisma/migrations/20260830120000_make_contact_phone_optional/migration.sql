-- Il telefono nel modulo di contatto diventa facoltativo.
--
-- Solo la rimozione del vincolo NOT NULL: le righe esistenti conservano il
-- proprio numero, e nessuna di esse viene toccata. NULL vorra' dire "non
-- fornito", che e' diverso dalla stringa vuota di un numero cancellato.
ALTER TABLE "ContactRequest" ALTER COLUMN "phone" DROP NOT NULL;
