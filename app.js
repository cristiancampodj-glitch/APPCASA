/* =========================================================
   CASA SaaS · v2.0
   Gestión inmobiliaria: dueños + inquilinos
   - Auth con roles
   - Pagos de arriendo con alertas de vencimiento
   - Reportes de daños / mantenimiento
   - PQRS (peticiones, quejas, reclamos, sugerencias)
   - Convivencia: aseo, basura, gas, tareas
   - Notificaciones del sistema y del navegador
   - Datos en localStorage (sin backend, listo para portar)
   ========================================================= */

const STORE_KEY = 'casa_saas_v2';
const SESSION_KEY = 'casa_saas_session';

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ---------- Estado ----------
const defaultDB = {
  users: [],          // {id, nombre, email, pass, rol, telefono, doc, color, propiedadId, createdAt}
  propiedades: [],    // {id, nombre, direccion, codigo, ownerId, valorArriendo, diaPago, currency}
  pagos: [],          // {id, propiedadId, inquilinoId, mes, monto, fecha, comprobante, estado}
  danos: [],          // {id, propiedadId, inquilinoId, titulo, descripcion, prioridad, estado, fecha, mensajes:[]}
  pqrs: [],           // {id, propiedadId, autorId, tipo, titulo, descripcion, estado, fecha, mensajes:[]}
  notifs: [],         // {id, userId, titulo, mensaje, tipo, leida, fecha, ref}
  // Convivencia (por propiedad)
  conv: {},           // { [propiedadId]: { zonas, basura, basuraHistorial, gas:{historial,ordenIdx}, tareas:[], aseoSeed } }
  meta: { browserNotifEnabled: false }
};

let DB = load();
let session = loadSession(); // { userId }
let currentView = 'dashboard';
let regRole = 'dueño';

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(defaultDB);
    return Object.assign(structuredClone(defaultDB), JSON.parse(raw));
  } catch { return structuredClone(defaultDB); }
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
  session = s;
}

const uid = () => Math.random().toString(36).slice(2, 11);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtMoney = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const initials = name => (name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const colorFor = id => {
  const palette = ['#6366f1','#22d3ee','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#84cc16','#3b82f6'];
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
};

// ---------- Toast ----------
function toast(msg, kind = '') {
  const w = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span>${kind === 'ok' ? '✅' : kind === 'warn' ? '⚠️' : kind === 'danger' ? '❌' : '💬'}</span><div>${escapeHtml(msg)}</div>`;
  w.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Modal ----------
function openModal({ title, body, footer, size }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-back" id="modalBack">
      <div class="modal" ${size === 'lg' ? 'style="max-width:720px"' : ''}>
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="btn icon ghost" id="modalClose">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  document.getElementById('modalClose').onclick = close;
  document.getElementById('modalBack').addEventListener('click', e => {
    if (e.target.id === 'modalBack') close();
  });
  return close;
}

// ============================================================
// AUTH
// ============================================================
document.querySelectorAll('.auth-tab').forEach(t => {
  t.onclick = () => switchAuthTab(t.dataset.authTab);
});
document.querySelectorAll('[data-go-tab]').forEach(b => b.onclick = () => switchAuthTab(b.dataset.goTab));

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === tab));
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
}

document.querySelectorAll('.role-opt').forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll('.role-opt').forEach(o => o.classList.toggle('active', o === opt));
    regRole = opt.dataset.role;
    document.getElementById('codeInquilinoField').classList.toggle('hidden', regRole !== 'inquilino');
  };
});

document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const u = DB.users.find(x => x.email === email && x.pass === hash(pass));
  if (!u) return toast('Credenciales incorrectas', 'danger');
  saveSession({ userId: u.id });
  toast(`¡Bienvenido, ${u.nombre.split(' ')[0]}!`, 'ok');
  bootApp();
});

document.getElementById('registerForm').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = document.getElementById('regNombre').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const telefono = document.getElementById('regTelefono').value.trim();
  const doc = document.getElementById('regDoc').value.trim();
  const pass = document.getElementById('regPass').value;
  const codigo = document.getElementById('regCodigo').value.trim().toUpperCase();

  if (DB.users.find(u => u.email === email)) return toast('Ese correo ya está registrado', 'warn');

  const userId = uid();
  let propiedadId = null;

  if (regRole === 'inquilino' && codigo) {
    const prop = DB.propiedades.find(p => p.codigo === codigo);
    if (!prop) return toast('Código de propiedad inválido', 'danger');
    propiedadId = prop.id;
  }

  const user = {
    id: userId, nombre, email, pass: hash(pass),
    rol: regRole, telefono, doc,
    propiedadId, color: colorFor(userId),
    createdAt: new Date().toISOString()
  };
  DB.users.push(user);

  // Si es dueño, crear primera propiedad
  if (regRole === 'dueño') {
    const propId = uid();
    const nuevaProp = {
      id: propId,
      nombre: 'Mi propiedad',
      direccion: '',
      codigo: ('CASA-' + Math.random().toString(36).slice(2, 6).toUpperCase()),
      ownerId: userId,
      valorArriendo: 0,
      diaPago: 5,
      currency: 'COP'
    };
    DB.propiedades.push(nuevaProp);
    DB.conv[propId] = nuevaConv();
  }

  if (propiedadId) {
    notify(DB.propiedades.find(p => p.id === propiedadId).ownerId, {
      titulo: 'Nuevo inquilino',
      mensaje: `${nombre} se ha unido como inquilino.`,
      tipo: 'info'
    });
  }

  save();
  saveSession({ userId });
  toast('Cuenta creada con éxito', 'ok');
  bootApp();
});

// hash MUY simple, suficiente como demo (NO criptográfico)
function hash(s) {
  let h = 0; for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

function nuevaConv() {
  return { zonas: ['Cocina','Baño','Sala','Patio'], basura: {}, basuraHistorial: [], gas: { historial: [], ordenIdx: 0 }, tareas: [], aseoSeed: null };
}

// ============================================================
// BOOT
// ============================================================
function currentUser() { return session ? DB.users.find(u => u.id === session.userId) : null; }
function userPropiedad() {
  const u = currentUser(); if (!u) return null;
  if (u.rol === 'dueño') return DB.propiedades.find(p => p.ownerId === u.id);
  return DB.propiedades.find(p => p.id === u.propiedadId);
}

document.getElementById('logoutBtn').onclick = () => {
  if (!confirm('¿Cerrar sesión?')) return;
  saveSession(null);
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authPage').classList.remove('hidden');
};

function bootApp() {
  const u = currentUser();
  if (!u) {
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('authPage').classList.remove('hidden');
    return;
  }
  document.getElementById('authPage').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('mobileTabbar').classList.remove('hidden');

  document.getElementById('sbName').textContent = u.nombre;
  document.getElementById('sbRole').textContent = u.rol === 'dueño' ? 'Dueño / Administrador' : 'Inquilino';
  const av = document.getElementById('sbAvatar');
  av.textContent = initials(u.nombre);
  av.style.background = `linear-gradient(135deg, ${u.color}, #ec4899)`;

  // Mostrar/ocultar items por rol
  document.querySelectorAll('[data-only]').forEach(el => {
    el.classList.toggle('hidden', el.dataset.only !== u.rol);
  });

  // Verificar pagos vencidos en cada arranque
  checkPagosVencidos();

  navigate(currentView);
  updateBadges();
}

// ============================================================
// NAVEGACIÓN
// ============================================================
document.querySelectorAll('[data-nav]').forEach(b => {
  b.onclick = () => navigate(b.dataset.nav);
});
function navigate(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.nav === view));

  const titles = {
    dashboard: ['Dashboard', 'Resumen general'],
    pagos: ['Pagos de arriendo', 'Gestión y seguimiento de pagos'],
    danos: ['Daños y mantenimiento', 'Reportes y solicitudes de arreglo'],
    pqrs: ['PQRS', 'Peticiones, quejas, reclamos y sugerencias'],
    aseo: ['Aseo', 'Rotación semanal por zonas'],
    basura: ['Basura', 'Asignación diaria'],
    gas: ['Gas', 'Turno de compra'],
    tareas: ['Tareas', 'Pendientes del hogar'],
    propiedades: ['Propiedades', 'Información y configuración'],
    personas: ['Inquilinos y residentes', 'Personas en la propiedad'],
    notificaciones: ['Notificaciones', 'Centro de avisos'],
    ajustes: ['Ajustes', 'Tu cuenta y preferencias']
  };
  const [title, sub] = titles[view] || ['', ''];
  document.getElementById('viewTitle').textContent = title;
  document.getElementById('viewSub').textContent = sub;

  const renderers = {
    dashboard: renderDashboard, pagos: renderPagos, danos: renderDanos, pqrs: renderPQRS,
    aseo: renderAseo, basura: renderBasura, gas: renderGas, tareas: renderTareas,
    propiedades: renderPropiedades, personas: renderPersonas, notificaciones: renderNotificaciones,
    ajustes: renderAjustes
  };
  document.getElementById('views').innerHTML = '';
  (renderers[view] || renderDashboard)();
}

// ============================================================
// NOTIFICACIONES (sistema interno + browser)
// ============================================================
function notify(userId, { titulo, mensaje, tipo = 'info', ref = null }) {
  if (!userId) return;
  DB.notifs.unshift({ id: uid(), userId, titulo, mensaje, tipo, leida: false, fecha: new Date().toISOString(), ref });
  DB.notifs = DB.notifs.slice(0, 200);
  save();
  // Notificación del navegador si es el usuario activo
  if (session && userId === session.userId && DB.meta.browserNotifEnabled && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Casa 🏡 ' + titulo, { body: mensaje, icon: '' }); } catch {}
  }
}

function unreadFor(userId) { return DB.notifs.filter(n => n.userId === userId && !n.leida).length; }

function updateBadges() {
  const u = currentUser(); if (!u) return;
  const unread = unreadFor(u.id);
  const dot = document.getElementById('notifDot');
  dot.classList.toggle('hidden', unread === 0);
  const setBadge = (id, n) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.textContent = n; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  };
  setBadge('notifBadge', unread);
  // Badges por sección
  const prop = userPropiedad();
  if (prop) {
    if (u.rol === 'dueño') {
      setBadge('pagosBadge', DB.pagos.filter(p => p.propiedadId === prop.id && p.estado === 'pendiente').length);
      setBadge('danosBadge', DB.danos.filter(d => d.propiedadId === prop.id && d.estado === 'pendiente').length);
      setBadge('pqrsBadge', DB.pqrs.filter(q => q.propiedadId === prop.id && q.estado === 'pendiente').length);
    } else {
      setBadge('pagosBadge', DB.pagos.filter(p => p.inquilinoId === u.id && p.estado === 'vencido').length);
      setBadge('danosBadge', DB.danos.filter(d => d.inquilinoId === u.id && d.estado === 'proceso').length);
      setBadge('pqrsBadge', DB.pqrs.filter(q => q.autorId === u.id && q.estado === 'proceso').length);
    }
  }
}

document.getElementById('notifBtn').onclick = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    const p = await Notification.requestPermission();
    DB.meta.browserNotifEnabled = p === 'granted';
    save();
  }
  navigate('notificaciones');
};

// ============================================================
// CHECK PAGOS VENCIDOS (al iniciar sesión)
// ============================================================
function checkPagosVencidos() {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  DB.propiedades.forEach(prop => {
    if (!prop.diaPago || !prop.valorArriendo) return;
    const inquilinos = DB.users.filter(u => u.rol === 'inquilino' && u.propiedadId === prop.id);
    const mes = hoy.toISOString().slice(0, 7); // YYYY-MM
    const fechaCorte = new Date(hoy.getFullYear(), hoy.getMonth(), prop.diaPago);

    inquilinos.forEach(inq => {
      const pago = DB.pagos.find(p => p.propiedadId === prop.id && p.inquilinoId === inq.id && p.mes === mes);
      // Si hoy es >= día de pago y no hay registro de pago
      if (hoy >= fechaCorte && (!pago || pago.estado === 'pendiente')) {
        const yaNotificado = DB.notifs.some(n =>
          n.ref === `pago-vencido-${prop.id}-${inq.id}-${mes}` &&
          (n.userId === inq.id || n.userId === prop.ownerId)
        );
        if (!yaNotificado) {
          // Marcar como vencido si existe
          if (pago) { pago.estado = 'vencido'; }
          notify(inq.id, {
            titulo: '⚠️ Arriendo vencido',
            mensaje: `Tu pago de arriendo de ${mesNombre(mes)} está vencido.`,
            tipo: 'danger',
            ref: `pago-vencido-${prop.id}-${inq.id}-${mes}`
          });
          notify(prop.ownerId, {
            titulo: '⚠️ Arriendo no pagado',
            mensaje: `${inq.nombre} no ha registrado el pago de ${mesNombre(mes)}.`,
            tipo: 'warn',
            ref: `pago-vencido-${prop.id}-${inq.id}-${mes}`
          });
        }
      }
      // Recordatorio 3 días antes
      const tresDiasAntes = new Date(fechaCorte); tresDiasAntes.setDate(tresDiasAntes.getDate() - 3);
      if (hoy.getTime() === tresDiasAntes.getTime() && (!pago || pago.estado === 'pendiente')) {
        const ref = `pago-proximo-${prop.id}-${inq.id}-${mes}`;
        if (!DB.notifs.some(n => n.ref === ref)) {
          notify(inq.id, {
            titulo: '📅 Recordatorio de pago',
            mensaje: `Tu arriendo vence el ${prop.diaPago} de este mes.`,
            tipo: 'info', ref
          });
        }
      }
    });
  });
  save();
}

function mesNombre(mes) {
  const [y, m] = mes.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

// ============================================================
// VIEWS
// ============================================================
const v = document.getElementById('views');

// ---------- DASHBOARD ----------
function renderDashboard() {
  const u = currentUser();
  const prop = userPropiedad();

  if (!prop) {
    v.innerHTML = `<div class="card"><div class="empty">
      <div class="ico">🏠</div>
      <h3>No estás vinculado a una propiedad</h3>
      <p class="muted">Pídele a tu dueño el código de propiedad para unirte.</p>
      <button class="btn primary" onclick="vincularPropiedad()">Ingresar código</button>
    </div></div>`;
    return;
  }

  if (u.rol === 'dueño') {
    const inquilinos = DB.users.filter(x => x.propiedadId === prop.id);
    const mes = today().slice(0, 7);
    const pagosMes = DB.pagos.filter(p => p.propiedadId === prop.id && p.mes === mes);
    const pagados = pagosMes.filter(p => p.estado === 'pagado').length;
    const totalEsperado = inquilinos.length * (prop.valorArriendo || 0);
    const totalRecaudado = pagosMes.filter(p => p.estado === 'pagado').reduce((s, p) => s + Number(p.monto || 0), 0);
    const danosPend = DB.danos.filter(d => d.propiedadId === prop.id && d.estado !== 'resuelto').length;
    const pqrsPend = DB.pqrs.filter(q => q.propiedadId === prop.id && q.estado !== 'resuelto').length;

    v.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="label">Inquilinos</div><div class="value">${inquilinos.length}</div><div class="delta">activos en ${escapeHtml(prop.nombre)}</div><div class="ico">👥</div></div>
        <div class="stat"><div class="label">Recaudado este mes</div><div class="value">${fmtMoney(totalRecaudado)}</div><div class="delta ${totalRecaudado >= totalEsperado ? 'up' : 'down'}">de ${fmtMoney(totalEsperado)}</div><div class="ico">💳</div></div>
        <div class="stat"><div class="label">Pagos al día</div><div class="value">${pagados}/${inquilinos.length}</div><div class="delta">${mesNombre(mes)}</div><div class="ico">✅</div></div>
        <div class="stat"><div class="label">Pendientes</div><div class="value">${danosPend + pqrsPend}</div><div class="delta">${danosPend} daños · ${pqrsPend} PQRS</div><div class="ico">🛠️</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>Estado de pagos · ${mesNombre(mes)}</h3><button class="btn sm" onclick="navigate('pagos')">Ver todo →</button></div>
          ${inquilinos.length === 0 ? emptyState('Sin inquilinos', 'Comparte tu código de propiedad para que se registren.') :
            `<ul class="list">${inquilinos.map(i => {
              const p = pagosMes.find(x => x.inquilinoId === i.id);
              const est = p ? p.estado : 'pendiente';
              return `<li class="list-item">
                <div class="avatar sm" style="background:${i.color}">${initials(i.nombre)}</div>
                <div class="info"><strong>${escapeHtml(i.nombre)}</strong><small>${fmtMoney(prop.valorArriendo)}</small></div>
                <span class="badge status-${est}">${est}</span>
              </li>`;
            }).join('')}</ul>`}
        </div>

        <div class="card">
          <div class="card-header"><h3>Pendientes urgentes</h3></div>
          ${(() => {
            const items = [
              ...DB.danos.filter(d => d.propiedadId === prop.id && d.estado !== 'resuelto').map(d => ({ tipo: '🔧', titulo: d.titulo, sub: 'Daño · ' + d.estado, accion: () => navigate('danos') })),
              ...DB.pqrs.filter(q => q.propiedadId === prop.id && q.estado !== 'resuelto').map(q => ({ tipo: '📨', titulo: q.titulo, sub: q.tipo + ' · ' + q.estado, accion: () => navigate('pqrs') }))
            ].slice(0, 6);
            return items.length === 0 ? emptyState('Todo bajo control', 'No hay tickets pendientes 🎉')
              : `<ul class="list">${items.map((i, idx) => `<li class="list-item" data-quick="${idx}"><div style="font-size:22px">${i.tipo}</div><div class="info"><strong>${escapeHtml(i.titulo)}</strong><small>${escapeHtml(i.sub)}</small></div></li>`).join('')}</ul>`;
          })()}
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="card-header"><h3>Información rápida</h3></div>
        <div class="row" style="gap:14px">
          <div class="chip">🏠 ${escapeHtml(prop.nombre)}</div>
          <div class="chip">📍 ${escapeHtml(prop.direccion || 'Sin dirección')}</div>
          <div class="chip">🔑 Código: <strong style="margin-left:4px">${prop.codigo}</strong></div>
          <div class="chip">📅 Día de pago: ${prop.diaPago}</div>
          <div class="chip">💰 ${fmtMoney(prop.valorArriendo)}</div>
        </div>
      </div>
    `;
  } else {
    // INQUILINO
    const mes = today().slice(0, 7);
    const miPago = DB.pagos.find(p => p.inquilinoId === u.id && p.mes === mes);
    const estado = miPago ? miPago.estado : 'pendiente';
    const fechaCorte = new Date(); fechaCorte.setDate(prop.diaPago);
    const diasFaltan = Math.ceil((fechaCorte - new Date()) / (1000 * 60 * 60 * 24));

    const misDanos = DB.danos.filter(d => d.inquilinoId === u.id && d.estado !== 'resuelto');
    const misPqrs = DB.pqrs.filter(q => q.autorId === u.id && q.estado !== 'resuelto');

    v.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="label">Mi arriendo</div><div class="value">${fmtMoney(prop.valorArriendo)}</div><div class="delta">vence el ${prop.diaPago} de cada mes</div><div class="ico">🏠</div></div>
        <div class="stat"><div class="label">Estado este mes</div><div class="value" style="font-size:18px"><span class="badge status-${estado}">${estado.toUpperCase()}</span></div><div class="delta">${mesNombre(mes)}</div><div class="ico">💳</div></div>
        <div class="stat"><div class="label">Reportes activos</div><div class="value">${misDanos.length}</div><div class="delta">daños abiertos</div><div class="ico">🔧</div></div>
        <div class="stat"><div class="label">Mis PQRS</div><div class="value">${misPqrs.length}</div><div class="delta">en proceso</div><div class="ico">📨</div></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3>Mi pago de arriendo</h3>${estado === 'pagado' ? '<span class="badge ok">Al día</span>' : `<span class="badge status-${estado}">${estado}</span>`}</div>
          <p class="muted" style="margin:0 0 10px">${estado === 'pagado' ? '¡Gracias por tu pago puntual!' :
            estado === 'vencido' ? `⚠️ Tu pago está vencido. Por favor regulariza lo antes posible.` :
            `Faltan ${diasFaltan > 0 ? diasFaltan : 0} días para tu fecha de pago.`}</p>
          ${estado !== 'pagado' ? `<button class="btn primary" onclick="abrirRegistroPago()">💳 Registrar pago</button>` : ''}
        </div>

        <div class="card">
          <div class="card-header"><h3>Acciones rápidas</h3></div>
          <div class="row">
            <button class="btn" onclick="abrirNuevoDano()">🔧 Reportar daño</button>
            <button class="btn" onclick="abrirNuevaPQRS()">📨 Crear solicitud</button>
            <button class="btn" onclick="navigate('aseo')">🧹 Mi turno aseo</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <div class="card-header"><h3>Mi propiedad</h3></div>
        <div class="row" style="gap:14px">
          <div class="chip">🏠 ${escapeHtml(prop.nombre)}</div>
          <div class="chip">📍 ${escapeHtml(prop.direccion || 'Sin dirección')}</div>
          <div class="chip">📅 Día de pago: ${prop.diaPago}</div>
        </div>
      </div>
    `;
  }
}

function emptyState(title, msg, ico = '✨') {
  return `<div class="empty"><div class="ico">${ico}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(msg)}</p></div>`;
}

window.vincularPropiedad = () => {
  const close = openModal({
    title: 'Unirme a una propiedad',
    body: `<div class="field"><label>Código de propiedad</label><input class="input" id="vinCodigo" placeholder="CASA-XXXX" /></div>`,
    footer: `<button class="btn ghost" onclick="document.getElementById('modalClose').click()">Cancelar</button><button class="btn primary" id="vinSave">Vincular</button>`
  });
  document.getElementById('vinSave').onclick = () => {
    const cod = document.getElementById('vinCodigo').value.trim().toUpperCase();
    const prop = DB.propiedades.find(p => p.codigo === cod);
    if (!prop) return toast('Código inválido', 'danger');
    const u = currentUser(); u.propiedadId = prop.id; save();
    notify(prop.ownerId, { titulo: 'Nuevo inquilino', mensaje: `${u.nombre} se ha unido.`, tipo: 'info' });
    close(); navigate('dashboard'); toast('¡Vinculado!', 'ok');
  };
};

// ---------- PAGOS ----------
function renderPagos() {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return v.innerHTML = `<div class="card">${emptyState('Sin propiedad','Vincúlate a una propiedad para ver pagos','🏠')}</div>`;

  const pagos = u.rol === 'dueño'
    ? DB.pagos.filter(p => p.propiedadId === prop.id)
    : DB.pagos.filter(p => p.inquilinoId === u.id);

  pagos.sort((a, b) => b.mes.localeCompare(a.mes));

  v.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>${u.rol === 'dueño' ? 'Pagos de inquilinos' : 'Mi historial de pagos'}</h3>
        ${u.rol === 'inquilino' ? `<button class="btn primary" onclick="abrirRegistroPago()">+ Registrar pago</button>` : ''}
      </div>
      ${pagos.length === 0 ? emptyState('Sin pagos registrados', 'Aquí verás todos los pagos cuando se registren', '💳') : `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Mes</th>
          ${u.rol === 'dueño' ? '<th>Inquilino</th>' : ''}
          <th>Monto</th><th>Fecha</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>${pagos.map(p => {
          const inq = DB.users.find(x => x.id === p.inquilinoId);
          return `<tr>
            <td><strong>${mesNombre(p.mes)}</strong></td>
            ${u.rol === 'dueño' ? `<td><div style="display:flex;align-items:center;gap:8px"><div class="avatar sm" style="background:${inq?.color}">${initials(inq?.nombre)}</div>${escapeHtml(inq?.nombre || '—')}</div></td>` : ''}
            <td>${fmtMoney(p.monto)}</td>
            <td>${fmtDate(p.fecha)}</td>
            <td><span class="badge status-${p.estado}">${p.estado}</span></td>
            <td class="row-actions">
              ${u.rol === 'dueño' && p.estado !== 'pagado' ? `<button class="btn sm success" onclick="confirmarPago('${p.id}')">✓ Confirmar</button>` : ''}
              ${u.rol === 'dueño' ? `<button class="btn sm ghost" onclick="eliminarPago('${p.id}')">✕</button>` : ''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`}
    </div>
  `;
}

window.abrirRegistroPago = () => {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return;
  const close = openModal({
    title: 'Registrar pago de arriendo',
    body: `
      <div class="field"><label>Mes correspondiente</label><input class="input" type="month" id="pagoMes" value="${today().slice(0,7)}" /></div>
      <div class="field"><label>Monto pagado</label><input class="input" type="number" id="pagoMonto" value="${prop.valorArriendo || 0}" /></div>
      <div class="field"><label>Fecha de pago</label><input class="input" type="date" id="pagoFecha" value="${today()}" /></div>
      <div class="field"><label>Comprobante / Referencia <span class="muted">(opcional)</span></label><input class="input" id="pagoRef" placeholder="Nº de transferencia, banco, etc." /></div>
    `,
    footer: `<button class="btn ghost" onclick="document.getElementById('modalClose').click()">Cancelar</button><button class="btn primary" id="pagoSave">Registrar</button>`
  });
  document.getElementById('pagoSave').onclick = () => {
    const mes = document.getElementById('pagoMes').value;
    const monto = Number(document.getElementById('pagoMonto').value);
    const fecha = document.getElementById('pagoFecha').value;
    const comprobante = document.getElementById('pagoRef').value;
    if (!mes || !monto) return toast('Completa los campos', 'warn');

    // Reemplazar si ya existe pago de ese mes
    const existIdx = DB.pagos.findIndex(p => p.propiedadId === prop.id && p.inquilinoId === u.id && p.mes === mes);
    const pago = { id: existIdx >= 0 ? DB.pagos[existIdx].id : uid(), propiedadId: prop.id, inquilinoId: u.id, mes, monto, fecha, comprobante, estado: 'pendiente' };
    if (existIdx >= 0) DB.pagos[existIdx] = pago; else DB.pagos.push(pago);
    save(); close(); renderPagos(); updateBadges();
    toast('Pago registrado, esperando confirmación', 'ok');
    notify(prop.ownerId, { titulo: '💳 Nuevo pago', mensaje: `${u.nombre} registró el pago de ${mesNombre(mes)} (${fmtMoney(monto)})`, tipo: 'info' });
  };
};

window.confirmarPago = (id) => {
  const p = DB.pagos.find(x => x.id === id);
  if (!p) return;
  p.estado = 'pagado';
  save(); renderPagos(); updateBadges();
  notify(p.inquilinoId, { titulo: '✅ Pago confirmado', mensaje: `Tu pago de ${mesNombre(p.mes)} fue verificado.`, tipo: 'ok' });
  toast('Pago confirmado', 'ok');
};

window.eliminarPago = (id) => {
  if (!confirm('¿Eliminar este registro de pago?')) return;
  DB.pagos = DB.pagos.filter(p => p.id !== id);
  save(); renderPagos();
};

// ---------- DAÑOS ----------
function renderDanos() {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return v.innerHTML = `<div class="card">${emptyState('Sin propiedad','','🏠')}</div>`;

  const danos = u.rol === 'dueño'
    ? DB.danos.filter(d => d.propiedadId === prop.id)
    : DB.danos.filter(d => d.inquilinoId === u.id);

  v.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Reportes de daños y mantenimiento</h3>
        ${u.rol === 'inquilino' ? `<button class="btn primary" onclick="abrirNuevoDano()">+ Reportar daño</button>` : ''}
      </div>
      ${danos.length === 0 ? emptyState('Sin reportes', u.rol === 'inquilino' ? 'Si algo se daña, repórtalo aquí.' : 'Tus inquilinos podrán reportar aquí.', '🔧') : `
      <ul class="list">${danos.map(d => {
        const inq = DB.users.find(x => x.id === d.inquilinoId);
        return `<li class="list-item" style="cursor:pointer" onclick="verDano('${d.id}')">
          <div style="font-size:24px">🔧</div>
          <div class="info">
            <strong>${escapeHtml(d.titulo)}</strong>
            <small>${escapeHtml(inq?.nombre || '—')} · ${fmtDate(d.fecha)} · <span class="prio-${d.prioridad}">Prioridad ${d.prioridad}</span></small>
          </div>
          <span class="badge status-${d.estado}">${d.estado}</span>
        </li>`;
      }).join('')}</ul>`}
    </div>
  `;
}

window.abrirNuevoDano = () => {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return toast('Vincula una propiedad', 'warn');
  const close = openModal({
    title: 'Reportar daño',
    body: `
      <div class="field"><label>Título del problema</label><input class="input" id="danoTitulo" placeholder="Ej: Llave de cocina goteando" /></div>
      <div class="field"><label>Descripción detallada</label><textarea class="input" id="danoDesc" placeholder="Describe el problema, ubicación, desde cuándo..."></textarea></div>
      <div class="field"><label>Prioridad</label>
        <select id="danoPrio"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta - Urgente</option></select>
      </div>
    `,
    footer: `<button class="btn ghost" onclick="document.getElementById('modalClose').click()">Cancelar</button><button class="btn primary" id="danoSave">Enviar reporte</button>`
  });
  document.getElementById('danoSave').onclick = () => {
    const titulo = document.getElementById('danoTitulo').value.trim();
    const descripcion = document.getElementById('danoDesc').value.trim();
    const prioridad = document.getElementById('danoPrio').value;
    if (!titulo) return toast('Pon un título', 'warn');
    const d = { id: uid(), propiedadId: prop.id, inquilinoId: u.id, titulo, descripcion, prioridad, estado: 'pendiente', fecha: new Date().toISOString(), mensajes: [] };
    DB.danos.unshift(d);
    save(); close(); renderDanos(); updateBadges();
    notify(prop.ownerId, { titulo: '🔧 Nuevo daño reportado', mensaje: `${u.nombre}: "${titulo}"`, tipo: prioridad === 'alta' ? 'danger' : 'warn' });
    toast('Reporte enviado al dueño', 'ok');
  };
};

window.verDano = (id) => {
  const d = DB.danos.find(x => x.id === id);
  if (!d) return;
  const u = currentUser();
  const inq = DB.users.find(x => x.id === d.inquilinoId);
  const close = openModal({
    title: d.titulo,
    size: 'lg',
    body: `
      <div class="row" style="margin-bottom:12px">
        <span class="badge status-${d.estado}">${d.estado}</span>
        <span class="badge prio-${d.prioridad}">Prioridad ${d.prioridad}</span>
        <span class="muted">${fmtDate(d.fecha)}</span>
      </div>
      <p>${escapeHtml(d.descripcion) || '<em class="muted">Sin descripción</em>'}</p>
      <div class="muted" style="margin-top:8px">Reportado por: <strong>${escapeHtml(inq?.nombre || '—')}</strong></div>
      <div class="divider"></div>
      <h3>Conversación</h3>
      <div class="thread" id="danoThread">${d.mensajes.length === 0 ? '<p class="muted">Aún sin mensajes</p>' : d.mensajes.map(m => {
        const a = DB.users.find(x => x.id === m.userId);
        return `<div class="msg ${a?.rol === 'dueño' ? 'owner' : ''}"><strong>${escapeHtml(a?.nombre || '—')}</strong>: ${escapeHtml(m.texto)}<div class="meta">${fmtDate(m.fecha)}</div></div>`;
      }).join('')}</div>
      <div class="row" style="margin-top:10px">
        <input class="input" id="danoMsg" placeholder="Escribe un mensaje..." />
        <button class="btn primary" id="danoSendMsg">Enviar</button>
      </div>
      ${u.rol === 'dueño' ? `
        <div class="divider"></div>
        <div class="row">
          ${d.estado !== 'proceso' ? `<button class="btn" onclick="cambiarEstadoDano('${d.id}','proceso')">⚙️ En proceso</button>` : ''}
          ${d.estado !== 'resuelto' ? `<button class="btn success" onclick="cambiarEstadoDano('${d.id}','resuelto')">✓ Marcar resuelto</button>` : ''}
          ${d.estado !== 'rechazado' ? `<button class="btn danger" onclick="cambiarEstadoDano('${d.id}','rechazado')">✕ Rechazar</button>` : ''}
        </div>` : ''}
    `
  });
  document.getElementById('danoSendMsg').onclick = () => {
    const txt = document.getElementById('danoMsg').value.trim();
    if (!txt) return;
    d.mensajes.push({ userId: u.id, texto: txt, fecha: new Date().toISOString() });
    save();
    const otra = u.rol === 'dueño' ? d.inquilinoId : DB.propiedades.find(p => p.id === d.propiedadId).ownerId;
    notify(otra, { titulo: '💬 Nuevo mensaje', mensaje: `Sobre "${d.titulo}": ${txt.slice(0, 60)}`, tipo: 'info' });
    close(); verDano(id);
  };
};

window.cambiarEstadoDano = (id, nuevo) => {
  const d = DB.danos.find(x => x.id === id);
  if (!d) return;
  d.estado = nuevo;
  save();
  notify(d.inquilinoId, { titulo: '🔧 Actualización del reporte', mensaje: `"${d.titulo}" → ${nuevo}`, tipo: nuevo === 'resuelto' ? 'ok' : 'info' });
  document.getElementById('modalClose').click();
  renderDanos(); updateBadges();
  toast('Estado actualizado', 'ok');
};

// ---------- PQRS ----------
function renderPQRS() {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return v.innerHTML = `<div class="card">${emptyState('Sin propiedad','','🏠')}</div>`;

  const list = u.rol === 'dueño'
    ? DB.pqrs.filter(q => q.propiedadId === prop.id)
    : DB.pqrs.filter(q => q.autorId === u.id);

  v.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Peticiones, Quejas, Reclamos y Sugerencias</h3>
        ${u.rol === 'inquilino' ? `<button class="btn primary" onclick="abrirNuevaPQRS()">+ Nueva PQRS</button>` : ''}
      </div>
      ${list.length === 0 ? emptyState('Sin PQRS', 'Aquí verás solicitudes, quejas, reclamos y sugerencias.', '📨') : `
      <ul class="list">${list.map(q => {
        const a = DB.users.find(x => x.id === q.autorId);
        const tipos = { peticion:'📝 Petición', queja:'😟 Queja', reclamo:'⚠️ Reclamo', sugerencia:'💡 Sugerencia' };
        return `<li class="list-item" style="cursor:pointer" onclick="verPQRS('${q.id}')">
          <div style="font-size:22px">${tipos[q.tipo].split(' ')[0]}</div>
          <div class="info">
            <strong>${escapeHtml(q.titulo)}</strong>
            <small>${escapeHtml(a?.nombre || '—')} · ${fmtDate(q.fecha)} · ${tipos[q.tipo].split(' ').slice(1).join(' ')}</small>
          </div>
          <span class="badge status-${q.estado}">${q.estado}</span>
        </li>`;
      }).join('')}</ul>`}
    </div>
  `;
}

window.abrirNuevaPQRS = () => {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return toast('Vincula una propiedad', 'warn');
  const close = openModal({
    title: 'Nueva solicitud',
    body: `
      <div class="field"><label>Tipo</label>
        <select id="pqrsTipo">
          <option value="peticion">📝 Petición</option>
          <option value="queja">😟 Queja</option>
          <option value="reclamo">⚠️ Reclamo</option>
          <option value="sugerencia">💡 Sugerencia</option>
        </select>
      </div>
      <div class="field"><label>Título</label><input class="input" id="pqrsTitulo" /></div>
      <div class="field"><label>Detalle</label><textarea class="input" id="pqrsDesc"></textarea></div>
    `,
    footer: `<button class="btn ghost" onclick="document.getElementById('modalClose').click()">Cancelar</button><button class="btn primary" id="pqrsSave">Enviar</button>`
  });
  document.getElementById('pqrsSave').onclick = () => {
    const tipo = document.getElementById('pqrsTipo').value;
    const titulo = document.getElementById('pqrsTitulo').value.trim();
    const descripcion = document.getElementById('pqrsDesc').value.trim();
    if (!titulo) return toast('Pon un título', 'warn');
    const q = { id: uid(), propiedadId: prop.id, autorId: u.id, tipo, titulo, descripcion, estado: 'pendiente', fecha: new Date().toISOString(), mensajes: [] };
    DB.pqrs.unshift(q);
    save(); close(); renderPQRS(); updateBadges();
    notify(prop.ownerId, { titulo: '📨 Nueva PQRS', mensaje: `${u.nombre}: ${titulo}`, tipo: 'info' });
    toast('Solicitud enviada', 'ok');
  };
};

window.verPQRS = (id) => {
  const q = DB.pqrs.find(x => x.id === id);
  if (!q) return;
  const u = currentUser();
  const a = DB.users.find(x => x.id === q.autorId);
  openModal({
    title: q.titulo,
    size: 'lg',
    body: `
      <div class="row" style="margin-bottom:10px">
        <span class="badge brand">${q.tipo}</span>
        <span class="badge status-${q.estado}">${q.estado}</span>
        <span class="muted">${fmtDate(q.fecha)}</span>
      </div>
      <p>${escapeHtml(q.descripcion) || '<em class="muted">Sin detalle</em>'}</p>
      <div class="muted">Por: <strong>${escapeHtml(a?.nombre)}</strong></div>
      <div class="divider"></div>
      <h3>Respuestas</h3>
      <div class="thread">${q.mensajes.length === 0 ? '<p class="muted">Aún sin respuestas</p>' : q.mensajes.map(m => {
        const au = DB.users.find(x => x.id === m.userId);
        return `<div class="msg ${au?.rol === 'dueño' ? 'owner' : ''}"><strong>${escapeHtml(au?.nombre)}</strong>: ${escapeHtml(m.texto)}<div class="meta">${fmtDate(m.fecha)}</div></div>`;
      }).join('')}</div>
      <div class="row" style="margin-top:10px">
        <input class="input" id="pqrsMsg" placeholder="Escribe..." />
        <button class="btn primary" id="pqrsSendMsg">Enviar</button>
      </div>
      ${u.rol === 'dueño' ? `<div class="divider"></div><div class="row">
        ${q.estado !== 'proceso' ? `<button class="btn" onclick="cambiarEstadoPQRS('${q.id}','proceso')">⚙️ En proceso</button>` : ''}
        ${q.estado !== 'resuelto' ? `<button class="btn success" onclick="cambiarEstadoPQRS('${q.id}','resuelto')">✓ Resolver</button>` : ''}
      </div>` : ''}
    `
  });
  document.getElementById('pqrsSendMsg').onclick = () => {
    const txt = document.getElementById('pqrsMsg').value.trim();
    if (!txt) return;
    q.mensajes.push({ userId: u.id, texto: txt, fecha: new Date().toISOString() });
    save();
    const otra = u.rol === 'dueño' ? q.autorId : DB.propiedades.find(p => p.id === q.propiedadId).ownerId;
    notify(otra, { titulo: '💬 Respuesta a PQRS', mensaje: `"${q.titulo}": ${txt.slice(0, 60)}`, tipo: 'info' });
    document.getElementById('modalClose').click(); verPQRS(id);
  };
};

window.cambiarEstadoPQRS = (id, nuevo) => {
  const q = DB.pqrs.find(x => x.id === id);
  if (!q) return;
  q.estado = nuevo; save();
  notify(q.autorId, { titulo: '📨 PQRS actualizada', mensaje: `"${q.titulo}" → ${nuevo}`, tipo: nuevo === 'resuelto' ? 'ok' : 'info' });
  document.getElementById('modalClose').click(); renderPQRS(); updateBadges();
};

// ---------- PROPIEDADES (solo dueño) ----------
function renderPropiedades() {
  const u = currentUser();
  if (u.rol !== 'dueño') return v.innerHTML = `<div class="card">${emptyState('Solo dueños','Esta sección es para dueños.','🔒')}</div>`;
  const props = DB.propiedades.filter(p => p.ownerId === u.id);

  v.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Mis propiedades</h3>
        <button class="btn primary" onclick="abrirNuevaPropiedad()">+ Nueva propiedad</button>
      </div>
      <ul class="list">
        ${props.map(p => {
          const inquilinos = DB.users.filter(u => u.propiedadId === p.id);
          return `<li class="list-item">
            <div style="font-size:24px">🏠</div>
            <div class="info">
              <strong>${escapeHtml(p.nombre)}</strong>
              <small>${escapeHtml(p.direccion || 'Sin dirección')} · ${inquilinos.length} inquilino(s) · ${fmtMoney(p.valorArriendo)}</small>
            </div>
            <span class="chip">🔑 ${p.codigo}</span>
            <button class="btn sm" onclick="editarPropiedad('${p.id}')">Editar</button>
          </li>`;
        }).join('')}
      </ul>
    </div>
  `;
}

window.abrirNuevaPropiedad = () => editarPropiedad(null);
window.editarPropiedad = (id) => {
  const u = currentUser();
  const p = id ? DB.propiedades.find(x => x.id === id) : { id: null, nombre: '', direccion: '', valorArriendo: 0, diaPago: 5, codigo: '' };
  const close = openModal({
    title: id ? 'Editar propiedad' : 'Nueva propiedad',
    body: `
      <div class="field"><label>Nombre</label><input class="input" id="pNombre" value="${escapeHtml(p.nombre)}" /></div>
      <div class="field"><label>Dirección</label><input class="input" id="pDir" value="${escapeHtml(p.direccion)}" /></div>
      <div class="grid-2">
        <div class="field"><label>Valor del arriendo</label><input class="input" type="number" id="pValor" value="${p.valorArriendo}" /></div>
        <div class="field"><label>Día de pago (1-28)</label><input class="input" type="number" min="1" max="28" id="pDia" value="${p.diaPago}" /></div>
      </div>
      ${id ? `<div class="field"><label>Código (compártelo con inquilinos)</label><input class="input" value="${p.codigo}" readonly /></div>` : ''}
    `,
    footer: `${id ? `<button class="btn danger" onclick="borrarPropiedad('${id}')">Eliminar</button>` : ''}<button class="btn ghost" onclick="document.getElementById('modalClose').click()">Cancelar</button><button class="btn primary" id="pSave">Guardar</button>`
  });
  document.getElementById('pSave').onclick = () => {
    const nombre = document.getElementById('pNombre').value.trim();
    if (!nombre) return toast('Nombre requerido', 'warn');
    const data = {
      nombre,
      direccion: document.getElementById('pDir').value.trim(),
      valorArriendo: Number(document.getElementById('pValor').value) || 0,
      diaPago: Math.min(28, Math.max(1, Number(document.getElementById('pDia').value) || 5))
    };
    if (id) Object.assign(p, data);
    else {
      const np = { id: uid(), ownerId: u.id, codigo: 'CASA-' + Math.random().toString(36).slice(2, 6).toUpperCase(), currency: 'COP', ...data };
      DB.propiedades.push(np); DB.conv[np.id] = nuevaConv();
    }
    save(); close(); renderPropiedades(); toast('Guardado', 'ok');
  };
};

window.borrarPropiedad = (id) => {
  if (!confirm('¿Eliminar propiedad? Se perderán pagos, daños y PQRS asociados.')) return;
  DB.propiedades = DB.propiedades.filter(p => p.id !== id);
  DB.pagos = DB.pagos.filter(p => p.propiedadId !== id);
  DB.danos = DB.danos.filter(d => d.propiedadId !== id);
  DB.pqrs = DB.pqrs.filter(q => q.propiedadId !== id);
  delete DB.conv[id];
  DB.users.forEach(u => { if (u.propiedadId === id) u.propiedadId = null; });
  save(); document.getElementById('modalClose').click(); renderPropiedades();
};

// ---------- PERSONAS / INQUILINOS ----------
function renderPersonas() {
  const u = currentUser();
  const prop = userPropiedad();
  if (!prop) return v.innerHTML = `<div class="card">${emptyState('Sin propiedad','','🏠')}</div>`;
  const personas = DB.users.filter(x => x.propiedadId === prop.id);
  const owner = DB.users.find(x => x.id === prop.ownerId);

  v.innerHTML = `
    ${u.rol === 'dueño' ? `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Código de invitación</h3><button class="btn sm" onclick="copiarCodigo('${prop.codigo}')">📋 Copiar</button></div>
      <p class="muted">Comparte este código con tus inquilinos para que se registren:</p>
      <div style="font-size:24px;font-weight:700;letter-spacing:2px;background:var(--surface-2);padding:14px;border-radius:10px;text-align:center">${prop.codigo}</div>
    </div>` : ''}

    <div class="card">
      <h3 style="margin-bottom:14px">Residentes</h3>
      <ul class="list">
        ${owner ? `<li class="list-item">
          <div class="avatar" style="background:${owner.color}">${initials(owner.nombre)}</div>
          <div class="info"><strong>${escapeHtml(owner.nombre)}</strong><small>${escapeHtml(owner.email)}${owner.telefono ? ' · '+escapeHtml(owner.telefono) : ''}</small></div>
          <span class="badge brand">Dueño</span>
        </li>` : ''}
        ${personas.filter(p => p.rol !== 'dueño').map(p => `
          <li class="list-item">
            <div class="avatar" style="background:${p.color}">${initials(p.nombre)}</div>
            <div class="info"><strong>${escapeHtml(p.nombre)}</strong><small>${escapeHtml(p.email)}${p.telefono ? ' · '+escapeHtml(p.telefono) : ''}${p.doc ? ' · ID: '+escapeHtml(p.doc) : ''}</small></div>
            <span class="badge">Inquilino</span>
            ${u.rol === 'dueño' ? `<button class="btn sm danger" onclick="quitarInquilino('${p.id}')">Remover</button>` : ''}
          </li>
        `).join('')}
        ${personas.filter(p => p.rol !== 'dueño').length === 0 ? '<li>'+emptyState('Sin inquilinos', 'Comparte el código para que se registren.', '👥')+'</li>' : ''}
      </ul>
    </div>
  `;
}

window.copiarCodigo = (cod) => {
  navigator.clipboard?.writeText(cod);
  toast('Código copiado', 'ok');
};
window.quitarInquilino = (id) => {
  if (!confirm('¿Remover inquilino de la propiedad?')) return;
  const p = DB.users.find(x => x.id === id); if (!p) return;
  p.propiedadId = null; save(); renderPersonas();
};

// ---------- CONVIVENCIA: ASEO ----------
function getConv() {
  const prop = userPropiedad(); if (!prop) return null;
  if (!DB.conv[prop.id]) DB.conv[prop.id] = nuevaConv();
  return DB.conv[prop.id];
}
function getPersonasProp() {
  const prop = userPropiedad(); if (!prop) return [];
  return DB.users.filter(u => u.propiedadId === prop.id);
}

function getWeekIndex(date = new Date()) {
  const base = new Date(2024, 0, 1);
  return Math.floor((date - base) / (7 * 24 * 60 * 60 * 1000));
}

function rotacionAseo(weekIdx) {
  const conv = getConv(); if (!conv) return [];
  const personas = getPersonasProp();
  if (!personas.length || !conv.zonas.length) return [];
  return conv.zonas.map((zona, i) => ({ zona, persona: personas[(weekIdx + i) % personas.length] }));
}

function renderAseo() {
  const conv = getConv(); if (!conv) return v.innerHTML = `<div class="card">${emptyState('Sin propiedad','','🏠')}</div>`;
  const semana = getWeekIndex();
  const rot = rotacionAseo(semana);

  v.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Rotación de esta semana</h3>
        ${rot.length === 0 ? emptyState('Configura zonas y personas','','🧹') : `
        <ul class="list" style="margin-top:10px">${rot.map(r => `
          <li class="list-item">
            <div class="avatar sm" style="background:${r.persona.color}">${initials(r.persona.nombre)}</div>
            <div class="info"><strong>${escapeHtml(r.zona)}</strong><small>${escapeHtml(r.persona.nombre)}</small></div>
            <span class="badge brand">Esta semana</span>
          </li>`).join('')}</ul>`}
      </div>

      <div class="card">
        <h3>Zonas de aseo</h3>
        <form id="zonaForm" class="row" style="margin-top:8px">
          <input class="input" id="zonaInput" placeholder="Ej: Cocina, Baño..." />
          <button class="btn primary">Agregar</button>
        </form>
        <ul class="list" style="margin-top:10px">${conv.zonas.map((z, i) => `
          <li class="list-item">
            <div style="font-size:18px">📍</div>
            <div class="info"><strong>${escapeHtml(z)}</strong></div>
            <button class="btn sm ghost" onclick="quitarZona(${i})">✕</button>
          </li>`).join('')}</ul>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>Próximas 4 semanas</h3>
      <div class="grid-2" style="margin-top:10px">${[1,2,3,4].map(s => {
        const r = rotacionAseo(semana + s);
        const f = new Date(); f.setDate(f.getDate() + s * 7);
        return `<div style="background:var(--surface-2);padding:14px;border-radius:12px">
          <strong>Semana del ${f.toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</strong>
          <ul class="list" style="margin-top:8px">${r.map(x => `<li class="list-item" style="background:var(--surface)"><div class="avatar sm" style="background:${x.persona.color}">${initials(x.persona.nombre)}</div><div class="info"><strong>${escapeHtml(x.zona)}</strong><small>${escapeHtml(x.persona.nombre)}</small></div></li>`).join('')}</ul>
        </div>`;
      }).join('')}</div>
    </div>
  `;

  document.getElementById('zonaForm').onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById('zonaInput').value.trim();
    if (!v) return;
    conv.zonas.push(v); save(); renderAseo();
  };
}
window.quitarZona = (i) => { const c = getConv(); c.zonas.splice(i, 1); save(); renderAseo(); };

// ---------- BASURA ----------
function renderBasura() {
  const conv = getConv(); if (!conv) return;
  const personas = getPersonasProp();
  const hoy = new Date().getDay();
  const optsHTML = '<option value="">— Sin asignar —</option>' + personas.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');

  v.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Asignación semanal</h3>
        <ul class="list" style="margin-top:10px">${DIAS.map((d, i) => {
          const pid = conv.basura[i]; const p = personas.find(x => x.id === pid);
          return `<li class="list-item" ${i === hoy ? 'style="outline:2px solid var(--brand-500)"' : ''}>
            ${p ? `<div class="avatar sm" style="background:${p.color}">${initials(p.nombre)}</div>` : '<div class="avatar sm" style="background:var(--surface-3);color:var(--muted)">?</div>'}
            <div class="info"><strong>${d}${i === hoy ? ' · Hoy' : ''}</strong><small>${p ? escapeHtml(p.nombre) : 'Sin asignar'}</small></div>
            <select class="basura-sel" data-dia="${i}" style="max-width:160px">${optsHTML}</select>
            ${i === hoy && p ? `<button class="btn sm success" onclick="basuraHecho(${i})">✓ Hecho</button>` : ''}
          </li>`;
        }).join('')}</ul>
      </div>

      <div class="card">
        <h3>Historial</h3>
        <ul class="list" style="margin-top:10px">${conv.basuraHistorial.length === 0 ? '<li>'+emptyState('Sin registros','','🗑️')+'</li>' :
          conv.basuraHistorial.slice(0,15).map(h => {
            const p = personas.find(x => x.id === h.personaId);
            return `<li class="list-item">${p ? `<div class="avatar sm" style="background:${p.color}">${initials(p.nombre)}</div>` : ''}<div class="info"><strong>${escapeHtml(p?.nombre || '—')}</strong><small>${fmtDate(h.fecha)}</small></div></li>`;
          }).join('')}</ul>
      </div>
    </div>
  `;
  document.querySelectorAll('.basura-sel').forEach(s => {
    s.value = conv.basura[s.dataset.dia] || '';
    s.onchange = () => {
      if (s.value) conv.basura[s.dataset.dia] = s.value; else delete conv.basura[s.dataset.dia];
      save(); renderBasura();
    };
  });
}
window.basuraHecho = (i) => {
  const c = getConv(); const personaId = c.basura[i];
  c.basuraHistorial.unshift({ fecha: new Date().toISOString(), personaId });
  c.basuraHistorial = c.basuraHistorial.slice(0, 30);
  save(); renderBasura(); toast('Registrado', 'ok');
};

// ---------- GAS ----------
function renderGas() {
  const conv = getConv(); if (!conv) return;
  const personas = getPersonasProp();
  const turno = personas.length ? personas[conv.gas.ordenIdx % personas.length] : null;
  v.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Turno actual</h3>
        ${turno ? `<div class="row" style="margin:14px 0;align-items:center">
          <div class="avatar lg" style="background:${turno.color}">${initials(turno.nombre)}</div>
          <div><strong style="font-size:20px">${escapeHtml(turno.nombre)}</strong><div class="muted">Le toca comprar el gas</div></div>
        </div>
        <button class="btn primary" onclick="gasComprado()">✅ Marcar como comprado</button>` : emptyState('Sin personas', '', '🔥')}
      </div>
      <div class="card">
        <h3>Historial</h3>
        <ul class="list" style="margin-top:10px">${conv.gas.historial.length === 0 ? '<li>'+emptyState('Sin compras', '', '🔥')+'</li>' :
          conv.gas.historial.slice(0,15).map(h => {
            const p = personas.find(x => x.id === h.personaId);
            return `<li class="list-item">${p ? `<div class="avatar sm" style="background:${p.color}">${initials(p.nombre)}</div>` : ''}<div class="info"><strong>${escapeHtml(p?.nombre || '—')}</strong><small>${fmtDate(h.fecha)}</small></div></li>`;
          }).join('')}</ul>
      </div>
    </div>
  `;
}
window.gasComprado = () => {
  const c = getConv(); const personas = getPersonasProp(); if (!personas.length) return;
  const turno = personas[c.gas.ordenIdx % personas.length];
  c.gas.historial.unshift({ fecha: new Date().toISOString(), personaId: turno.id });
  c.gas.ordenIdx = (c.gas.ordenIdx + 1) % personas.length;
  save(); renderGas(); toast(`Gas comprado por ${turno.nombre}`, 'ok');
};

// ---------- TAREAS ----------
function renderTareas() {
  const conv = getConv(); if (!conv) return;
  const personas = getPersonasProp();
  const u = currentUser();
  const opts = '<option value="">— Sin asignar —</option>' + personas.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  const pend = conv.tareas.filter(t => !t.hecha);
  const done = conv.tareas.filter(t => t.hecha);

  const tpl = t => {
    const p = personas.find(x => x.id === t.personaId);
    const venc = t.fecha && !t.hecha && new Date(t.fecha) < new Date(new Date().toDateString());
    return `<li class="list-item">
      ${p ? `<div class="avatar sm" style="background:${p.color}">${initials(p.nombre)}</div>` : '<div class="avatar sm" style="background:var(--surface-3);color:var(--muted)">?</div>'}
      <div class="info"><strong style="${t.hecha?'text-decoration:line-through;opacity:.6':''}">${escapeHtml(t.titulo)}</strong>
      <small>${p ? escapeHtml(p.nombre) : 'Sin asignar'}${t.fecha ? ' · '+fmtDate(t.fecha) : ''} ${venc ? '<span class="badge danger">Vencida</span>' : ''}</small></div>
      <button class="btn sm ${t.hecha?'':'success'}" onclick="toggleTarea('${t.id}')">${t.hecha?'↩':'✓'}</button>
      <button class="btn sm ghost" onclick="delTarea('${t.id}')">✕</button>
    </li>`;
  };

  v.innerHTML = `
    <div class="card">
      <h3>Nueva tarea</h3>
      <form id="tareaForm" style="margin-top:10px">
        <div class="field"><input class="input" id="tTitulo" placeholder="¿Qué hay que hacer?" required /></div>
        <div class="grid-2">
          <select id="tPersona">${opts}</select>
          <input class="input" type="date" id="tFecha" />
        </div>
        <button class="btn primary block" style="margin-top:10px">+ Agregar tarea</button>
      </form>
    </div>
    <div class="grid-2" style="margin-top:14px">
      <div class="card">
        <h3>Pendientes</h3>
        <ul class="list" style="margin-top:10px">${pend.length ? pend.map(tpl).join('') : '<li>'+emptyState('¡Al día!','','🎉')+'</li>'}</ul>
      </div>
      <div class="card">
        <h3>Completadas</h3>
        <ul class="list" style="margin-top:10px">${done.length ? done.slice(0,10).map(tpl).join('') : '<li>'+emptyState('Aún nada','','📝')+'</li>'}</ul>
      </div>
    </div>
  `;
  document.getElementById('tareaForm').onsubmit = e => {
    e.preventDefault();
    const titulo = document.getElementById('tTitulo').value.trim();
    if (!titulo) return;
    conv.tareas.unshift({ id: uid(), titulo, personaId: document.getElementById('tPersona').value || null, fecha: document.getElementById('tFecha').value || null, hecha: false });
    save(); renderTareas(); toast('Tarea agregada', 'ok');
  };
}
window.toggleTarea = (id) => { const c = getConv(); const t = c.tareas.find(x => x.id === id); t.hecha = !t.hecha; save(); renderTareas(); };
window.delTarea = (id) => { const c = getConv(); c.tareas = c.tareas.filter(t => t.id !== id); save(); renderTareas(); };

// ---------- NOTIFICACIONES ----------
function renderNotificaciones() {
  const u = currentUser();
  const list = DB.notifs.filter(n => n.userId === u.id);
  v.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Centro de notificaciones</h3>
        <div class="row">
          <button class="btn sm" onclick="marcarTodasLeidas()">✓ Marcar leídas</button>
          <button class="btn sm" onclick="activarBrowser()">🔔 Activar push</button>
        </div>
      </div>
      ${list.length === 0 ? emptyState('Sin notificaciones','Aquí verás avisos sobre pagos, daños, PQRS y más.','🔔') : `
      <ul class="list">${list.slice(0, 50).map(n => `
        <li class="list-item" style="${n.leida?'opacity:.6':''}" onclick="marcarLeida('${n.id}')">
          <div style="font-size:22px">${n.tipo === 'danger' ? '⚠️' : n.tipo === 'warn' ? '🔶' : n.tipo === 'ok' ? '✅' : '🔔'}</div>
          <div class="info"><strong>${escapeHtml(n.titulo)}</strong><small>${escapeHtml(n.mensaje)} · ${fmtDate(n.fecha)}</small></div>
          ${!n.leida ? '<span class="badge brand">Nueva</span>' : ''}
        </li>`).join('')}</ul>`}
    </div>
  `;
}

window.marcarLeida = (id) => { const n = DB.notifs.find(x => x.id === id); if (n) { n.leida = true; save(); renderNotificaciones(); updateBadges(); } };
window.marcarTodasLeidas = () => { const u = currentUser(); DB.notifs.forEach(n => { if (n.userId === u.id) n.leida = true; }); save(); renderNotificaciones(); updateBadges(); };
window.activarBrowser = async () => {
  if (!('Notification' in window)) return toast('Tu navegador no soporta', 'warn');
  const p = await Notification.requestPermission();
  DB.meta.browserNotifEnabled = p === 'granted';
  save();
  if (p === 'granted') { toast('Notificaciones activadas', 'ok'); new Notification('Casa 🏡', { body: 'Recibirás avisos importantes' }); }
  else toast('Permiso denegado', 'warn');
};

// ---------- AJUSTES ----------
function renderAjustes() {
  const u = currentUser();
  v.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>Mi cuenta</h3>
        <div class="row" style="margin:14px 0">
          <div class="avatar lg" style="background:${u.color}">${initials(u.nombre)}</div>
          <div><strong>${escapeHtml(u.nombre)}</strong><div class="muted">${escapeHtml(u.email)} · ${u.rol}</div></div>
        </div>
        <div class="field"><label>Nombre</label><input class="input" id="acNombre" value="${escapeHtml(u.nombre)}" /></div>
        <div class="grid-2">
          <div class="field"><label>Teléfono</label><input class="input" id="acTel" value="${escapeHtml(u.telefono||'')}" /></div>
          <div class="field"><label>Documento</label><input class="input" id="acDoc" value="${escapeHtml(u.doc||'')}" /></div>
        </div>
        <button class="btn primary" onclick="guardarPerfil()">Guardar cambios</button>
      </div>

      <div class="card">
        <h3>Preferencias</h3>
        <div class="field"><label>Notificaciones del navegador</label>
          <button class="btn" onclick="activarBrowser()">${('Notification' in window && Notification.permission === 'granted') ? '✅ Activadas' : 'Activar'}</button>
        </div>
        <div class="divider"></div>
        <h3>Datos</h3>
        <div class="row">
          <button class="btn" onclick="exportData()">📤 Exportar</button>
          <button class="btn" onclick="document.getElementById('importFile').click()">📥 Importar</button>
          <input type="file" id="importFile" accept="application/json" hidden onchange="importData(event)" />
        </div>
        <div class="divider"></div>
        <button class="btn danger" onclick="cerrarSesionConfirm()">⏻ Cerrar sesión</button>
      </div>
    </div>
    <p class="muted center" style="margin-top:18px">Casa SaaS · v2.0 · Hecho con 💜</p>
  `;
}
window.guardarPerfil = () => {
  const u = currentUser();
  u.nombre = document.getElementById('acNombre').value.trim() || u.nombre;
  u.telefono = document.getElementById('acTel').value.trim();
  u.doc = document.getElementById('acDoc').value.trim();
  save(); bootApp(); toast('Perfil actualizado', 'ok');
};
window.cerrarSesionConfirm = () => document.getElementById('logoutBtn').click();
window.exportData = () => {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `casa_backup_${today()}.json`; a.click();
};
window.importData = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { DB = Object.assign(structuredClone(defaultDB), JSON.parse(r.result)); save(); bootApp(); toast('Importado', 'ok'); } catch { toast('Archivo inválido', 'danger'); } };
  r.readAsText(f);
};

// ============================================================
// INIT
// ============================================================
if (session && currentUser()) bootApp();
else {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authPage').classList.remove('hidden');
}

// PWA
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
