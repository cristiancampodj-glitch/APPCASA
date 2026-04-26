-- =====================================================================
-- CASA SaaS — Esquema PostgreSQL
-- Ejecutar en DBeaver conectado a tu base Railway/local
-- Compatible con PostgreSQL 14+
-- =====================================================================

-- Extensiones útiles
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";         -- emails case-insensitive

-- =====================================================================
-- 0. LIMPIEZA (descomenta si quieres reiniciar todo)
-- =====================================================================
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- =====================================================================
-- 1. CASAS / PROPIEDADES (multi-tenant)
-- =====================================================================
CREATE TABLE IF NOT EXISTS houses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) DEFAULT 'Colombia',
    monthly_rent    NUMERIC(12,2) DEFAULT 0,
    currency        VARCHAR(8) DEFAULT 'COP',
    rules           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. USUARIOS (dueños / inquilinos / admin)
-- =====================================================================
CREATE TYPE user_role AS ENUM ('owner', 'tenant', 'admin');

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID REFERENCES houses(id) ON DELETE CASCADE,
    full_name       VARCHAR(150) NOT NULL,
    email           CITEXT UNIQUE NOT NULL,
    phone           VARCHAR(30),
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'tenant',
    avatar_url      TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_house ON users(house_id);
CREATE INDEX idx_users_role  ON users(role);

-- =====================================================================
-- 3. SESIONES / TOKENS (JWT refresh)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    user_agent      TEXT,
    ip              INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- =====================================================================
-- 4. CONTRATOS DE ARRENDAMIENTO
-- =====================================================================
CREATE TYPE contract_status AS ENUM ('active', 'finished', 'cancelled', 'pending');

CREATE TABLE IF NOT EXISTS contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    end_date        DATE,
    monthly_rent    NUMERIC(12,2) NOT NULL,
    deposit         NUMERIC(12,2) DEFAULT 0,
    payment_day     INT CHECK (payment_day BETWEEN 1 AND 31) DEFAULT 5,
    status          contract_status DEFAULT 'active',
    pdf_url         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_house  ON contracts(house_id);

-- =====================================================================
-- 5. PAGOS DE ARRIENDO
-- =====================================================================
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'partial', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'nequi', 'daviplata', 'card', 'other');

CREATE TABLE IF NOT EXISTS payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    period_month    INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year     INT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    amount_paid     NUMERIC(12,2) DEFAULT 0,
    due_date        DATE NOT NULL,
    paid_at         TIMESTAMPTZ,
    method          payment_method DEFAULT 'transfer',
    receipt_url     TEXT,
    reference       VARCHAR(120),
    status          payment_status DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (contract_id, period_month, period_year)
);
CREATE INDEX idx_payments_status   ON payments(status);
CREATE INDEX idx_payments_due      ON payments(due_date);
CREATE INDEX idx_payments_tenant   ON payments(tenant_id);

-- =====================================================================
-- 6. SERVICIOS PÚBLICOS / GASTOS COMPARTIDOS (luz, agua, gas, internet)
-- =====================================================================
CREATE TYPE utility_type AS ENUM ('electricity','water','gas','internet','tv','admin','other');

CREATE TABLE IF NOT EXISTS utilities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    type            utility_type NOT NULL,
    period_month    INT NOT NULL,
    period_year     INT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    due_date        DATE,
    paid            BOOLEAN DEFAULT FALSE,
    paid_at         TIMESTAMPTZ,
    bill_url        TEXT,
    split_among     INT DEFAULT 1,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 7. ROTACIÓN DE LIMPIEZA / TURNOS
-- =====================================================================
CREATE TYPE chore_type AS ENUM ('cleaning','trash','gas_purchase','cooking','laundry','other');
CREATE TYPE chore_status AS ENUM ('pending','done','skipped');

CREATE TABLE IF NOT EXISTS chores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    type            chore_type NOT NULL,
    title           VARCHAR(150) NOT NULL,
    description     TEXT,
    due_date        DATE NOT NULL,
    status          chore_status DEFAULT 'pending',
    completed_at    TIMESTAMPTZ,
    completed_by    UUID REFERENCES users(id),
    proof_url       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chores_house_due ON chores(house_id, due_date);
CREATE INDEX idx_chores_assigned  ON chores(assigned_to);

-- =====================================================================
-- 8. COMPRAS DE GAS / INVENTARIO BÁSICO
-- =====================================================================
CREATE TABLE IF NOT EXISTS gas_purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    bought_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    purchase_date   DATE NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    cylinder_size   VARCHAR(20),
    provider        VARCHAR(80),
    receipt_url     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 9. REPORTES DE DAÑOS
-- =====================================================================
CREATE TYPE damage_status AS ENUM ('reported','in_progress','resolved','rejected');
CREATE TYPE damage_priority AS ENUM ('low','medium','high','urgent');

CREATE TABLE IF NOT EXISTS damages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    reported_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(150) NOT NULL,
    description     TEXT NOT NULL,
    location        VARCHAR(120),
    priority        damage_priority DEFAULT 'medium',
    status          damage_status DEFAULT 'reported',
    estimated_cost  NUMERIC(12,2),
    final_cost      NUMERIC(12,2),
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS damage_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    damage_id       UUID NOT NULL REFERENCES damages(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 10. PQRS (Peticiones, Quejas, Reclamos, Sugerencias)
-- =====================================================================
CREATE TYPE pqrs_type AS ENUM ('peticion','queja','reclamo','sugerencia','felicitacion');
CREATE TYPE pqrs_status AS ENUM ('open','in_review','answered','closed');

CREATE TABLE IF NOT EXISTS pqrs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            pqrs_type NOT NULL,
    subject         VARCHAR(150) NOT NULL,
    body            TEXT NOT NULL,
    is_anonymous    BOOLEAN DEFAULT FALSE,
    status          pqrs_status DEFAULT 'open',
    response        TEXT,
    responded_by    UUID REFERENCES users(id),
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 11. NOTIFICACIONES
-- =====================================================================
CREATE TYPE notif_type AS ENUM ('payment_due','payment_overdue','chore','damage','pqrs','system','announcement');

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            notif_type NOT NULL,
    title           VARCHAR(150) NOT NULL,
    body            TEXT,
    link            TEXT,
    is_read         BOOLEAN DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notif_user_read ON notifications(user_id, is_read);

-- =====================================================================
-- 12. ANUNCIOS / TABLÓN DE LA CASA
-- =====================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(150) NOT NULL,
    body            TEXT NOT NULL,
    pinned          BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 13. CHAT INTERNO (mensajes entre habitantes)
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    from_user       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user         UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = grupal
    body            TEXT NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_house ON messages(house_id, created_at DESC);

-- =====================================================================
-- 14. INVENTARIO COMPARTIDO (papel higiénico, jabón, etc.)
-- =====================================================================
CREATE TABLE IF NOT EXISTS inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    name            VARCHAR(120) NOT NULL,
    quantity        NUMERIC(10,2) DEFAULT 0,
    unit            VARCHAR(20) DEFAULT 'unidad',
    min_stock       NUMERIC(10,2) DEFAULT 1,
    last_bought_by  UUID REFERENCES users(id),
    last_bought_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 15. GASTOS COMPARTIDOS (split bills tipo Splitwise)
-- =====================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    paid_by         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(150) NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    category        VARCHAR(60),
    expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_url     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_splits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id      UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_owed     NUMERIC(12,2) NOT NULL,
    is_paid         BOOLEAN DEFAULT FALSE,
    paid_at         TIMESTAMPTZ
);

-- =====================================================================
-- 16. CALENDARIO DE EVENTOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id        UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    title           VARCHAR(150) NOT NULL,
    description     TEXT,
    start_at        TIMESTAMPTZ NOT NULL,
    end_at          TIMESTAMPTZ,
    location        VARCHAR(150),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 17. AUDITORÍA / LOG DE ACCIONES
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    house_id        UUID REFERENCES houses(id) ON DELETE SET NULL,
    action          VARCHAR(80) NOT NULL,
    entity          VARCHAR(60),
    entity_id       UUID,
    metadata        JSONB,
    ip              INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_date ON audit_log(created_at DESC);

-- =====================================================================
-- 18. TRIGGERS — updated_at automático
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_houses_updated  BEFORE UPDATE ON houses FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_users_updated   BEFORE UPDATE ON users  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =====================================================================
-- 19. VISTA — pagos vencidos (para dashboard)
-- =====================================================================
CREATE OR REPLACE VIEW v_overdue_payments AS
SELECT  p.*,
        u.full_name AS tenant_name,
        u.email     AS tenant_email,
        h.name      AS house_name,
        (CURRENT_DATE - p.due_date) AS days_overdue
FROM payments p
JOIN users  u ON u.id = p.tenant_id
JOIN houses h ON h.id = p.house_id
WHERE p.status IN ('pending','partial','overdue')
  AND p.due_date < CURRENT_DATE;

-- =====================================================================
-- 20. DATOS DE PRUEBA (semilla mínima — opcional)
-- =====================================================================
INSERT INTO houses (id, name, address, city, monthly_rent)
VALUES ('11111111-1111-1111-1111-111111111111',
        'Casa Principal', 'Calle 123 #45-67', 'Bogotá', 1500000)
ON CONFLICT DO NOTHING;

-- Password: "admin123" — bcrypt hash de ejemplo (cámbialo en producción)
INSERT INTO users (house_id, full_name, email, password_hash, role)
VALUES
  ('11111111-1111-1111-1111-111111111111','Cristian Campo','admin@casa.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','owner'),
  ('11111111-1111-1111-1111-111111111111','Inquilino Demo','demo@casa.com',
   '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy','tenant')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- LISTO ✅  — verifica con:
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public';
-- =====================================================================
