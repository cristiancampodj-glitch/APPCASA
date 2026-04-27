-- =====================================================================
-- 012 — Vigencia de avisos (expires_at)
-- =====================================================================
-- Permite definir hasta qué fecha es relevante un aviso.
-- NULL = sin vencimiento (queda visible siempre).

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_announcements_expires
  ON announcements(expires_at) WHERE expires_at IS NOT NULL;

-- LISTO ✅
