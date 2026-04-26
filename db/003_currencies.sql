-- =====================================================================
-- CASA SaaS — Migración 003: soporte multi-moneda (COP, EUR, USD, MXN)
-- Idempotente: solo agrega columnas a tablas que existan.
-- =====================================================================

-- 1. Tabla de monedas soportadas
CREATE TABLE IF NOT EXISTS currencies (
    code        VARCHAR(8) PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    symbol      VARCHAR(8)  NOT NULL,
    decimals    INT DEFAULT 2,
    is_active   BOOLEAN DEFAULT TRUE
);

INSERT INTO currencies (code, name, symbol, decimals) VALUES
    ('COP', 'Peso Colombiano', '$',   0),
    ('EUR', 'Euro',            '€',   2),
    ('USD', 'Dólar US',        'US$', 2),
    ('MXN', 'Peso Mexicano',   '$',   2)
ON CONFLICT (code) DO NOTHING;

-- 2. Tasas de cambio (opcional)
CREATE TABLE IF NOT EXISTS exchange_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base        VARCHAR(8) NOT NULL REFERENCES currencies(code),
    quote       VARCHAR(8) NOT NULL REFERENCES currencies(code),
    rate        NUMERIC(18,8) NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (base, quote, captured_at)
);

-- 3. FK desde houses.currency a currencies (solo si la columna ya existe)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='houses' AND column_name='currency'
    ) THEN
        BEGIN
            ALTER TABLE houses ADD CONSTRAINT fk_houses_currency
                FOREIGN KEY (currency) REFERENCES currencies(code);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 4. Agregar columna currency SOLO si la tabla existe
DO $$
DECLARE
    t TEXT;
    tablas TEXT[] := ARRAY[
        'payments', 'expenses', 'contracts', 'utilities',
        'gas_purchases', 'plans', 'damages', 'subscriptions'
    ];
BEGIN
    FOREACH t IN ARRAY tablas LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT ''COP'' REFERENCES currencies(code)',
                t
            );
            RAISE NOTICE 'OK: columna currency en %', t;
        ELSE
            RAISE NOTICE 'SKIP: tabla % no existe (ejecuta 002_features.sql primero si la necesitas)', t;
        END IF;
    END LOOP;
END $$;

-- 5. Trigger: hereda moneda de la casa al insertar
CREATE OR REPLACE FUNCTION trg_inherit_currency()
RETURNS TRIGGER AS $$
DECLARE c VARCHAR(8);
BEGIN
    IF NEW.currency IS NULL THEN
        SELECT currency INTO c FROM houses WHERE id = NEW.house_id;
        NEW.currency := COALESCE(c, 'COP');
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
    trig_tables TEXT[] := ARRAY['payments','expenses','contracts','utilities','gas_purchases','damages'];
BEGIN
    FOREACH t IN ARRAY trig_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_curr ON %I', t, t);
            EXECUTE format(
                'CREATE TRIGGER trg_%s_curr BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency()',
                t, t
            );
        END IF;
    END LOOP;
END $$;

-- LISTO ✅
