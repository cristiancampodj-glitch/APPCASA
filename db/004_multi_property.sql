-- =====================================================================
-- CASA SaaS — Migración 004: dueño con múltiples apartamentos
-- =====================================================================

-- 1. Agregar dueño a cada propiedad
ALTER TABLE houses ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE houses ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE houses ADD COLUMN IF NOT EXISTS unit_label VARCHAR(50);  -- "Apto 301", "Casa B"
ALTER TABLE houses ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'available'; -- available | occupied | maintenance

CREATE INDEX IF NOT EXISTS idx_houses_owner ON houses(owner_id);

-- 2. Backfill: el primer owner pasa a ser dueño de su casa
UPDATE houses h
SET owner_id = (
    SELECT u.id FROM users u
    WHERE u.house_id = h.id AND u.role = 'owner'
    ORDER BY u.created_at ASC LIMIT 1
)
WHERE owner_id IS NULL;

-- 3. Marcar como ocupadas las que tengan inquilinos activos
UPDATE houses h SET status = 'occupied'
WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.house_id = h.id AND u.role = 'tenant' AND u.is_active = TRUE
) AND status = 'available';

-- LISTO ✅
