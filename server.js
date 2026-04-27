/**
 * Mi Casa v3 - Backend Express + Postgres
 * Compatible Railway / Render / Fly / cualquier PaaS Node 18+
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway/Render/Fly van detrás de un proxy: confiamos en X-Forwarded-For
app.set('trust proxy', 1);

// --- Seguridad y middlewares base ---
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://api.mercadopago.com', 'https://api.openai.com'],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true },
  noSniff: true,
  frameguard: { action: 'deny' }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limit global suave
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true }));
// Rate limit estricto para auth
app.use('/api/auth/', rateLimit({ windowMs: 60 * 1000, max: 20 }));

// --- Salud ---
app.get('/api/health', (req, res) => res.json({ ok: true, version: '3.0.0', ts: Date.now() }));

// --- Rutas API ---
app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/users',         require('./src/routes/users'));
app.use('/api/houses',        require('./src/routes/houses'));
app.use('/api/payments',      require('./src/routes/payments'));
app.use('/api/damages',       require('./src/routes/damages'));
app.use('/api/pqrs',          require('./src/routes/pqrs'));
app.use('/api/chores',        require('./src/routes/chores'));
app.use('/api/announcements', require('./src/routes/announcements'));
app.use('/api/messages',      require('./src/routes/messages'));
app.use('/api/inventory',     require('./src/routes/inventory'));
app.use('/api/expenses',      require('./src/routes/expenses'));
app.use('/api/events',        require('./src/routes/events'));
app.use('/api/bookings',      require('./src/routes/bookings'));
app.use('/api/polls',         require('./src/routes/polls'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/dashboard',     require('./src/routes/dashboard'));
app.use('/api/ai',            require('./src/routes/ai'));
app.use('/api/admin',         require('./src/routes/admin'));
app.use('/api/currencies',    require('./src/routes/currencies'));
app.use('/api/contracts',     require('./src/routes/contracts'));
app.use('/api/utility-bills', require('./src/routes/utilityBills'));

// --- Webhooks (sin auth, validados con firma) ---
app.use('/webhooks', require('./src/routes/webhooks'));

// --- Frontend estático (PWA) ---
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// --- Manejo errores ---
app.use((err, req, res, next) => {
  console.error('[ERR]', req.method, req.originalUrl, '-', err.message);
  if (err.stack) console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Mi Casa v3 escuchando en puerto ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});

// --- Scheduler interno: corre tareas diarias sin necesidad de cron externo ---
const cronJobs = require('./src/scripts/cron');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
async function runDailyJobs() {
  try {
    console.log('[scheduler] Ejecutando tareas diarias…');
    await cronJobs.step1MarkOverdue();
    await cronJobs.step2GenerateNextRentPayments();
    await cronJobs.step3RemindRent();
    await cronJobs.step4RemindUtilityShares();
  } catch (e) {
    console.error('[scheduler] Error:', e.message);
  }
}
// Primera corrida 30s después de arrancar y luego cada 24h
setTimeout(runDailyJobs, 30 * 1000);
setInterval(runDailyJobs, ONE_DAY_MS);
