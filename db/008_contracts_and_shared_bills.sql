-- =====================================================================
-- Mi Casa — Migración 008
-- 1) Contratos: cuerpo escrito + firma digital (dueño y inquilino)
-- 2) Recibos compartidos: un recibo (gas, agua, luz...) que se divide
--    entre varias propiedades del dueño.
-- =====================================================================

-- ---- 1) Contratos: cuerpo y firmas digitales (dataURL base64) ---------
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS body_text         TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_owner   TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signature_tenant  TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_owner_at   TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_tenant_at  TIMESTAMPTZ;

-- ---- 2) Recibos compartidos -------------------------------------------
CREATE TABLE IF NOT EXISTS utility_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  type            utility_type NOT NULL,
  period_month    INT NOT NULL,
  period_year     INT NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL,
  due_date        DATE,
  bill_url        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS utility_bill_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID NOT NULL REFERENCES utility_bills(id) ON DELETE CASCADE,
  house_id    UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL,
  paid        BOOLEAN DEFAULT FALSE,
  paid_at     TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bill_id, house_id)
);

CREATE INDEX IF NOT EXISTS idx_ubs_house ON utility_bill_shares(house_id);
CREATE INDEX IF NOT EXISTS idx_ub_owner  ON utility_bills(owner_id);

-- LISTO ✅
