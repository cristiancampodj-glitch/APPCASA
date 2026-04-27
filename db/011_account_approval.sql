-- =====================================================================
-- 011 — Aprobación manual de cuentas nuevas
-- =====================================================================

-- Estado de aprobación: NULL = registro previo a esta migración (se backfilla a TRUE),
-- FALSE = pendiente de aprobación, TRUE = aprobado.
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved        BOOLEAN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by     UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_notes  TEXT;
-- Lo que la persona quiere ser ('owner' o 'tenant') al registrarse
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role  user_role;
-- Si pidió ser dueño, el nombre/moneda de la propiedad que quiere registrar
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_house_name VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_currency   VARCHAR(8);

-- Backfill: cualquier usuario existente al aplicar la migración queda aprobado.
-- (los nuevos registros entrarán con approved=FALSE explícito desde el backend).
UPDATE users
   SET approved = TRUE,
       approved_at = COALESCE(approved_at, NOW())
 WHERE approved IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved);

-- LISTO ✅


CREATE INDEX IF NOT EXISTS idx_users_approved ON users(approved);

-- LISTO ✅
