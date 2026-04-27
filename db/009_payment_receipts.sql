-- =====================================================================
-- Mi Casa — Migración 009: comprobantes de pago en recibos compartidos
-- =====================================================================

ALTER TABLE utility_bill_shares ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE utility_bill_shares ADD COLUMN IF NOT EXISTS reference   TEXT;

-- payments ya tiene receipt_url y reference; aseguramos por si falta
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference   VARCHAR(120);

-- LISTO ✅
