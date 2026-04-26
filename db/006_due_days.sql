-- =====================================================================
-- Mi Casa — Migración 006: días de pago de arriendo y servicios
-- =====================================================================
-- El dueño configura una sola vez:
--   * rent_due_day  → día del mes en que vence el arriendo (1-31)
--   * water_due_day → día en que llega/se paga el agua
--   * power_due_day → día de la luz
--   * gas_due_day   → día del gas
--   * internet_due_day → día de internet (extra útil)
-- El inquilino verá un calendario simple con esas fechas en su pantalla.

ALTER TABLE houses ADD COLUMN IF NOT EXISTS rent_due_day      SMALLINT CHECK (rent_due_day      BETWEEN 1 AND 31);
ALTER TABLE houses ADD COLUMN IF NOT EXISTS water_due_day     SMALLINT CHECK (water_due_day     BETWEEN 1 AND 31);
ALTER TABLE houses ADD COLUMN IF NOT EXISTS power_due_day     SMALLINT CHECK (power_due_day     BETWEEN 1 AND 31);
ALTER TABLE houses ADD COLUMN IF NOT EXISTS gas_due_day       SMALLINT CHECK (gas_due_day       BETWEEN 1 AND 31);
ALTER TABLE houses ADD COLUMN IF NOT EXISTS internet_due_day  SMALLINT CHECK (internet_due_day  BETWEEN 1 AND 31);

-- Notas opcionales por servicio (ej: "Empresa: Acueducto Bogotá – cuenta 12345")
ALTER TABLE houses ADD COLUMN IF NOT EXISTS services_notes TEXT;

-- LISTO ✅
