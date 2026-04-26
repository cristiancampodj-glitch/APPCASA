-- =====================================================================
-- CASA SaaS — Migración 003: soporte multi-moneda (COP, EUR, USD)
-- =====================================================================

-- 1. Tabla de monedas soportadas
CREATE TABLE IF NOT EXISTS currencies (
    code        VARCHAR(8) PRIMARY KEY,        -- 'COP','EUR','USD'
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

-- 2. Tasas de cambio (opcional, para conversiones / reportes consolidados)
CREATE TABLE IF NOT EXISTS exchange_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base        VARCHAR(8) NOT NULL REFERENCES currencies(code),
    quote       VARCHAR(8) NOT NULL REFERENCES currencies(code),
    rate        NUMERIC(18,8) NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (base, quote, captured_at)
);

-- 3. FK desde houses.currency a currencies (la columna ya existe)
DO $$ BEGIN
    ALTER TABLE houses
        ADD CONSTRAINT fk_houses_currency FOREIGN KEY (currency) REFERENCES currencies(code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Currency en pagos, gastos, contratos, gas, utilities
ALTER TABLE payments       ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE expenses       ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE contracts      ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE utilities      ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE gas_purchases  ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE plans          ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);
ALTER TABLE damages        ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'COP' REFERENCES currencies(code);

-- 5. Hereda moneda de la casa al insertar (trigger)
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

DO $$ BEGIN
    CREATE TRIGGER trg_payments_curr  BEFORE INSERT ON payments      FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency();
    CREATE TRIGGER trg_expenses_curr  BEFORE INSERT ON expenses      FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency();
    CREATE TRIGGER trg_contracts_curr BEFORE INSERT ON contracts     FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency();
    CREATE TRIGGER trg_utilities_curr BEFORE INSERT ON utilities     FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency();
    CREATE TRIGGER trg_gas_curr       BEFORE INSERT ON gas_purchases FOR EACH ROW EXECUTE FUNCTION trg_inherit_currency();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- LISTO ✅
