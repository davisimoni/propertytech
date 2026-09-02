-- Postazioni acquistate oltre quelle incluse nel piano.
--
-- Additiva e con default a zero: le agenzie esistenti restano esattamente
-- dove sono, con le sole postazioni del loro piano.
ALTER TABLE "Organization" ADD COLUMN     "extraSeats" INTEGER NOT NULL DEFAULT 0;
