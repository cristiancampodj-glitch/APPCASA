# Casa SaaS v3 — Despliegue completo

## 🚀 1. Variables de entorno en Railway

En tu servicio **web** (no en Postgres) pestaña **Variables**, agrega:

| Variable | Valor |
|---|---|
| `JWT_SECRET` | string aleatoria larga (genera con `openssl rand -hex 32`) |
| `APP_URL` | tu dominio público de Railway (https://...) |
| `DATABASE_URL` | clic en `+ New Reference` → selecciona Postgres → `DATABASE_URL` |
| `MP_ACCESS_TOKEN` | (opcional) Mercado Pago token |
| `OPENAI_API_KEY` | (opcional) para asistente IA |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_WHATSAPP_FROM` | (opcional) recordatorios WhatsApp |

## 🗃️ 2. Migrar la base de datos

Conecta DBeaver con `DATABASE_PUBLIC_URL` (host `mainline.proxy.rlwy.net` etc.) y ejecuta:

1. `db/schema.sql`
2. `db/002_features.sql`

O desde local con `DATABASE_URL` configurado:
```bash
npm install
npm run migrate
npm run seed     # crea owner admin@casa.com / admin123
```

## 🌐 3. Desplegar en Railway
- Cada `git push` redespliega automático
- Railway detecta `package.json`, ejecuta `npm install` + `npm start`
- Settings → Networking → Generate Domain → tu app está en producción

## ⏰ 4. Cron de recordatorios
En Railway crea un **Cron Job** apuntando al mismo proyecto con comando:
```
npm run cron
```
Frecuencia recomendada: diaria a las 9 AM (`0 9 * * *`).

## 📱 5. Empaquetar como app móvil

### Setup inicial (una sola vez, en tu PC)
```bash
npm install --save @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Casa SaaS" com.cristiancampo.casasaas --web-dir=public

# Edita capacitor.config.ts y pon tu APP_URL real
npx cap add android
npx cap add ios   # solo en macOS
```

### Build Android (APK / AAB para Play Store)
```bash
npm run build:mobile
npx cap open android   # abre Android Studio
```
- En Android Studio: **Build → Generate Signed Bundle / APK**
- Sube el `.aab` a [Play Console](https://play.google.com/console/)

### Build iOS (App Store)
Requiere Mac + Xcode + cuenta Apple Developer ($99/año):
```bash
npx cap open ios
```
- En Xcode: Product → Archive → Distribute → App Store Connect

### Iconos y splash
Genera assets con [@capacitor/assets](https://github.com/ionic-team/capacitor-assets):
```bash
npm install --save-dev @capacitor/assets
# coloca un PNG 1024x1024 en resources/icon.png
npx capacitor-assets generate
```

## 🧪 6. Probar local
```bash
copy .env.example .env
# edita .env con tus credenciales
npm install
npm run migrate
npm run seed
npm start
# http://localhost:3000
```

## 🔐 7. Roles
- **owner** → administrador de la casa, ve todo
- **tenant** → inquilino, ve sus pagos y reporta cosas
- **admin** → superadmin SaaS (panel global)

## 🧰 8. Endpoints clave
```
POST /api/auth/login
GET  /api/auth/me
GET  /api/dashboard
GET  /api/payments
POST /api/payments/:id/checkout   ← Mercado Pago
GET  /api/payments/:id/receipt.pdf ← PDF con QR
POST /api/ai/ask                   ← Asistente IA
... (ver src/routes/* para todos)
```

## 📋 9. Roadmap pendiente (siguientes iteraciones)
- 2FA TOTP completo (campo en BD ya existe)
- Push notifications con Firebase
- Login con Google / Apple (OAuth)
- Subida real de imágenes a S3/Cloudinary
- Firmas electrónicas de contratos
- Facturación electrónica DIAN
- Predicción ML de mora
