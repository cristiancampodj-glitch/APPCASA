-- =====================================================================
-- Mi Casa — Migración 007: avisos individuales o masivos
-- =====================================================================
-- target_user_id: si NULL -> visible para todos los del inmueble
--                 si seteado -> solo ese inquilino lo ve

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements(target_user_id);

-- LISTO ✅
