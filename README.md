# 🏡 Casa SaaS – Gestión inmobiliaria

Plataforma profesional para administrar propiedades en alquiler: pagos de arriendo, mantenimiento, comunicación dueño‑inquilino y convivencia diaria.

![Versión](https://img.shields.io/badge/versión-2.0-6366f1)
![PWA](https://img.shields.io/badge/PWA-ready-22d3ee)
![Sin Backend](https://img.shields.io/badge/100%25-frontend-10b981)

## ✨ Características

### 👤 Autenticación con roles
- Registro como **Dueño** o **Inquilino**
- Vinculación por **código de propiedad** (`CASA-XXXX`)
- Sesiones persistentes

### 💳 Pagos de arriendo
- Inquilinos registran sus pagos con comprobante
- Dueño confirma o rechaza
- ⚠️ **Notificación automática** cuando se cumple el día del arriendo y no se ha pagado (al dueño y al inquilino)
- Recordatorio 3 días antes del vencimiento
- Histórico mensual con estados: `pendiente`, `pagado`, `vencido`

### 🔧 Daños y mantenimiento
- Inquilinos reportan daños con prioridad (baja/media/alta)
- Hilo de mensajes entre dueño e inquilino
- Estados: pendiente → en proceso → resuelto / rechazado
- Notificaciones en cada cambio

### 📨 PQRS
- Peticiones, quejas, reclamos y sugerencias
- Conversación bidireccional
- Seguimiento del estado por el dueño

### 🧹 Convivencia
- **Aseo**: rotación automática semanal por zonas
- **Basura**: asignación por día, registro de cumplimiento
- **Gas**: turno rotativo + historial
- **Tareas**: pendientes con persona asignada y fecha

### 🔔 Notificaciones
- Centro de notificaciones interno
- Notificaciones del navegador (Web Push API)
- Alertas automáticas: pagos vencidos, recordatorios, nuevos reportes, mensajes

### 🏘️ Multi-propiedad
- Un dueño puede tener varias propiedades
- Cada una con su código, valor de arriendo y día de pago

## 🚀 Cómo usar

### Opción 1 — Abrir directamente
Doble clic en `index.html`.

### Opción 2 — Servidor local (recomendado para PWA y notificaciones)
```powershell
# Con Python
python -m http.server 8000

# O con Node
npx serve .
```
Abre <http://localhost:8000>

### Opción 3 — Hosting gratuito
Sube esta carpeta a **GitHub Pages**, **Netlify** o **Vercel** y compártela con tus inquilinos.

## 🧪 Probarla rápido

1. **Regístrate como Dueño** → se crea tu primera propiedad con código (ej. `CASA-A3F2`)
2. Edita la propiedad: pon nombre, dirección, valor del arriendo y día de pago
3. Cierra sesión y **regístrate como Inquilino** usando el código
4. Como inquilino: registra un pago, reporta un daño, abre una PQRS
5. Vuelve como dueño: confirma pagos, resuelve daños, responde PQRS

## 📦 Stack

- **HTML + CSS + JavaScript vanilla** (cero dependencias)
- **localStorage** como base de datos (listo para portar a Firebase/Supabase)
- **Service Worker + Manifest** → PWA instalable y offline
- **Notification API** → push del navegador

## 🗂️ Estructura

```
APPCASA/
├── index.html       # Landing + Auth + App shell
├── styles.css       # Sistema de diseño completo
├── app.js           # Toda la lógica
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (offline)
└── README.md
```

## 🔐 Seguridad

> ⚠️ Esta es una versión cliente para gestión personal/familiar. Los datos viven en `localStorage` del navegador. Para uso comercial real conviene migrar a backend con autenticación robusta (JWT, OAuth) y BD remota.

## 🛣️ Roadmap

- [ ] Backend opcional con Supabase
- [ ] Pagos en línea (Stripe / Mercado Pago / PSE)
- [ ] Subida de imágenes en reportes de daños
- [ ] Firma digital de contratos de arriendo
- [ ] Reportes PDF mensuales
- [ ] App móvil nativa (Capacitor)

---

Hecho con 💜 por **Cristian Campo**
