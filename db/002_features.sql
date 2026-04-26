-- =====================================================================
-- CASA SaaS — Migración 002: features avanzadas
-- Ejecutar DESPUÉS de schema.sql
-- =====================================================================

-- 1. ÁREAS COMUNES + RESERVAS
CREATE TABLE IF NOT EXISTS common_areas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id    UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    capacity    INT DEFAULT 1,
    rules       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE booking_status AS ENUM ('pending','confirmed','cancelled','completed');

CREATE TABLE IF NOT EXISTS bookings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id     UUID NOT NULL REFERENCES common_areas(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    house_id    UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    start_at    TIMESTAMPTZ NOT NULL,
    end_at      TIMESTAMPTZ NOT NULL,
    status      booking_status DEFAULT 'confirmed',
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_at > start_at)
);
CREATE INDEX idx_bookings_area_time ON bookings(area_id, start_at, end_at);

-- 2. VOTACIONES / ENCUESTAS
CREATE TYPE poll_status AS ENUM ('open','closed');

CREATE TABLE IF NOT EXISTS polls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_id    UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    question    VARCHAR(300) NOT NULL,
    description TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    closes_at   TIMESTAMPTZ,
    status      poll_status DEFAULT 'open',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    label       VARCHAR(200) NOT NULL,
    sort_order  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id   UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (poll_id, user_id)
);

-- 3. PLANES SaaS / SUSCRIPCIONES
CREATE TYPE plan_tier AS ENUM ('free','pro','business');
CREATE TYPE sub_status AS ENUM ('trialing','active','past_due','cancelled');

CREATE TABLE IF NOT EXISTS plans (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(40) UNIQUE NOT NULL,
    name        VARCHAR(80) NOT NULL,
    tier        plan_tier NOT NULL,
    monthly_price NUMERIC(12,2) NOT NULL,
    max_houses  INT DEFAULT 1,
    max_users   INT DEFAULT 5,
    features    JSONB DEFAULT '{}'::jsonb,
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id     UUID NOT NULL REFERENCES plans(id),
    status      sub_status DEFAULT 'trialing',
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,
    external_id VARCHAR(120),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (code, name, tier, monthly_price, max_houses, max_users, features) VALUES
('free','Free','free',0,1,5,'{"reports":false,"ai":false,"whatsapp":false}'),
('pro','Pro','pro',29900,3,20,'{"reports":true,"ai":false,"whatsapp":true}'),
('business','Business','business',79900,99,999,'{"reports":true,"ai":true,"whatsapp":true,"api":true}')
ON CONFLICT (code) DO NOTHING;

-- 4. ACEPTACIÓN DE TÉRMINOS / HABEAS DATA
CREATE TABLE IF NOT EXISTS terms_acceptances (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document    VARCHAR(60) NOT NULL,         -- 'tos' | 'privacy' | 'habeas_data'
    version     VARCHAR(20) NOT NULL,
    ip          INET,
    user_agent  TEXT,
    accepted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 2FA
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(8) DEFAULT 'es';
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light';

-- 6. PAGOS — campos para gateway externo
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway VARCHAR(40);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(120);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_link TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_pdf_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_qr TEXT;

-- 7. LIKES / COMENTARIOS EN ANUNCIOS
CREATE TABLE IF NOT EXISTS announcement_likes (
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcement_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 8. SCORE DE INQUILINO (vista calculada)
CREATE OR REPLACE VIEW v_tenant_scores AS
SELECT
    u.id AS tenant_id,
    u.full_name,
    u.email,
    COUNT(p.id) FILTER (WHERE p.status = 'paid') AS paid_count,
    COUNT(p.id) FILTER (WHERE p.status = 'overdue') AS overdue_count,
    COUNT(d.id) AS damages_count,
    COUNT(q.id) FILTER (WHERE q.type = 'queja') AS complaints_count,
    GREATEST(0, LEAST(100,
        100
        - (COUNT(p.id) FILTER (WHERE p.status = 'overdue')) * 10
        - (COUNT(d.id)) * 3
        - (COUNT(q.id) FILTER (WHERE q.type = 'queja')) * 5
    ))::INT AS score
FROM users u
LEFT JOIN payments p ON p.tenant_id = u.id
LEFT JOIN damages  d ON d.reported_by = u.id
LEFT JOIN pqrs     q ON q.user_id = u.id
WHERE u.role = 'tenant'
GROUP BY u.id;

-- LISTO ✅
