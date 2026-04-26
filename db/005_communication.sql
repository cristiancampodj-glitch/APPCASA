-- =====================================================================
-- Mi Casa — Migración 005: datos bancarios + WhatsApp + foto en daños
-- =====================================================================

ALTER TABLE houses ADD COLUMN IF NOT EXISTS bank_info TEXT;            -- Datos bancarios del dueño (texto libre)
ALTER TABLE houses ADD COLUMN IF NOT EXISTS owner_whatsapp VARCHAR(30);-- Número del dueño en formato +57...

ALTER TABLE users  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30);

ALTER TABLE damages ADD COLUMN IF NOT EXISTS photo_url TEXT;           -- Una foto del daño (URL o data URL)

-- Si ya hay teléfonos, copiar como WhatsApp por defecto
UPDATE users SET whatsapp = phone WHERE whatsapp IS NULL AND phone IS NOT NULL;

-- LISTO ✅
