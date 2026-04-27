-- =====================================================================
-- 010 — KYC del inquilino + intereses de mora persistentes
-- =====================================================================

-- ---- Inquilino: datos legales / financieros -------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id              VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id_url          TEXT;        -- foto/PDF de cédula (data URL u objeto storage)
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type          VARCHAR(20); -- 'employee' | 'independent'
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_income           NUMERIC(12,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS income_docs_url          TEXT;        -- carta laboral / colillas / RUT / extractos
ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_clean             BOOLEAN;     -- declara no estar reportado
ALTER TABLE users ADD COLUMN IF NOT EXISTS rental_study_paid        BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rental_study_amount      NUMERIC(12,2);

-- ---- Codeudor (fiador) en el contrato -------------------------------
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_name        VARCHAR(150);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_national_id VARCHAR(40);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_phone       VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_email       VARCHAR(150);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_id_url      TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS guarantor_income_url  TEXT;

-- ---- Mora: configuración por contrato -------------------------------
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS grace_days            INT DEFAULT 3;
-- Tasa mensual (ej. 0.02 = 2 % mes vencido). En Colombia el límite es la tasa de usura.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS late_fee_monthly_rate NUMERIC(6,4) DEFAULT 0.0200;

-- ---- Mora: detalle por pago -----------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12,2); -- canon antes de intereses
ALTER TABLE payments ADD COLUMN IF NOT EXISTS late_fee    NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS days_late   INT DEFAULT 0;

-- Llenar base_amount con el monto actual para registros existentes
UPDATE payments SET base_amount = amount WHERE base_amount IS NULL;

-- LISTO ✅
