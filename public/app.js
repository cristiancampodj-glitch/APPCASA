/* ============================================================
   Mi Casa — App SPA (vanilla JS, simple, intuitiva)
   ============================================================ */
(() => {
'use strict';

// ===================== API =====================
const API = {
  token: () => localStorage.getItem('token'),
  setToken: (t) => t ? localStorage.setItem('token', t) : localStorage.removeItem('token'),
  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const tk = this.token(); if (tk) headers.Authorization = `Bearer ${tk}`;
    const r = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data; try { data = await r.json(); } catch { data = {}; }
    if (r.status === 401 || r.status === 403) {
      // Token inválido / cuenta desactivada → forzar logout
      const msg = data.error || (r.status === 403 ? 'Cuenta desactivada' : 'Sesión expirada');
      this.setToken(null);
      try { localStorage.removeItem('user'); } catch {}
      if (typeof toast === 'function') toast(msg, 'error');
      setTimeout(() => location.reload(), 600);
      throw new Error(msg);
    }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  },
  get(p)     { return this.req(p); },
  post(p, b) { return this.req(p, { method:'POST', body: b }); },
  patch(p,b) { return this.req(p, { method:'PATCH', body: b }); },
  del(p)     { return this.req(p, { method:'DELETE' }); },
  async refresh() {
    try {
      const { token } = await this.post('/api/auth/refresh', {});
      if (token) this.setToken(token);
    } catch {}
  },
  async openPdf(path, filename) {
    const tk = this.token();
    const r = await fetch(path, { headers: tk ? { Authorization:`Bearer ${tk}` } : {} });
    if (!r.ok) throw new Error('No se pudo descargar el PDF');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank';
    if (filename) a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 30000);
  }
};

// ===================== UI helpers =====================
const $ = (s, r=document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false)
    e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const toast = (msg, type='') => {
  const t = el('div', { class:`toast ${type}` }, msg);
  $('#toast-host').append(t);
  setTimeout(()=>t.remove(), 3500);
};
function modal(content) {
  const back = el('div', { class:'modal-back', onclick:(e)=>{ if(e.target===back) back.remove(); } });
  const m = el('div', { class:'modal' }, content);
  back.append(m); document.body.append(back);
  return { close: () => back.remove() };
}

// Modal bonito para mostrar credenciales (correo + contraseña) con copiar y WhatsApp
function showCredentialsModal({ title, subtitle, email, password }) {
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copiado`, 'success'); }
    catch { toast('No se pudo copiar', 'error'); }
  };
  const row = (icon, label, value, copyLabel) => el('div', {
    class:'cred-row',
    style:{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px',
            padding:'12px 14px', background:'var(--bg-soft, rgba(255,255,255,.05))',
            borderRadius:'10px', marginBottom:'10px' }
  },
    el('div', { style:{ flex:'1', minWidth:'0' } },
      el('div', { style:{ fontSize:'12px', color:'var(--text-muted)' } }, `${icon} ${label}`),
      el('div', { style:{ fontWeight:'600', wordBreak:'break-all' } }, value)
    ),
    el('button', { class:'btn sm ghost', onclick:()=> copy(value, copyLabel) }, '📋')
  );
  const m = modal(el('div', {},
    el('h3', {}, title),
    el('p', { style:{ color:'var(--text-muted)', marginBottom:'14px' } }, subtitle),
    row('📧', 'Correo', email, 'Correo'),
    row('🔑', 'Contraseña', password, 'Contraseña'),
    el('div', { style:{ display:'flex', gap:'8px', marginTop:'8px' } },
      el('button', {
        class:'btn lg block',
        onclick:()=> copy(`Correo: ${email}\nContraseña: ${password}`, 'Datos')
      }, '📋 Copiar todo'),
      el('button', {
        class:'btn lg block ghost',
        onclick:()=> { m.close(); }
      }, 'Cerrar')
    )
  ));
}

// Modal de confirmación bonito (reemplaza confirm nativo)
function confirmModal({ title, message, confirmText='Confirmar', cancelText='Cancelar', danger=false }) {
  return new Promise((resolve) => {
    const m = modal(el('div', {},
      el('h3', {}, title),
      el('p', { style:{ color:'var(--text-muted)', marginBottom:'16px', whiteSpace:'pre-line' } }, message),
      el('div', { style:{ display:'flex', gap:'8px' } },
        el('button', { class:'btn lg block ghost',
          onclick:()=> { m.close(); resolve(false); } }, cancelText),
        el('button', { class:'btn lg block ' + (danger ? 'danger' : ''),
          onclick:()=> { m.close(); resolve(true); } }, confirmText)
      )
    ));
  });
}

// ===================== Money =====================
function fmtMoney(n, currency) {
  const cur = (currency || 'COP').toUpperCase();
  const meta = {
    COP: { locale:'es-CO', dec:0 }, EUR: { locale:'es-ES', dec:2 },
    USD: { locale:'en-US', dec:2 }, MXN: { locale:'es-MX', dec:2 }
  }[cur] || { locale:'es-CO', dec:2 };
  try {
    return new Intl.NumberFormat(meta.locale, {
      style:'currency', currency:cur,
      minimumFractionDigits: meta.dec, maximumFractionDigits: meta.dec
    }).format(Number(n) || 0);
  } catch { return cur + ' ' + (Number(n)||0).toLocaleString(); }
}
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-CO',{ day:'2-digit', month:'short', year:'numeric' }) : '—';
const PAY_STATUS_ES = { paid:'Pagado', pending:'Pendiente', overdue:'En mora', partial:'Parcial', cancelled:'Cancelado' };
const fmtPayStatus = (s) => PAY_STATUS_ES[s] || s || '';

// ===================== STATE =====================
const state = {
  user: null,
  houses: [],
  currentHouseId: null,   // para vista detalle
  view: 'home',           // home | detail | settings
  theme: localStorage.getItem('theme') || 'light',
  currencies: []
};

function setTheme(t) { state.theme = t; document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }
setTheme(state.theme);

// ===================== BOOT =====================
async function boot() {
  try { state.currencies = await API.get('/api/currencies'); } catch {}
  if (!API.token()) return render();
  try {
    const { user } = await API.get('/api/auth/me');
    state.user = user;
    // Refrescar token cada 6 horas mientras la pestaña esté abierta
    setInterval(() => API.refresh(), 6 * 60 * 60 * 1000);
    // 🔔 Conectar canal en tiempo real (SSE)
    connectRealtime();
    // 🔄 Refrescar al volver de segundo plano (móvil/PWA)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.user) softRefresh();
    });
  } catch {
    API.setToken(null);
  }
  render();
}

// ===================== REALTIME (SSE) =====================
let _sse = null;
let _sseRetry = 0;
function connectRealtime() {
  try { if (_sse) _sse.close(); } catch {}
  const tk = API.token();
  if (!tk) return;
  const url = `/api/realtime/stream?token=${encodeURIComponent(tk)}`;
  const es = new EventSource(url);
  _sse = es;
  es.onopen = () => { _sseRetry = 0; };
  es.onmessage = (ev) => {
    let data; try { data = JSON.parse(ev.data); } catch { return; }
    handleRealtime(data);
  };
  es.onerror = () => {
    try { es.close(); } catch {}
    _sse = null;
    // Reintento rápido: 0.5s, 1s, 2s, 4s, máximo 5s
    _sseRetry = Math.min(_sseRetry + 1, 4);
    const delay = Math.min(500 * Math.pow(2, _sseRetry - 1), 5000);
    setTimeout(connectRealtime, delay);
  };
}

function handleRealtime(ev) {
  if (!ev || !ev.type) return;
  switch (ev.type) {
    case 'hello':
      // primer mensaje de bienvenida
      break;
    case 'notification': {
      const n = ev.notification || {};
      toast(n.title + (n.body ? ' — ' + n.body : ''), 'info');
      // 🔉 sonidito + vibración (si lo soporta)
      try { navigator.vibrate && navigator.vibrate([60, 30, 60]); } catch {}
      // Notificación nativa del navegador (si dieron permiso)
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(n.title || 'Mi Casa', { body: n.body || '', icon: '/manifest.json', tag: n.id });
        }
      } catch {}
      softRefresh();
      break;
    }
    case 'damage_created':
    case 'damage_updated':
    case 'payment_paid':
    case 'announcement_created':
      softRefresh();
      break;
  }
}

// Re-renderiza la vista actual sin perder estado
function softRefresh() {
  if (!state.user) return;
  try { render(); } catch {}
}

// Solicita permiso para notificaciones nativas (1 vez)
function askNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(()=>{});
    }
  } catch {}
}

// ===================== RENDER ROOT =====================
function render() {
  const root = $('#app');
  root.innerHTML = '';
  if (!state.user) { root.append(renderAuth()); return; }
  root.append(renderApp());
}

// ===================== AUTH =====================
function renderAuth() {
  let mode = 'login';
  const wrap = el('div', { class:'auth' });
  const card = el('div', { class:'auth-card' });

  function paint() {
    card.innerHTML = '';
    card.append(
      el('h1', {}, '🏡 Mi Casa'),
      el('div', { class:'sub' }, mode === 'login' ? 'Hola, ingresa a tu cuenta' : 'Crea tu cuenta'),
      el('div', { class:'auth-tabs' },
        el('button', { class: mode==='login' ? 'active' : '', onclick:()=>{ mode='login'; paint(); } }, 'Entrar'),
        el('button', { class: mode==='register' ? 'active' : '', onclick:()=>{ mode='register'; paint(); } }, 'Crear cuenta')
      )
    );

    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      try {
        const data = await API.post('/api/auth/' + mode, fd);
        // Registro queda pendiente de aprobación
        if (data && data.pending) {
          toast(data.message || 'Tu solicitud fue recibida. Te avisaremos cuando un administrador la apruebe.', 'success');
          mode = 'login';
          paint();
          return;
        }
        API.setToken(data.token);
        state.user = data.user;
        toast('¡Bienvenido!', 'success');
        connectRealtime();
        askNotificationPermission();
        render();
      } catch (err) { toast(err.message, 'error'); }
    }});

    if (mode === 'register') {
      form.append(field('full_name', 'Tu nombre completo', 'text', true));
      form.append(field('house_name', 'Nombre de tu primera propiedad (ej: Apto 301)', 'text', false));
      form.append(field('phone', 'Teléfono (opcional)', 'tel', false));
      form.append(currencyField());
    }
    form.append(field('email', 'Correo electrónico', 'email', true));
    form.append(field('password', 'Contraseña (mínimo 6)', 'password', true));
    form.append(el('button', { class:'btn lg block', type:'submit' }, mode==='login' ? '🔓 Entrar' : '✨ Crear mi cuenta'));

    card.append(form);
  }
  paint();
  wrap.append(card);
  return wrap;
}
function field(name, label, type='text', required=false, value='') {
  return el('div', { class:'field' },
    el('label', {}, label),
    el('input', { name, type, required, value })
  );
}
function currencyField() {
  const opts = state.currencies.length ? state.currencies : [
    { code:'COP', name:'Peso Colombiano', symbol:'$' },
    { code:'EUR', name:'Euro', symbol:'€' },
    { code:'USD', name:'Dólar', symbol:'US$' }
  ];
  const sel = el('select', { name:'currency' });
  opts.forEach(c => sel.append(el('option', { value:c.code }, `${c.symbol} ${c.code} — ${c.name}`)));
  return el('div', { class:'field' }, el('label', {}, 'Moneda principal'), sel);
}

// ===================== APP SHELL =====================
function renderApp() {
  const layout = el('div', { class:'layout' });
  const isTenant = state.user.role === 'tenant';

  // Sidebar (desktop)
  const sidebar = el('aside', { class:'sidebar' },
    el('div', { class:'brand' }, el('span', { class:'brand-icon' }, '🏡'), 'Mi Casa'),
    el('nav', { class:'nav' },
      navBtn('home',     '🏠', isTenant ? 'Mi Apartamento' : 'Mis Propiedades'),
      navBtn('payments', '💰', 'Pagos'),
      navBtn('bills',    '🧾', 'Recibos'),
      navBtn('contracts','📄', 'Contratos'),
      navBtn('damages',  '🛠️', 'Daños'),
      navBtn('messages', '💬', 'Avisos'),
      !isTenant && navBtn('settings', '⚙️', 'Ajustes')
    ),
    el('div', { class:'sidebar-footer' },
      el('button', { class:'nav-btn', onclick: logout }, el('span',{ class:'nav-icon'},'🚪'), 'Cerrar sesión')
    )
  );

  // Main
  const main = el('main', { class:'main' });
  renderView(main);

  // Bottom nav (mobile)
  const bottom = el('nav', { class:'bottom-nav' },
    bottomBtn('home', '🏠', 'Inicio'),
    bottomBtn('payments', '💰', 'Pagos'),
    bottomBtn('bills', '🧾', 'Recibos'),
    bottomBtn('contracts', '📄', 'Contrato'),
    bottomBtn('damages', '🛠️', 'Daños'),
    bottomBtn('messages', '💬', 'Avisos'),
    isTenant
      ? el('button', { onclick: logout }, el('span', { class:'icon' }, '🚪'), 'Salir')
      : bottomBtn('settings', '⚙️', 'Más')
  );

  layout.append(sidebar, main, bottom);
  return layout;
}
function navBtn(view, icon, label) {
  return el('button', {
    class: 'nav-btn ' + (state.view === view ? 'active' : ''),
    onclick: () => { state.view = view; state.currentHouseId = null; render(); }
  }, el('span', { class:'nav-icon' }, icon), label);
}
function bottomBtn(view, icon, label) {
  return el('button', {
    class: state.view === view ? 'active' : '',
    onclick: () => { state.view = view; state.currentHouseId = null; render(); }
  }, el('span', { class:'icon' }, icon), label);
}

function logout() { API.setToken(null); state.user = null; render(); }

// ===================== ROUTER =====================
function renderView(c) {
  if (state.currentHouseId) return viewHouseDetail(c);
  switch (state.view) {
    case 'home':      return state.user.role === 'tenant' ? viewTenantHome(c) : viewProperties(c);
    case 'payments':  return viewAllPayments(c);
    case 'bills':     return viewBills(c);
    case 'contracts': return viewContracts(c);
    case 'damages':   return viewAllDamages(c);
    case 'messages':  return viewAnnouncements(c);
    case 'settings':  return state.user.role === 'tenant' ? viewTenantHome(c) : viewSettings(c);
    default: return viewProperties(c);
  }
}

// ===================== VIEW: PROPIEDADES (DUEÑO HOME) =====================
async function viewProperties(c) {
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '🏠 Mis Propiedades'),
    el('div', { class:'topbar-actions' },
      el('button', { class:'icon-btn', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
        state.theme==='dark'?'☀️':'🌙')
    )
  ));

  const grid = el('div', { class:'props-grid' });
  c.append(grid);
  grid.append(el('div', { class:'empty' }, el('div', { class:'spinner' })));

  try {
    const { houses } = await API.get('/api/houses');
    state.houses = houses;
    grid.innerHTML = '';

    houses.forEach(h => grid.append(renderPropCard(h)));
    grid.append(el('button', { class:'prop-add', onclick: openAddProperty },
      el('span', { class:'plus' }, '+'),
      el('span', {}, 'Añadir apartamento')
    ));
  } catch (e) {
    grid.innerHTML = '';
    grid.append(el('div', { class:'empty' }, el('div', { class:'icon' }, '⚠️'),
      el('div', { class:'msg' }, e.message)));
  }
}

function renderPropCard(h) {
  const tenant = (h.tenants && h.tenants[0]) || null;
  const status = h.status || (tenant ? 'occupied' : 'available');
  const statusLabel = { occupied:'🟢 Ocupado', available:'🔵 Disponible', maintenance:'🟠 En mantenimiento' }[status] || status;

  const alerts = [];
  if (h.overdue_count > 0)
    alerts.push(el('span', { class:'prop-alert danger' }, `⚠️ ${h.overdue_count} pago${h.overdue_count>1?'s':''} en mora · ${fmtMoney(h.overdue_amount, h.currency)}`));
  if (h.utility_overdue_count > 0)
    alerts.push(el('span', { class:'prop-alert danger' }, `🧾 ${h.utility_overdue_count} recibo${h.utility_overdue_count>1?'s':''} vencido${h.utility_overdue_count>1?'s':''} · ${fmtMoney(h.utility_overdue_amount, h.currency)}`));
  else if (h.utility_pending_count > 0)
    alerts.push(el('span', { class:'prop-alert warning' }, `🧾 ${h.utility_pending_count} recibo${h.utility_pending_count>1?'s':''} por pagar · ${fmtMoney(h.utility_pending_amount, h.currency)}`));
  if (h.damages_count > 0)
    alerts.push(el('span', { class:'prop-alert warning' }, `🛠️ ${h.damages_count} daño${h.damages_count>1?'s':''} pendiente${h.damages_count>1?'s':''}`));
  if (h.income_month > 0)
    alerts.push(el('span', { class:'prop-alert success' }, `💰 ${fmtMoney(h.income_month, h.currency)} este mes`));
  if (alerts.length === 0)
    alerts.push(el('span', { class:'prop-alert success' }, '✅ Todo al día'));

  return el('div', { class:'prop-card', onclick: () => openHouse(h.id) },
    el('div', { class:'prop-head' },
      el('div', { class:'prop-emoji' }, '🏠'),
      el('div', { style:{ flex:1 } },
        el('h3', { class:'prop-name' }, h.name),
        h.address && el('div', { class:'prop-addr' }, '📍 ' + h.address)
      ),
      el('span', { class:'prop-status ' + status }, statusLabel)
    ),
    tenant
      ? el('div', { class:'prop-tenant' },
          el('b', {}, '👤 ' + tenant.name),
          el('small', {}, tenant.email + (tenant.phone ? ' · ' + tenant.phone : '')))
      : el('div', { class:'prop-tenant' },
          el('b', {}, 'Sin inquilino'),
          el('small', {}, 'Toca para añadir uno')),
    el('div', { class:'prop-alerts' }, alerts)
  );
}

function openHouse(id) { state.currentHouseId = id; render(); }

// ===================== AGREGAR PROPIEDAD =====================
function openAddProperty() {
  const m = modal(el('div', {},
    el('h3', {}, '🏠 Nueva propiedad'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        if (data.monthly_rent) data.monthly_rent = Number(data.monthly_rent);
        try {
          await API.post('/api/houses', data);
          m.close(); toast('Propiedad añadida ✅', 'success'); render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('name', 'Nombre (ej: Apto 301, Casa Centro)', 'text', true),
        field('address', 'Dirección', 'text'),
        field('city', 'Ciudad', 'text'),
        field('monthly_rent', 'Arriendo mensual', 'number'),
        currencyField(),
        el('button', { class:'btn lg block', type:'submit' }, '💾 Guardar propiedad')
      );
      return f;
    })()
  ));
}

// ===================== VISTA DETALLE DE UN INMUEBLE =====================
async function viewHouseDetail(c) {
  const id = state.currentHouseId;
  const h = state.houses.find(x => x.id === id);
  const cur = h?.currency || 'COP';

  c.append(el('div', { class:'topbar' },
    el('div', { style:{ display:'flex', alignItems:'center', gap:'14px' } },
      el('button', { class:'icon-btn', onclick: () => { state.currentHouseId = null; render(); } }, '←'),
      el('h1', {}, h ? '🏠 ' + h.name : 'Cargando…')
    ),
    el('div', { class:'topbar-actions' },
      el('button', { class:'btn ghost sm', onclick: () => editHouse(h) }, '✏️ Editar')
    )
  ));

  if (!h) return;

  // KPIs de esta propiedad
  c.append(el('div', { class:'kpi-row' },
    kpi('Ingresos del mes', fmtMoney(h.income_month, cur), 'success'),
    kpi('Mora total', fmtMoney(h.overdue_amount, cur), h.overdue_amount > 0 ? 'danger' : ''),
    kpi('Daños pendientes', h.damages_count, h.damages_count > 0 ? 'warning' : ''),
    kpi('Inquilinos', (h.tenants || []).length, '')
  ));

  // Inquilino(s)
  const sec1 = el('div', { class:'detail-section' },
    el('h3', {}, '👤 Inquilino', el('button', {
      class:'btn sm', style:{ marginLeft:'auto' },
      onclick: () => openInviteTenant(h.id)
    }, '+ Añadir'))
  );
  if (!h.tenants || h.tenants.length === 0) {
    sec1.append(emptyState('🪑', 'Sin inquilino actual'));
  } else {
    const list = el('div', { class:'list' });
    h.tenants.forEach(t => list.append(el('div', { class:'list-item' },
      el('div', { style:{ flex:'1' } },
        el('div', { class:'name' }, '👤 ' + t.name),
        el('div', { class:'meta' }, t.email + (t.phone ? ' · ' + t.phone : ''))
      ),
      el('button', {
        class:'btn sm ghost',
        onclick: () => openManageTenant(t, h)
      }, '⚙️ Gestionar')
    )));
    sec1.append(list);
  }
  c.append(sec1);

  // 📅 Días de pago configurados
  const dueDays = [
    { day: h.rent_due_day,     icon:'🏠', label:'Arriendo' },
    { day: h.water_due_day,    icon:'💧', label:'Agua' },
    { day: h.power_due_day,    icon:'💡', label:'Luz' },
    { day: h.gas_due_day,      icon:'🔥', label:'Gas' },
    { day: h.internet_due_day, icon:'🌐', label:'Internet' }
  ].filter(x => x.day);
  const secDays = el('div', { class:'detail-section' },
    el('h3', {}, '📅 Días de pago', el('button', {
      class:'btn sm', style:{ marginLeft:'auto' },
      onclick:()=> editHouse(h)
    }, '✏️ Configurar'))
  );
  if (!dueDays.length) {
    secDays.append(emptyState('📅', 'Aún no configuras días de pago. Tu inquilino los verá como recordatorio.'));
  } else {
    const grid = el('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'8px' }
    });
    dueDays.forEach(it => grid.append(el('div', {
      style:{ padding:'10px', borderRadius:'10px', background:'var(--bg)', textAlign:'center', border:'1px solid var(--border)' }
    },
      el('div', { style:{ fontSize:'24px' } }, it.icon),
      el('div', { style:{ fontSize:'13px', color:'var(--text-muted)' } }, it.label),
      el('div', { style:{ fontSize:'20px', fontWeight:'700' } }, 'Día ' + it.day)
    )));
    secDays.append(grid);
  }
  c.append(secDays);

  // Pagos
  const sec2 = el('div', { class:'detail-section' },
    el('h3', {}, '💰 Pagos', el('button', {
      class:'btn sm', style:{ marginLeft:'auto' },
      onclick: () => openCreatePayment(h)
    }, '+ Cobro'))
  );
  c.append(sec2);
  loadPayments(sec2, h);

  // 🧾 Recibos de servicios (parte que le toca a esta casa)
  const secBills = el('div', { class:'detail-section' },
    el('h3', {}, '🧾 Recibos de servicios')
  );
  c.append(secBills);
  loadHouseBills(secBills, h);

  // Daños
  const sec3 = el('div', { class:'detail-section' },
    el('h3', {}, '🛠️ Daños reportados')
  );
  c.append(sec3);
  loadDamages(sec3, h);

  // 📄 Contrato
  const sec4 = el('div', { class:'detail-section' },
    el('h3', {}, '📄 Contrato',
      el('button', { class:'btn sm', style:{ marginLeft:'auto' },
        onclick: () => openContractEditor(h) }, '✏️ Editar / Firmar'))
  );
  c.append(sec4);
  loadHouseContract(sec4, h);
}

function kpi(label, value, type='') {
  return el('div', { class:'kpi ' + type },
    el('div', { class:'label' }, label),
    el('div', { class:'value' }, String(value))
  );
}
function emptyState(icon, msg) {
  return el('div', { class:'empty' },
    el('div', { class:'icon' }, icon),
    el('div', { class:'msg' }, msg)
  );
}

async function loadPayments(container, house) {
  try {
    const { payments } = await API.get('/api/payments');
    const list = el('div', { class:'list' });
    const filtered = payments.filter(p => p.house_id === house.id);
    if (!filtered.length) { container.append(emptyState('💰', 'Sin cobros aún')); return; }
    filtered.forEach(p => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, `${p.period_month}/${p.period_year} — ${p.tenant_name || ''}`),
        el('div', { class:'meta' }, `Vence ${fmtDate(p.due_date)} · ${fmtMoney(p.amount, p.currency)}`),
        p.reference && el('div', { class:'meta' }, '📌 ' + p.reference),
        p.notes && el('div', { class:'meta' }, '📝 ' + p.notes)
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + p.status }, fmtPayStatus(p.status)),
        p.receipt_url &&
          el('a', { class:'btn sm ghost', href: p.receipt_url, target:'_blank', title:'Comprobante' }, '📎'),
        p.status !== 'paid' && state.user.role !== 'tenant' &&
          el('button', { class:'btn sm', onclick:()=> remindPayment(p, house) }, '📲 Recordar'),
        p.status !== 'paid' &&
          el('button', { class:'btn sm success', onclick:()=> markPaid(p) }, '✓ Pagar'),
        p.status === 'paid' &&
          el('a', { class:'btn sm ghost', href:`/api/payments/${p.id}/receipt.pdf`, target:'_blank' }, '📄 PDF')
      )
    )));
    container.append(list);
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

async function loadHouseBills(container, house) {
  try {
    const { bills } = await API.get('/api/utility-bills');
    // filtrar shares de esta casa
    const rows = [];
    (bills || []).forEach(b => {
      (b.shares || []).filter(s => s && s.house_id === house.id)
        .forEach(s => rows.push({ bill: b, share: s }));
    });
    if (!rows.length) { container.append(emptyState('🧾', 'Sin recibos para esta casa')); return; }
    const list = el('div', { class:'list' });
    rows.forEach(({ bill, share }) => {
      const meta = utilMeta(bill.type);
      list.append(el('div', { class:'list-item' },
        el('div', { style:{ display:'flex', gap:'10px', alignItems:'center' } },
          el('div', { style:{ fontSize:'24px' } }, meta.icon),
          el('div', {},
            el('div', { class:'name' }, `${meta.label} — ${bill.period_month}/${bill.period_year}`),
            el('div', { class:'meta' },
              `Le toca: ${fmtMoney(share.amount)}` +
              (bill.due_date ? ` · Vence ${fmtDate(bill.due_date)}` : '')),
            share.reference && el('div', { class:'meta' }, '📌 ' + share.reference),
            share.notes && el('div', { class:'meta' }, '📝 ' + share.notes)
          )
        ),
        el('div', { class:'list-actions' },
          bill.bill_url &&
            el('a', { class:'btn sm ghost', href: bill.bill_url, target:'_blank', title:'Recibo del servicio' }, '🧾'),
          share.receipt_url &&
            el('a', { class:'btn sm ghost', href: share.receipt_url, target:'_blank', title:'Comprobante' }, '📎'),
          el('span', { class:'badge ' + (share.paid ? 'paid' : 'pending') }, share.paid ? 'Pagado' : 'Pendiente'),
          !share.paid &&
            el('button', { class:'btn sm success', onclick:()=> paidShare(share, bill) }, '✓ Pagar')
        )
      ));
    });
    container.append(list);
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

async function loadDamages(container, house) {  try {
    const { damages } = await API.get('/api/damages');
    const filtered = (damages || []).filter(d => d.house_id === house.id);
    if (!filtered.length) { container.append(emptyState('✅', 'Sin daños reportados')); return; }
    const list = el('div', { class:'list' });
    filtered.forEach(d => list.append(el('div', { class:'list-item' },
      el('div', { style:{ display:'flex', gap:'12px', alignItems:'center' } },
        d.photo_url && el('img', { src: d.photo_url, alt:'',
          style:{ width:'56px', height:'56px', objectFit:'cover', borderRadius:'8px', cursor:'pointer' },
          onclick:()=> window.open(d.photo_url, '_blank') }),
        el('div', {},
          el('div', { class:'name' }, '🛠️ ' + d.title),
          el('div', { class:'meta' }, `${d.location || '—'} · ${fmtDate(d.created_at)} · ${d.reporter_name || ''}`)
        )
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + (d.status === 'resolved' ? 'paid' : 'pending') }, d.status),
        state.user.role !== 'tenant' && d.status !== 'resolved' &&
          el('button', { class:'btn sm success', onclick: async () => {
            try { await API.patch('/api/damages/' + d.id, { status:'resolved' });
              toast('Resuelto ✅', 'success'); render(); }
            catch (e) { toast(e.message, 'error'); }
          }}, '✓ Resuelto')
      )
    )));
    container.append(list);
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

// ===================== INVITAR INQUILINO =====================
function openManageTenant(tenant, house) {
  const m = modal(el('div', {},
    el('h3', {}, '⚙️ Gestionar inquilino'),
    el('p', { style:{ color:'var(--text-muted)', marginBottom:'12px' } },
      `${tenant.name} · ${house.name || 'Propiedad'}`),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        const payload = {};
        if (data.full_name) payload.full_name = data.full_name;
        if (data.email) payload.email = data.email;
        if (data.phone !== undefined) payload.phone = data.phone;
        if (data.password && data.password.trim().length >= 6) payload.password = data.password.trim();
        else if (data.password && data.password.trim().length > 0) {
          return toast('La contraseña debe tener al menos 6 caracteres', 'error');
        }
        try {
          await API.patch(`/api/users/${tenant.id}`, payload);
          m.close();
          toast('Datos actualizados ✅', 'success');
          if (payload.password) {
            showCredentialsModal({
              title: '🔑 Nueva contraseña asignada',
              subtitle: `Comparte estos datos con ${tenant.name}:`,
              email: payload.email || tenant.email,
              password: payload.password
            });
          }
          state.currentHouseId = null; render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('full_name', 'Nombre completo', 'text', false, tenant.name),
        field('email', 'Correo', 'email', false, tenant.email),
        field('phone', 'Teléfono', 'tel', false, tenant.phone || ''),
        field('password', 'Nueva contraseña (opcional, mín 6)', 'text'),
        el('p', { style:{ color:'var(--text-muted)', fontSize:'13px', marginTop:'-4px', marginBottom:'12px' } },
          'Si tu inquilino olvidó su clave, escribe una nueva aquí.'),
        el('button', { class:'btn lg block', type:'submit' }, '💾 Guardar cambios')
      );
      return f;
    })(),
    el('hr', { style:{ margin:'16px 0', borderColor:'var(--border)' } }),
    el('button', {
      class:'btn lg block danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: '🚪 Terminar contrato',
          message: `¿Seguro que quieres terminar el contrato de ${tenant.name}?\n\nSe desactivará su cuenta y se desasignará de la propiedad.`,
          confirmText: 'Sí, terminar',
          danger: true
        });
        if (!ok) return;
        try {
          await API.post(`/api/users/${tenant.id}/end-contract`, {});
          m.close();
          toast('Contrato terminado', 'success');
          state.currentHouseId = null; render();
        } catch (err) { toast(err.message, 'error'); }
      }
    }, '🚪 Terminar contrato')
  ));
}

// ===================== INVITAR INQUILINO =====================
function openInviteTenant(houseId) {
  // Almacenamos los archivos cargados aquí
  const docs = { national_id_url: null, income_docs_url: null };

  // Helper: input de archivo que guarda dataURL en `docs[key]`
  function fileField(key, labelText, accept) {
    const status = el('div', { class:'meta', style:{ marginTop:'4px' } }, 'Sin archivo');
    const inp = el('input', { type:'file', accept: accept || 'image/*,application/pdf' });
    inp.addEventListener('change', () => {
      const file = inp.files[0]; if (!file) return;
      if (file.size > 6 * 1024 * 1024) { toast('Archivo muy grande (máx 6 MB)', 'error'); inp.value = ''; return; }
      const reader = new FileReader();
      reader.onload = e => {
        docs[key] = e.target.result;
        status.textContent = '✅ ' + file.name + ' · ' + Math.round(file.size/1024) + ' KB';
      };
      reader.readAsDataURL(file);
    });
    return el('div', { class:'field' }, el('label', {}, labelText), inp, status);
  }

  // Sección de ingresos según tipo de empleo
  const incomeHelp = el('p', { class:'meta', style:{ marginTop:'4px' } },
    'Selecciona el tipo de actividad para ver qué documento adjuntar.');
  const incomeDocLabel = el('label', {}, '📎 Soporte de ingresos');

  const m = modal(el('div', {},
    el('h3', {}, '👤 Añadir inquilino'),
    el('p', { style:{ color:'var(--text-muted)', marginBottom:'12px' } },
      'Le crearemos una cuenta y guardaremos los soportes del estudio de arrendamiento.'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        // Validación: ingresos > 2x canon (informativo, lo valida el dueño)
        try {
          const r = await API.post(`/api/houses/${houseId}/invite-tenant`, {
            full_name: data.full_name,
            email: data.email,
            phone: data.phone,
            password: data.password,
            national_id: data.national_id,
            employment_type: data.employment_type,
            monthly_income: data.monthly_income ? Number(data.monthly_income) : null,
            credit_clean: data.credit_clean === 'on',
            rental_study_paid: data.rental_study_paid === 'on',
            rental_study_amount: data.rental_study_amount ? Number(data.rental_study_amount) : null,
            national_id_url: docs.national_id_url,
            income_docs_url: docs.income_docs_url
          });
          m.close();
          toast('Inquilino añadido ✅', 'success');
          showCredentialsModal({
            title: '👤 Inquilino creado',
            subtitle: 'Comparte estos datos con tu inquilino:',
            email: r.login.email,
            password: r.login.password
          });
          render();
        } catch (err) { toast(err.message, 'error'); }
      }});

      // ----- Datos básicos -----
      const basic = el('div', {},
        el('h4', { style:{ marginTop:'4px' } }, '📋 Datos personales'),
        field('full_name', 'Nombre completo', 'text', true),
        field('national_id', 'Número de cédula', 'text', true),
        field('email', 'Correo electrónico', 'email', true),
        field('phone', 'Teléfono / WhatsApp', 'tel'),
        field('password', 'Contraseña que tendrá (mín 6)', 'text', true),
        fileField('national_id_url', '📎 Fotocopia de la cédula (imagen o PDF)')
      );

      // ----- Ingresos -----
      const incomeSel = el('select', { name:'employment_type', required:true,
        onchange: () => {
          const v = incomeSel.value;
          if (v === 'employee') {
            incomeDocLabel.textContent = '📎 Carta laboral + colillas de pago';
            incomeHelp.textContent = 'Adjunta carta laboral y últimas colillas (PDF o imagen).';
          } else if (v === 'independent') {
            incomeDocLabel.textContent = '📎 RUT + extractos bancarios';
            incomeHelp.textContent = 'Adjunta RUT y extractos bancarios de los últimos meses.';
          } else {
            incomeDocLabel.textContent = '📎 Soporte de ingresos';
            incomeHelp.textContent = 'Selecciona el tipo de actividad.';
          }
        }
      },
        el('option', { value:'' }, 'Selecciona...'),
        el('option', { value:'employee' }, 'Empleado'),
        el('option', { value:'independent' }, 'Independiente')
      );

      const incomeFile = el('input', { type:'file', accept:'image/*,application/pdf' });
      incomeFile.addEventListener('change', () => {
        const file = incomeFile.files[0]; if (!file) return;
        if (file.size > 6 * 1024 * 1024) { toast('Archivo muy grande (máx 6 MB)', 'error'); incomeFile.value = ''; return; }
        const reader = new FileReader();
        reader.onload = e => {
          docs.income_docs_url = e.target.result;
          incomeHelp.textContent = '✅ ' + file.name + ' · ' + Math.round(file.size/1024) + ' KB';
        };
        reader.readAsDataURL(file);
      });

      const income = el('div', {},
        el('h4', {}, '💼 Ingresos (mín 2× canon)'),
        el('div', { class:'field' }, el('label', {}, 'Tipo de actividad'), incomeSel),
        field('monthly_income', 'Ingreso mensual estimado', 'number', false),
        el('div', { class:'field' }, incomeDocLabel, incomeFile, incomeHelp)
      );

      // ----- Centrales de riesgo + estudio -----
      const checks = el('div', {},
        el('h4', {}, '✅ Requisitos legales'),
        el('label', { class:'check', style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px' } },
          el('input', { type:'checkbox', name:'credit_clean' }),
          'Declaro NO tener reportes negativos en centrales de riesgo (Datacrédito / TransUnion).'),
        el('label', { class:'check', style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px' } },
          el('input', { type:'checkbox', name:'rental_study_paid' }),
          'El inquilino pagó el estudio de arrendamiento.'),
        field('rental_study_amount', 'Monto del estudio (opcional)', 'number'),
        el('p', { class:'meta' },
          'ℹ️ El codeudor (fiador) se registra al crear el contrato.')
      );

      f.append(basic, el('hr'), income, el('hr'), checks,
        el('button', { class:'btn lg block', type:'submit', style:{ marginTop:'14px' } }, '✅ Crear cuenta del inquilino'));
      return f;
    })()
  ));
}

// ===================== EDITAR PROPIEDAD =====================
function editHouse(h) {
  const m = modal(el('div', {},
    el('h3', {}, '✏️ Editar propiedad'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        if (data.monthly_rent) data.monthly_rent = Number(data.monthly_rent);
        try {
          await API.patch(`/api/houses/${h.id}`, data);
          m.close(); toast('Guardado ✅', 'success');
          state.currentHouseId = null; render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('name', 'Nombre', 'text', true, h.name),
        field('address', 'Dirección', 'text', false, h.address || ''),
        field('city', 'Ciudad', 'text', false, h.city || ''),
        field('monthly_rent', 'Arriendo mensual', 'number', false, h.monthly_rent || ''),
        field('owner_whatsapp', 'Tu WhatsApp (con país, ej: +573001234567)', 'tel', false, h.owner_whatsapp || ''),
        el('div', { class:'field' },
          el('label', {}, '🏦 Datos bancarios (los verá el inquilino para pagar)'),
          el('textarea', { name:'bank_info', rows:4,
            placeholder:'Ej:\nBancolombia – Ahorros\nN° 123-456789-00\nA nombre de Juan Pérez\nCC 12345678' }, h.bank_info || '')
        ),

        // 📅 Días de pago — el inquilino los verá como recordatorios
        el('h4', { style:{ marginTop:'18px', marginBottom:'4px' } }, '📅 Días de pago del mes'),
        el('p', { style:{ color:'var(--text-muted)', marginTop:0, fontSize:'15px' } },
          'Día (1-31) en que vencen el arriendo y los servicios. Déjalo vacío si no aplica.'),
        el('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'10px' } },
          field('rent_due_day',     '🏠 Arriendo',  'number', false, h.rent_due_day || ''),
          field('water_due_day',    '💧 Agua',      'number', false, h.water_due_day || ''),
          field('power_due_day',    '💡 Luz',       'number', false, h.power_due_day || ''),
          field('gas_due_day',      '🔥 Gas',       'number', false, h.gas_due_day || ''),
          field('internet_due_day', '🌐 Internet',  'number', false, h.internet_due_day || '')
        ),
        el('div', { class:'field' },
          el('label', {}, '📝 Notas de servicios (opcional)'),
          el('textarea', { name:'services_notes', rows:3,
            placeholder:'Ej:\nAgua: Empresa de Acueducto, cuenta 12345\nLuz: Enel, cliente 9876' }, h.services_notes || '')
        ),

        el('button', { class:'btn lg block', type:'submit' }, '💾 Guardar'),
        el('button', { class:'btn ghost block', type:'button', style:{ marginTop:'8px' }, onclick: async () => {
          if (!confirm('¿Archivar esta propiedad?')) return;
          await API.del(`/api/houses/${h.id}`);
          m.close(); state.currentHouseId = null; render();
          toast('Propiedad archivada', 'success');
        }}, '🗑️ Archivar')
      );
      return f;
    })()
  ));
}

// ===================== CREAR COBRO =====================
function openCreatePayment(house) {
  const tenant = (house.tenants || [])[0];
  if (!tenant) return toast('Primero añade un inquilino', 'error');

  const m = modal(el('div', {},
    el('h3', {}, '💰 Nuevo cobro'),
    el('p', { style:{ color:'var(--text-muted)', marginBottom:'16px' } }, `Cobro para ${tenant.name}`),
    (() => {
      const now = new Date();
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        data.amount = Number(data.amount);
        data.period_month = Number(data.period_month);
        data.period_year = Number(data.period_year);
        data.tenant_id = tenant.id;
        try {
          await API.post('/api/payments', data);
          m.close(); toast('Cobro creado ✅', 'success');
          state.currentHouseId = null; render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('amount', 'Monto', 'number', true, house.monthly_rent || ''),
        field('period_month', 'Mes', 'number', true, now.getMonth() + 1),
        field('period_year', 'Año', 'number', true, now.getFullYear()),
        field('due_date', 'Fecha de vencimiento', 'date', true,
          new Date(now.getFullYear(), now.getMonth(), 5).toISOString().slice(0,10)),
        el('button', { class:'btn lg block', type:'submit' }, '💾 Crear cobro')
      );
      return f;
    })()
  ));
}

async function markPaid(p) {
  openProofModal({
    title: `💰 Registrar pago — ${p.period_month}/${p.period_year}`,
    subtitleDefault: `Arriendo ${p.period_month}/${p.period_year}`,
    amount: p.amount,
    currency: p.currency,
    onSubmit: async ({ receipt_url, reference, notes }) => {
      await API.patch(`/api/payments/${p.id}/pay`, {
        method: 'transfer',
        amount_paid: p.amount,
        reference, receipt_url, notes
      });
    }
  });
}

// Modal genérico para subir comprobante (foto/PDF como dataURL), asunto y nota
function openProofModal({ title, subtitleDefault, amount, currency, onSubmit }) {
  let receiptDataUrl = null;
  const preview = el('div', {
    style:{ minHeight:'80px', padding:'10px', border:'1px dashed var(--border)',
            borderRadius:'10px', textAlign:'center', color:'var(--text-muted)' }
  }, '📎 Adjunta una foto o PDF del comprobante (opcional)');

  const fileInput = el('input', { type:'file', accept:'image/*,application/pdf', style:{ display:'none' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]; if (!file) return;
    if (file.size > 6 * 1024 * 1024) return toast('Archivo muy grande (máx 6MB)', 'error');
    const reader = new FileReader();
    reader.onload = () => {
      receiptDataUrl = reader.result;
      preview.innerHTML = '';
      if (file.type.startsWith('image/')) {
        preview.append(el('img', { src: receiptDataUrl,
          style:{ maxWidth:'100%', maxHeight:'200px', borderRadius:'8px' } }));
      } else {
        preview.append(el('div', { style:{ padding:'20px' } },
          el('div', { style:{ fontSize:'42px' } }, '📄'),
          el('div', {}, file.name)));
      }
      preview.append(el('div', { class:'meta', style:{ marginTop:'6px' } },
        '✅ Adjuntado · ' + Math.round(file.size/1024) + ' KB'));
    };
    reader.readAsDataURL(file);
  });

  const f = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    btnSubmit.disabled = true; btnSubmit.textContent = '⏳ Enviando...';
    try {
      await onSubmit({
        receipt_url: receiptDataUrl,
        reference: data.reference || null,
        notes: data.notes || null
      });
      m.close(); toast('Pago registrado ✅', 'success'); render();
    } catch (err) {
      toast(err.message, 'error');
      btnSubmit.disabled = false; btnSubmit.textContent = '💾 Registrar pago';
    }
  }});

  const btnSubmit = el('button', { class:'btn lg block success', type:'submit' }, '💾 Registrar pago');

  f.append(
    amount && el('div', { style:{ textAlign:'center', padding:'4px 0 12px' } },
      el('div', { class:'meta' }, 'Monto'),
      el('div', { style:{ fontSize:'32px', fontWeight:'800', color:'var(--primary)' } },
        fmtMoney(amount, currency))
    ),
    el('div', { class:'field' },
      el('label', {}, '📌 Asunto / concepto'),
      el('input', { name:'reference', type:'text', value: subtitleDefault || '',
        placeholder:'Ej: Arriendo abril, Recibo gas marzo' })
    ),
    el('div', { class:'field' },
      el('label', {}, '📝 Nota (opcional)'),
      el('textarea', { name:'notes', rows:2, placeholder:'Comentario adicional…' })
    ),
    el('div', { class:'field' },
      el('label', {}, '📷 Comprobante'),
      preview,
      el('button', { type:'button', class:'btn block', style:{ marginTop:'8px' },
        onclick: () => fileInput.click() }, '📎 Seleccionar archivo'),
      fileInput
    ),
    btnSubmit
  );

  const m = modal(el('div', {}, el('h3', {}, title), f));
}

// Pagar parte de un recibo (utility share) con comprobante
function paidShare(share, bill) {
  const meta = utilMeta(bill.type);
  openProofModal({
    title: `${meta.icon} Pagar ${meta.label} — ${bill.period_month}/${bill.period_year}`,
    subtitleDefault: `${meta.label} ${bill.period_month}/${bill.period_year}`,
    amount: share.amount,
    onSubmit: async ({ receipt_url, reference, notes }) => {
      await API.patch(`/api/utility-bills/shares/${share.id}/pay`, { receipt_url, reference, notes });
    }
  });
}

// Recordatorio de pago vía WhatsApp (sin Twilio): abre wa.me con texto pre-llenado
async function remindPayment(p, house) {
  let phone = '';
  let name = p.tenant_name || '';
  try {
    const { users } = await API.get('/api/users');
    const u = (users || []).find(x => x.id === p.tenant_id);
    if (u) { phone = (u.whatsapp || u.phone || '').replace(/\D/g,''); name = u.full_name || name; }
  } catch {}
  if (!phone) {
    const ask = prompt('Número de WhatsApp del inquilino (con código país, ej: +573001234567):');
    if (!ask) return;
    phone = ask.replace(/\D/g,'');
  }
  const cur = p.currency || house.currency || 'COP';
  const txt = `Hola ${name.split(' ')[0]} 👋\n\nTe recuerdo el pago del arriendo:\n\n💰 ${fmtMoney(p.amount, cur)}\n📅 Vence: ${fmtDate(p.due_date)}\n🏠 ${house.name}\n\n¿Me avisas cuando lo realices? Gracias.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank');
}

// ===================== VISTA INQUILINO (super simple, 3 acciones) =====================
async function viewTenantHome(c) {
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '👋 Hola, ' + (state.user.full_name || '').split(' ')[0]),
    el('button', { class:'icon-btn', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
      state.theme==='dark'?'☀️':'🌙')
  ));

  // Banner: próximo pago grande
  const banner = el('div', { class:'detail-section' });
  c.append(banner);
  banner.append(el('div', { class:'spinner' }));

  let info;
  try { info = await API.get('/api/payments/next'); }
  catch (e) { banner.innerHTML = ''; banner.append(emptyState('⚠️', e.message)); return; }

  banner.innerHTML = '';
  const p = info.payment;
  const h = info.house || {};
  const cur = (p && p.currency) || h.house_currency || 'COP';

  if (p) {
    const isOverdue = p.status === 'overdue' || (new Date(p.due_date) < new Date());
    const hasLateFee = (p.late_fee_preview || 0) > 0;
    const baseAmount = Number(p.base_amount || p.amount);
    const totalAmount = Number(p.current_amount || p.amount);
    banner.append(
      el('div', { style:{ textAlign:'center', padding:'20px 8px' } },
        el('div', { style:{ fontSize:'18px', color:'var(--text-muted)', marginBottom:'8px' } },
          isOverdue ? '⚠️ Tienes un pago vencido' : 'Tu próximo pago'),
        el('div', { style:{ fontSize:'56px', fontWeight:'800', color: isOverdue ? 'var(--danger)' : 'var(--primary)', lineHeight:'1.1' } },
          fmtMoney(totalAmount, cur)),
        hasLateFee && el('div', { style:{ marginTop:'10px', padding:'8px 12px', background:'var(--danger-bg, #fee2e2)', color:'var(--danger)', borderRadius:'10px', display:'inline-block', fontSize:'14px' } },
          `🚨 Mora: ${p.days_late} días · Canon ${fmtMoney(baseAmount, cur)} + intereses ${fmtMoney(p.late_fee_preview, cur)}`),
        el('div', { style:{ fontSize:'18px', color:'var(--text-muted)', marginTop:'8px' } },
          'Vence ' + fmtDate(p.due_date) + ' · ' + p.period_month + '/' + p.period_year)
      )
    );
  } else {
    banner.append(el('div', { style:{ textAlign:'center', padding:'20px' } },
      el('div', { style:{ fontSize:'48px' } }, '✅'),
      el('div', { style:{ fontSize:'24px', fontWeight:'700', color:'var(--success)' } }, 'No tienes pagos pendientes'),
      el('div', { style:{ color:'var(--text-muted)', marginTop:'8px' } }, '¡Estás al día!')
    ));
  }

  // 3 acciones grandes
  const actions = el('div', {
    style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'16px', marginBottom:'20px' }
  });
  c.append(actions);

  actions.append(
    el('button', { class:'btn lg success', onclick:()=> showPayInfo(p, h, cur) },
      '💳 Pagar arriendo'),
    el('button', { class:'btn lg warning', onclick: openReportDamage },
      '🛠️ Reportar daño'),
    el('button', { class:'btn lg', onclick:()=> openWhatsAppOwner(h) },
      '📲 Hablar con el dueño')
  );

  // Mi apartamento (info)
  c.append(el('div', { class:'detail-section' },
    el('h3', {}, '🏠 Mi apartamento'),
    el('div', {}, el('b', {}, h.house_name || '—')),
    h.owner_name && el('div', { style:{ marginTop:'8px', color:'var(--text-muted)' } },
      'Dueño: ' + h.owner_name + (h.owner_email ? ' · ' + h.owner_email : ''))
  ));

  // 📅 Calendario de pagos del mes
  await tenantCalendar(c);

  // Histórico simplificado
  await tenantHistory(c);
}

// Días de pago configurados por el dueño (arriendo + servicios)
async function tenantCalendar(c) {
  try {
    const { houses } = await API.get('/api/houses');
    const h = houses[0]; if (!h) return;
    const items = [
      { day: h.rent_due_day,     icon:'🏠', label:'Arriendo' },
      { day: h.water_due_day,    icon:'💧', label:'Agua' },
      { day: h.power_due_day,    icon:'💡', label:'Luz' },
      { day: h.gas_due_day,      icon:'🔥', label:'Gas' },
      { day: h.internet_due_day, icon:'🌐', label:'Internet' }
    ].filter(x => x.day);
    if (!items.length) return;

    const today = new Date();
    const todayDay = today.getDate();
    const monthEnd = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();

    // Calcular días faltantes
    items.forEach(it => {
      const d = Math.min(it.day, monthEnd);
      it.diff = d - todayDay;          // negativo = ya pasó este mes
      it.isToday = it.diff === 0;
      it.label_when = it.diff === 0 ? '¡Hoy!' :
                      it.diff > 0   ? `En ${it.diff} día${it.diff===1?'':'s'}` :
                                      `Pasó hace ${-it.diff} día${-it.diff===1?'':'s'}`;
    });
    items.sort((a, b) => {
      // Próximos primero, luego pasados
      if (a.diff >= 0 && b.diff < 0) return -1;
      if (a.diff < 0 && b.diff >= 0) return 1;
      return a.diff - b.diff;
    });

    const sec = el('div', { class:'detail-section' });
    sec.append(el('h3', {}, '📅 Fechas del mes'));
    const grid = el('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:'10px' }
    });
    items.forEach(it => {
      const upcoming = it.diff >= 0;
      const soon = it.diff >= 0 && it.diff <= 3;
      grid.append(el('div', {
        style:{
          padding:'14px', borderRadius:'14px', textAlign:'center',
          background: it.isToday ? 'var(--warning)' : (soon ? 'rgba(255,165,0,0.12)' : 'var(--bg)'),
          color: it.isToday ? '#fff' : 'inherit',
          opacity: upcoming ? 1 : 0.55,
          border:'1px solid var(--border)'
        }
      },
        el('div', { style:{ fontSize:'30px' } }, it.icon),
        el('div', { style:{ fontSize:'17px', fontWeight:'700' } }, it.label),
        el('div', { style:{ fontSize:'28px', fontWeight:'800', margin:'4px 0' } }, 'Día ' + it.day),
        el('div', { style:{ fontSize:'14px', opacity:0.85 } }, it.label_when)
      ));
    });
    sec.append(grid);
    if (h.services_notes) {
      sec.append(el('div', {
        style:{ marginTop:'14px', padding:'12px', background:'var(--bg)', borderRadius:'10px',
                whiteSpace:'pre-wrap', fontSize:'15px', color:'var(--text-muted)' }
      }, '📝 ' + h.services_notes));
    }
    c.append(sec);
  } catch {}
}

async function tenantHistory(c) {
  try {
    const { payments } = await API.get('/api/payments');
    if (!payments.length) return;
    const sec = el('div', { class:'detail-section' });
    sec.append(el('h3', {}, '📋 Mi historial'));
    const list = el('div', { class:'list' });
    payments.slice(0, 6).forEach(p => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, p.period_month + '/' + p.period_year),
        el('div', { class:'meta' }, fmtMoney(p.amount, p.currency) + ' · ' +
          (p.status === 'paid' ? 'Pagado ' + fmtDate(p.paid_at) : 'Vence ' + fmtDate(p.due_date)))
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + p.status }, fmtPayStatus(p.status)),
        p.status === 'paid' &&
          el('a', { class:'btn sm ghost', href:`/api/payments/${p.id}/receipt.pdf`, target:'_blank' }, '📄')
      )
    )));
    sec.append(list);
    c.append(sec);
  } catch {}
}

// Mostrar opciones de pago: link en línea + datos bancarios para copiar
function showPayInfo(p, h, cur) {
  if (!p) return toast('No tienes pagos pendientes ✅', 'success');

  const totalAmount = Number(p.current_amount || p.amount);
  const baseAmount = Number(p.base_amount || p.amount);
  const lateFee = Number(p.late_fee_preview || 0);

  const m = modal(el('div', {},
    el('h3', {}, '💳 Pagar arriendo'),
    el('div', { style:{ textAlign:'center', padding:'10px 0 20px' } },
      el('div', { style:{ color:'var(--text-muted)' } }, 'Total a pagar'),
      el('div', { style:{ fontSize:'42px', fontWeight:'800', color:'var(--primary)' } }, fmtMoney(totalAmount, cur)),
      lateFee > 0 && el('div', { style:{ marginTop:'8px', fontSize:'13px', color:'var(--danger)' } },
        `Canon ${fmtMoney(baseAmount, cur)} + intereses por mora ${fmtMoney(lateFee, cur)} (${p.days_late} días)`)
    ),

    // Botón: pago en línea
    el('button', { class:'btn lg block success', onclick: async () => {
      try {
        const { checkout_url } = await API.post(`/api/payments/${p.id}/checkout`);
        window.open(checkout_url, '_blank');
      } catch (err) { toast(err.message, 'error'); }
    }}, '🌐 Pagar en línea (Mercado Pago)'),

    el('div', { style:{ textAlign:'center', margin:'14px 0', color:'var(--text-muted)' } }, '— o —'),

    // Datos bancarios
    h.bank_info
      ? el('div', {},
          el('div', { style:{ background:'var(--bg)', padding:'16px', borderRadius:'12px', whiteSpace:'pre-wrap', fontSize:'17px', lineHeight:'1.6' } }, h.bank_info),
          el('button', { class:'btn block', style:{ marginTop:'10px' }, onclick: () => {
            navigator.clipboard.writeText(h.bank_info);
            toast('Datos copiados ✅', 'success');
          }}, '📋 Copiar datos para transferencia')
        )
      : el('div', { class:'empty' }, el('div', { class:'msg' }, 'El dueño aún no configuró sus datos bancarios')),

    el('hr'),
    el('button', { class:'btn ghost block', onclick: () => {
      const txt = `Hola${h.owner_name ? ' '+h.owner_name.split(' ')[0] : ''}, ya hice la transferencia del arriendo de ${fmtMoney(totalAmount, cur)} (${p.period_month}/${p.period_year}). Por favor confírmame cuando te llegue.`;
      const phone = (h.owner_whatsapp || h.owner_phone || '').replace(/\D/g,'');
      if (!phone) return toast('El dueño no tiene WhatsApp configurado', 'error');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank');
    }}, '📲 Avisar al dueño por WhatsApp')
  ));
}

function openWhatsAppOwner(h) {
  const phone = (h.owner_whatsapp || h.owner_phone || '').replace(/\D/g,'');
  if (!phone) return toast('El dueño no tiene WhatsApp configurado', 'error');
  const txt = `Hola${h.owner_name ? ' '+h.owner_name.split(' ')[0] : ''}, soy tu inquilino de ${h.house_name || ''}.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`, '_blank');
}

// ===================== VISTAS GLOBALES (todos los pagos / daños) =====================
async function viewAllPayments(c) {
  c.append(el('div', { class:'topbar' }, el('h1', {}, '💰 Todos los pagos')));
  const sec = el('div', { class:'detail-section' });
  c.append(sec);
  try {
    const { payments } = await API.get('/api/payments');
    if (!payments.length) return sec.append(emptyState('💰', 'Sin pagos'));
    const list = el('div', { class:'list' });
    payments.forEach(p => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, `${p.period_month}/${p.period_year} — ${p.tenant_name || ''}`),
        el('div', { class:'meta' }, `Vence ${fmtDate(p.due_date)} · ${fmtMoney(p.amount, p.currency)}`)
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + p.status }, fmtPayStatus(p.status)),
        p.status !== 'paid' && state.user.role !== 'tenant' &&
          el('button', { class:'btn sm success', onclick:()=> markPaid(p) }, '✓ Pagado')
      )
    )));
    sec.append(list);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

async function viewAllDamages(c) {
  const isOwner = ['owner','admin'].includes(state.user.role);
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '🛠️ Daños'),
    el('button', { class:'btn', onclick: openReportDamage }, '+ Reportar daño')
  ));
  const sec = el('div', { class:'detail-section' });
  c.append(sec);
  try {
    const { damages } = await API.get('/api/damages');
    if (!damages || !damages.length) return sec.append(emptyState('✅', 'Sin daños reportados'));

    // Pendientes primero
    const pendings = damages.filter(d => d.status !== 'resolved');
    const done     = damages.filter(d => d.status === 'resolved');

    const renderList = (arr, title) => {
      if (!arr.length) return;
      sec.append(el('h3', { style:{ marginTop:'16px' } }, title));
      const list = el('div', { class:'list' });
      arr.forEach(d => {
        const houseLabel = d.house_unit
          ? `${d.house_unit} · ${d.house_name || ''}`
          : (d.house_name || '');
        const item = el('div', { class:'list-item' },
          el('div', { style:{ flex:1 } },
            el('div', { class:'name' },
              (d.priority === 'urgent' ? '🚨 ' : d.priority === 'high' ? '🔴 ' : '🛠️ ') + d.title),
            el('div', { class:'meta' },
              `🏠 ${houseLabel} · 📍 ${d.location || '—'}`),
            el('div', { class:'meta' },
              `${fmtDate(d.created_at)} · 👤 ${d.reporter_name || ''}`),
            d.description && el('div', { style:{ marginTop:'6px', fontSize:'14px' } }, d.description),
            d.photo_url && el('img', { src: d.photo_url,
              style:{ marginTop:'8px', maxWidth:'220px', borderRadius:'10px' } })
          ),
          el('div', { class:'list-actions' },
            el('span', { class:'badge ' + (d.status === 'resolved' ? 'paid' : 'pending') }, d.status),
            isOwner && d.status !== 'resolved' && el('button', { class:'btn sm success',
              onclick: async () => {
                if (!confirm('¿Marcar este daño como resuelto?')) return;
                try {
                  await API.patch('/api/damages/' + d.id, { status:'resolved' });
                  toast('Daño resuelto ✅', 'success'); render();
                } catch (err) { toast(err.message, 'error'); }
              }
            }, '✅ Resolver')
          )
        );
        list.append(item);
      });
      sec.append(list);
    };

    renderList(pendings, `⏳ Pendientes (${pendings.length})`);
    renderList(done,     `✅ Resueltos (${done.length})`);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

function openReportDamage() {
  let photoDataUrl = null;
  const preview = el('div', { style:{ marginTop:'8px' } });

  const m = modal(el('div', {},
    el('h3', {}, '🛠️ Reportar daño'),
    el('p', { style:{ color:'var(--text-muted)', marginTop:'-6px' } },
      'Toma una foto del daño para que el dueño pueda verlo enseguida.'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        if (!data.title) return toast('Pon un título corto', 'error');
        data.photo_url = photoDataUrl;
        try {
          await API.post('/api/damages', data);
          m.close(); toast('Daño reportado ✅', 'success'); render();
        } catch (err) { toast(err.message, 'error'); }
      }});

      // Botón cámara con preview
      const fileInput = el('input', {
        type:'file', accept:'image/*', capture:'environment',
        style:{ display:'none' },
        onchange: (e) => {
          const file = e.target.files[0];
          if (!file) return;
          // Comprimir antes de enviar
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const max = 1024;
              const scale = Math.min(1, max / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = img.width * scale;
              canvas.height = img.height * scale;
              canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
              photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              preview.innerHTML = '';
              preview.append(el('img', { src: photoDataUrl,
                style:{ maxWidth:'100%', borderRadius:'12px', maxHeight:'240px' } }));
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        }
      });

      f.append(
        field('title', 'Título (ej: Fuga en baño)', 'text', true),
        field('location', 'Ubicación (ej: cocina, baño principal)', 'text'),
        el('div', { class:'field' },
          el('label', {}, 'Descripción'),
          el('textarea', { name:'description', rows:3, placeholder:'¿Qué pasó? ¿Hace cuánto?' })
        ),
        el('div', { class:'field' },
          el('label', {}, 'Prioridad'),
          el('select', { name:'priority' },
            el('option', { value:'low' }, 'Baja'),
            el('option', { value:'medium', selected:true }, 'Media'),
            el('option', { value:'high' }, 'Alta'),
            el('option', { value:'urgent' }, '🚨 Urgente')
          )
        ),
        fileInput,
        el('button', { type:'button', class:'btn block', onclick:()=> fileInput.click() },
          '📸 Tomar / elegir foto'),
        preview,
        el('button', { class:'btn lg block success', type:'submit', style:{ marginTop:'16px' } },
          '📤 Enviar reporte')
      );
      return f;
    })()
  ));
}

// ===================== AVISOS =====================
async function viewAnnouncements(c) {
  const isOwner = ['owner','admin'].includes(state.user.role);
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '💬 Avisos'),
    isOwner && el('div', { class:'topbar-actions' },
      el('button', { class:'btn', onclick: openComposeAnnouncement }, '✏️ Nuevo aviso')
    )
  ));
  const sec = el('div', { class:'detail-section' });
  c.append(sec);
  try {
    const { announcements } = await API.get('/api/announcements');
    if (!announcements || !announcements.length) {
      sec.append(emptyState('📭', isOwner
        ? 'Aún no has enviado avisos. Toca "Nuevo aviso" para escribir uno.'
        : 'Sin avisos por ahora.'));
      return;
    }
    const list = el('div', { class:'list' });
    announcements.forEach(a => {
      // Etiqueta del destinatario
      let badge;
      if (a.target_user_id) {
        badge = el('span', { class:'badge', style:{ background:'#7c3aed', color:'#fff' } },
          '👤 ' + (a.target_name || 'Privado'));
      } else {
        badge = el('span', { class:'badge', style:{ background:'#0ea5e9', color:'#fff' } },
          '📢 ' + (a.house_name || 'Todos'));
      }
      const item = el('div', { class:'list-item' },
        el('div', { style:{ flex:1 } },
          el('div', { class:'name' }, (a.pinned ? '📌 ' : '') + a.title),
          el('div', { style:{ marginTop:'4px', fontSize:'15px', whiteSpace:'pre-wrap' } }, a.body),
          el('div', { class:'meta', style:{ marginTop:'6px' } },
            (a.author_name || '') + ' · ' + fmtDate(a.created_at))
        ),
        el('div', { class:'list-actions' },
          badge,
          (isOwner || a.author_id === state.user.id) &&
            el('button', { class:'btn sm ghost', onclick: async () => {
              if (!confirm('¿Eliminar este aviso?')) return;
              try { await API.del('/api/announcements/' + a.id); toast('Eliminado', 'success'); render(); }
              catch (err) { toast(err.message, 'error'); }
            }}, '🗑️')
        )
      );
      list.append(item);
    });
    sec.append(list);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

// Modal para componer aviso
async function openComposeAnnouncement() {
  const isOwner = ['owner','admin'].includes(state.user.role);
  let houses = [];
  if (isOwner) {
    try { const r = await API.get('/api/houses'); houses = r.houses || []; } catch {}
  }

  // Estado del compositor
  let scope = 'all';        // all | house | user
  let chosenHouse = '';
  let chosenUser = '';

  const houseSelect = el('select', { name:'house_id', onchange: (e) => {
    chosenHouse = e.target.value;
    refreshUsers();
  }},
    el('option', { value:'' }, '— Elige una propiedad —'),
    ...houses.map(h => el('option', { value: h.id }, h.name + ((h.tenants && h.tenants.length) ? ' · ' + h.tenants.length + ' inquilino(s)' : ' · sin inquilino')))
  );

  const userSelect = el('select', { name:'target_user_id', onchange: (e) => { chosenUser = e.target.value; } },
    el('option', { value:'' }, '— Primero elige una propiedad —')
  );

  function refreshUsers() {
    userSelect.innerHTML = '';
    const h = houses.find(x => x.id === chosenHouse);
    const tenants = (h && h.tenants) || [];
    if (!tenants.length) {
      userSelect.append(el('option', { value:'' }, 'Esta propiedad no tiene inquilinos'));
    } else {
      userSelect.append(el('option', { value:'' }, '— Elige inquilino —'));
      tenants.forEach(t => userSelect.append(el('option', { value: t.id }, t.name + ' · ' + t.email)));
    }
  }

  // Tarjetas selector de alcance (solo dueño)
  const scopeCard = (val, icon, label, desc) => el('button', {
    type:'button',
    class:'btn ' + (scope === val ? 'success' : 'ghost'),
    style:{ flex:'1', minWidth:'140px', padding:'14px', textAlign:'left', flexDirection:'column', alignItems:'flex-start' },
    onclick: () => {
      scope = val;
      [...scopeRow.querySelectorAll('button')].forEach(b => b.classList.remove('success'));
      [...scopeRow.querySelectorAll('button')].forEach(b => b.classList.add('ghost'));
      const me = scopeRow.querySelector(`[data-scope="${val}"]`);
      if (me) { me.classList.remove('ghost'); me.classList.add('success'); }
      houseField.style.display = (val === 'house' || val === 'user') ? '' : 'none';
      userField.style.display  = (val === 'user') ? '' : 'none';
    },
    'data-scope': val
  },
    el('div', { style:{ fontSize:'22px' } }, icon),
    el('div', { style:{ fontWeight:'700' } }, label),
    el('div', { style:{ fontSize:'13px', opacity:0.8 } }, desc)
  );

  const scopeRow = el('div', {
    style:{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'14px' }
  });

  if (isOwner) {
    scopeRow.append(
      scopeCard('all',   '📢', 'A todos',         'Todas mis propiedades'),
      scopeCard('house', '🏠', 'Una propiedad',   'Solo esa casa'),
      scopeCard('user',  '👤', 'Persona',         'Un inquilino')
    );
  }

  const houseField = el('div', { class:'field', style:{ display:'none' } },
    el('label', {}, 'Propiedad'), houseSelect);
  const userField = el('div', { class:'field', style:{ display:'none' } },
    el('label', {}, 'Inquilino'), userSelect);

  const m = modal(el('div', {},
    el('h3', {}, '✏️ Nuevo aviso'),
    isOwner && scopeRow,
    isOwner && houseField,
    isOwner && userField,
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        const payload = { title: data.title, body: data.body, pinned: !!data.pinned };
        if (isOwner) {
          payload.scope = scope;
          if (scope === 'house') {
            if (!chosenHouse) return toast('Elige una propiedad', 'error');
            payload.house_id = chosenHouse;
          }
          if (scope === 'user') {
            if (!chosenHouse) return toast('Elige una propiedad', 'error');
            if (!chosenUser) return toast('Elige el inquilino', 'error');
            payload.house_id = chosenHouse;
            payload.target_user_id = chosenUser;
          }
        }
        try {
          const r = await API.post('/api/announcements', payload);
          m.close();
          toast(`Aviso enviado ✅${r.count > 1 ? ' (' + r.count + ' propiedades)' : ''}`, 'success');
          render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('title', 'Título', 'text', true),
        el('div', { class:'field' },
          el('label', {}, 'Mensaje'),
          el('textarea', { name:'body', rows:5, required:true,
            placeholder:'Escribe el mensaje aquí…' })
        ),
        el('label', { style:{ display:'flex', alignItems:'center', gap:'8px', margin:'8px 0 16px' } },
          el('input', { type:'checkbox', name:'pinned', value:'1' }),
          el('span', {}, '📌 Fijar este aviso arriba')
        ),
        el('button', { class:'btn lg block success', type:'submit' }, '📤 Publicar aviso')
      );
      return f;
    })()
  ));
}

// ===================== AJUSTES =====================
function viewSettings(c) {
  c.append(el('div', { class:'topbar' }, el('h1', {}, '⚙️ Ajustes')));
  c.append(el('div', { class:'detail-section' },
    el('h3', {}, '👤 Mi cuenta',
      el('button', {
        class:'btn sm', style:{ marginLeft:'auto' },
        onclick: openEditMyAccount
      }, '✏️ Editar')
    ),
    el('p', {}, el('b', {}, 'Nombre: '), state.user.full_name),
    el('p', {}, el('b', {}, 'Correo: '), state.user.email),
    state.user.phone && el('p', {}, el('b', {}, 'Teléfono: '), state.user.phone),
    el('p', {}, el('b', {}, 'Rol: '), state.user.role),
    el('hr'),
    el('h3', {}, '🎨 Apariencia'),
    el('button', { class:'btn ghost', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
      state.theme==='dark' ? '☀️ Modo claro' : '🌙 Modo oscuro'),
    el('hr'),
    el('button', { class:'btn danger', onclick: logout }, '🚪 Cerrar sesión')
  ));
}

function openEditMyAccount() {
  const u = state.user;
  const m = modal(el('div', {},
    el('h3', {}, '✏️ Editar mi cuenta'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        const payload = {};
        if (data.full_name) payload.full_name = data.full_name;
        if (data.email)     payload.email = data.email;
        if (data.phone !== undefined) payload.phone = data.phone;
        const newPwd = (data.password || '').trim();
        const confirmPwd = (data.password_confirm || '').trim();
        if (newPwd) {
          if (newPwd.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', 'error');
          if (newPwd !== confirmPwd) return toast('Las contraseñas no coinciden', 'error');
          payload.password = newPwd;
        }
        try {
          const r = await API.patch(`/api/users/${u.id}`, payload);
          // Actualizar estado local
          Object.assign(state.user, {
            full_name: r.user.full_name,
            email: r.user.email,
            phone: r.user.phone
          });
          m.close();
          toast('Datos actualizados ✅', 'success');
          render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('full_name', 'Nombre completo', 'text', false, u.full_name || ''),
        field('email', 'Correo', 'email', false, u.email || ''),
        field('phone', 'Teléfono', 'tel', false, u.phone || ''),
        el('hr', { style:{ borderColor:'var(--border)', margin:'12px 0' } }),
        el('p', { style:{ color:'var(--text-muted)', fontSize:'13px', marginBottom:'8px' } },
          'Cambiar contraseña (opcional)'),
        field('password', 'Nueva contraseña (mín 6)', 'password'),
        field('password_confirm', 'Confirmar contraseña', 'password'),
        el('button', { class:'btn lg block', type:'submit' }, '💾 Guardar cambios')
      );
      return f;
    })()
  ));
}

// ===================== ASISTENTE IA =====================
function openAI() {
  const out = el('div', { style:{ minHeight:'80px', padding:'14px', background:'var(--bg)', borderRadius:'12px', marginBottom:'14px', whiteSpace:'pre-wrap' } }, '👋 Hola, ¿en qué te ayudo?');
  const m = modal(el('div', {},
    el('h3', {}, '🤖 Asistente Mi Casa'),
    out,
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const q = $('input', f).value.trim(); if (!q) return;
        out.textContent = '⏳ Pensando...';
        try {
          const { answer } = await API.post('/api/ai', { question: q });
          out.textContent = answer || '(sin respuesta)';
        } catch (err) { out.textContent = err.message; }
      }});
      f.append(
        el('div', { class:'field' },
          el('input', { type:'text', placeholder:'Ej: ¿Cuál apartamento tiene mora?', required:true })
        ),
        el('button', { class:'btn block', type:'submit' }, 'Preguntar')
      );
      return f;
    })()
  ));
}

// ===================== RECIBOS COMPARTIDOS (UTILITY BILLS) =====================
const UTIL_TYPES = [
  { v:'water',       icon:'💧', label:'Agua' },
  { v:'electricity', icon:'💡', label:'Luz' },
  { v:'gas',         icon:'🔥', label:'Gas' },
  { v:'internet',    icon:'🌐', label:'Internet' },
  { v:'tv',          icon:'📺', label:'TV' },
  { v:'admin',       icon:'🏢', label:'Administración' },
  { v:'other',       icon:'🧾', label:'Otro' }
];
const utilMeta = (v) => UTIL_TYPES.find(t => t.v === v) || { icon:'🧾', label: v };

async function viewBills(c) {
  const isOwner = state.user.role !== 'tenant';
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '🧾 Recibos'),
    el('div', { class:'topbar-actions' },
      isOwner && el('button', { class:'btn sm', onclick: openCreateBill }, '+ Nuevo recibo'),
      el('button', { class:'icon-btn', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
        state.theme==='dark'?'☀️':'🌙')
    )
  ));

  const wrap = el('div', { class:'detail-section' });
  c.append(wrap);
  wrap.append(el('div', { class:'spinner' }));

  try {
    const { bills } = await API.get('/api/utility-bills');
    wrap.innerHTML = '';
    if (!bills.length) { wrap.append(emptyState('🧾', 'Aún no hay recibos cargados')); return; }

    bills.forEach(b => {
      const meta = utilMeta(b.type);
      const card = el('div', { class:'list-item', style:{ flexDirection:'column', alignItems:'stretch', gap:'10px' } });
      card.append(el('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
        el('div', { style:{ fontSize:'28px' } }, meta.icon),
        el('div', { style:{ flex:1 } },
          el('div', { class:'name' }, `${meta.label} — ${b.period_month}/${b.period_year}`),
          el('div', { class:'meta' },
            (isOwner ? `Total: ${fmtMoney(b.total_amount)} · ` : '') +
            (b.due_date ? `Vence ${fmtDate(b.due_date)}` : 'Sin fecha'))
        ),
        b.bill_url && el('a', { class:'btn sm ghost', href: b.bill_url, target:'_blank' }, '📎 Ver recibo'),
        isOwner && el('button', { class:'btn sm ghost', onclick: async ()=>{
          if (!confirm('¿Eliminar este recibo?')) return;
          try { await API.del(`/api/utility-bills/${b.id}`); toast('Eliminado','success'); render(); }
          catch(e){ toast(e.message,'error'); }
        }}, '🗑️')
      ));

      const sharesBox = el('div', { style:{ display:'grid', gap:'6px' } });
      (b.shares || []).filter(s => s).forEach(s => {
        sharesBox.append(el('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'8px 10px', background:'var(--bg)', borderRadius:'8px',
                  border:'1px solid var(--border)' }
        },
          el('div', {},
            el('b', {}, '🏠 ' + (s.house_name || '—')),
            el('div', { class:'meta' }, fmtMoney(s.amount)),
            s.reference && el('div', { class:'meta' }, '📌 ' + s.reference),
            s.notes && el('div', { class:'meta' }, '📝 ' + s.notes)
          ),
          el('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } },
            s.receipt_url && el('a', { class:'btn sm ghost', href: s.receipt_url, target:'_blank' }, '📎'),
            el('span', { class:'badge ' + (s.paid ? 'paid' : 'pending') }, s.paid ? 'Pagado' : 'Pendiente'),
            !s.paid && el('button', { class:'btn sm success', onclick:()=> paidShare(s, b) }, '✓ Pagar')
          )
        ));
      });
      card.append(sharesBox);
      if (b.notes) card.append(el('div', { class:'meta' }, '📝 ' + b.notes));
      wrap.append(card);
    });
  } catch (e) {
    wrap.innerHTML = '';
    wrap.append(emptyState('⚠️', e.message));
  }
}

async function openCreateBill() {
  let houses = state.houses;
  if (!houses || !houses.length) {
    try { const r = await API.get('/api/houses'); houses = r.houses; state.houses = houses; }
    catch (e) { return toast(e.message, 'error'); }
  }
  if (!houses.length) return toast('Primero crea propiedades', 'error');

  const now = new Date();
  let split = 'equal';

  // Mapa de checks y filas. La fila muestra monto como TEXTO en equal,
  // o como INPUT en custom. Nunca tocamos otros campos del modal.
  // ✅ Solo se auto-marcan los apartamentos OCUPADOS (los vacantes quedan
  //    desmarcados pero seleccionables) para evitar dividir cuentas a
  //    apartamentos sin inquilino.
  const houseRows = houses.map(h => {
    const occupied = Array.isArray(h.tenants) && h.tenants.length > 0;
    const cb = el('input', { type:'checkbox', value:h.id });
    cb.checked = occupied;
    const amtView = el('div', { style:{ width:'140px', textAlign:'right', fontWeight:'700' } }, '—');
    const amtInput = el('input', { type:'number', step:'0.01', placeholder:'0', style:{ width:'140px' } });
    const slot = el('div', { style:{ width:'140px', display:'flex', justifyContent:'flex-end' } }, amtView);

    const tenantNames = occupied
      ? h.tenants.map(t => t.name).filter(Boolean).join(', ')
      : null;
    const statusBadge = occupied
      ? el('span', { class:'badge', style:{ background:'#16a34a', color:'#fff', marginLeft:'6px' } }, '✓ Ocupado')
      : el('span', { class:'badge', style:{ background:'#94a3b8', color:'#fff', marginLeft:'6px' } }, 'Vacante');

    const row = el('label', {
      style:{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 10px',
              background: occupied ? 'var(--bg)' : 'rgba(148,163,184,0.08)',
              borderRadius:'8px',
              border:'1px solid ' + (occupied ? 'var(--border)' : 'rgba(148,163,184,0.3)'),
              cursor:'pointer',
              opacity: occupied ? '1' : '0.85' }
    },
      cb,
      el('div', { style:{ flex:1 } },
        el('div', {}, el('b', {}, h.name), statusBadge),
        el('div', { class:'meta' }, tenantNames || (h.address || 'Sin inquilino'))
      ),
      slot
    );
    return { house: h, cb, amtView, amtInput, slot, row };
  });

  const splitInfo = el('div', { class:'meta', style:{ marginTop:'4px' } });
  const totalInput = el('input', { name:'total_amount', type:'number', step:'0.01', required:true, placeholder:'0' });

  function getTotal() { return Number(totalInput.value) || 0; }

  function showEqualPreview() {
    const checked = houseRows.filter(r => r.cb.checked);
    const total = getTotal();
    if (!checked.length) { houseRows.forEach(r => r.amtView.textContent = '—'); splitInfo.textContent = 'Selecciona al menos 1 propiedad.'; return; }
    if (!total) { houseRows.forEach(r => r.amtView.textContent = '—'); splitInfo.textContent = 'Ingresa el total para previsualizar.'; return; }
    const per = Math.round((total / checked.length) * 100) / 100;
    checked.forEach((r, i) => {
      const v = (i === checked.length - 1)
        ? Math.round((total - per * (checked.length - 1)) * 100) / 100
        : per;
      r.amtView.textContent = fmtMoney(v);
    });
    houseRows.filter(r => !r.cb.checked).forEach(r => r.amtView.textContent = '—');
    splitInfo.textContent = `División equitativa entre ${checked.length} propiedad${checked.length>1?'es':''}.`;
  }

  function showCustomSum() {
    const sum = houseRows.filter(r => r.cb.checked)
      .reduce((a, r) => a + (Number(r.amtInput.value) || 0), 0);
    splitInfo.textContent = `Suma actual: ${fmtMoney(sum)} / Total: ${fmtMoney(getTotal())}`;
  }

  function applySplitMode() {
    if (split === 'equal') {
      houseRows.forEach(r => {
        r.slot.innerHTML = '';
        r.slot.append(r.amtView);
      });
      showEqualPreview();
    } else {
      houseRows.forEach(r => {
        r.slot.innerHTML = '';
        r.slot.append(r.amtInput);
        r.amtInput.disabled = !r.cb.checked;
      });
      showCustomSum();
    }
  }

  totalInput.addEventListener('input', () => {
    if (split === 'equal') showEqualPreview(); else showCustomSum();
  });
  houseRows.forEach(r => {
    r.cb.addEventListener('change', () => {
      if (split === 'equal') showEqualPreview();
      else { r.amtInput.disabled = !r.cb.checked; showCustomSum(); }
    });
    r.amtInput.addEventListener('input', () => { if (split === 'custom') showCustomSum(); });
  });

  const btnEqual = el('button', { type:'button', class:'btn sm success' }, '⚖️ Dividir igual');
  const btnCustom = el('button', { type:'button', class:'btn sm ghost' }, '✍️ Personalizado');
  btnEqual.addEventListener('click', () => {
    split = 'equal';
    btnEqual.classList.remove('ghost'); btnEqual.classList.add('success');
    btnCustom.classList.remove('success'); btnCustom.classList.add('ghost');
    applySplitMode();
  });
  btnCustom.addEventListener('click', () => {
    split = 'custom';
    btnCustom.classList.remove('ghost'); btnCustom.classList.add('success');
    btnEqual.classList.remove('success'); btnEqual.classList.add('ghost');
    applySplitMode();
  });
  const splitSel = el('div', { style:{ display:'flex', gap:'8px', marginBottom:'8px' } }, btnEqual, btnCustom);

  const typeSel = el('select', { name:'type', required:true });
  UTIL_TYPES.forEach(t => typeSel.append(el('option', { value:t.v }, `${t.icon} ${t.label}`)));

  const f = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const total = Number(data.total_amount);
    const checked = houseRows.filter(r => r.cb.checked);
    if (!checked.length) return toast('Selecciona al menos una propiedad', 'error');

    let shares;
    if (split === 'equal') {
      const per = Math.round((total / checked.length) * 100) / 100;
      shares = checked.map((r, i) => ({
        house_id: r.house.id,
        amount: i === checked.length - 1
          ? Math.round((total - per * (checked.length - 1)) * 100) / 100
          : per
      }));
    } else {
      shares = checked.map(r => ({ house_id: r.house.id, amount: Number(r.amtInput.value) || 0 }));
    }

    try {
      await API.post('/api/utility-bills', {
        type: data.type,
        period_month: Number(data.period_month),
        period_year: Number(data.period_year),
        total_amount: total,
        due_date: data.due_date || null,
        bill_url: data.bill_url || null,
        notes: data.notes || null,
        split,
        shares
      });
      m.close(); toast('Recibo creado ✅', 'success'); render();
    } catch (err) { toast(err.message, 'error'); }
  }});

  f.append(
    el('div', { class:'field' }, el('label', {}, 'Tipo de recibo'), typeSel),
    el('div', { class:'field' }, el('label', {}, 'Total del recibo'), totalInput),
    el('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
      field('period_month', 'Mes',  'number', true, now.getMonth() + 1),
      field('period_year',  'Año',  'number', true, now.getFullYear())
    ),
    field('due_date', 'Fecha de vencimiento', 'date'),
    field('bill_url', 'Enlace al recibo (PDF/imagen) — opcional', 'url'),
    el('div', { class:'field' }, el('label', {}, 'Notas (opcional)'),
      el('textarea', { name:'notes', rows:2 })),

    el('h4', { style:{ marginTop:'14px', marginBottom:'4px' } }, 'Dividir entre propiedades'),
    splitSel,
    el('div', { style:{ display:'grid', gap:'6px', marginBottom:'6px' } }, ...houseRows.map(r => r.row)),
    splitInfo,
    el('button', { class:'btn lg block', type:'submit', style:{ marginTop:'14px' } }, '💾 Crear recibo')
  );

  const m = modal(el('div', {}, el('h3', {}, '🧾 Nuevo recibo'), f));
  applySplitMode();
}

// ===================== CONTRATOS =====================
async function viewContracts(c) {
  const isOwner = state.user.role !== 'tenant';
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '📄 Contratos'),
    el('button', { class:'icon-btn', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
      state.theme==='dark'?'☀️':'🌙')
  ));

  const wrap = el('div', { class:'detail-section' });
  c.append(wrap);
  wrap.append(el('div', { class:'spinner' }));

  try {
    const { contracts } = await API.get('/api/contracts');
    wrap.innerHTML = '';
    if (!contracts.length) {
      wrap.append(emptyState('📄', isOwner ? 'Crea un contrato desde la propiedad' : 'Aún no tienes contrato'));
      return;
    }
    contracts.forEach(ct => wrap.append(renderContractCard(ct)));
  } catch (e) {
    wrap.innerHTML = '';
    wrap.append(emptyState('⚠️', e.message));
  }
}

function renderContractCard(ct) {
  const ownerSigned = !!ct.signature_owner;
  const tenantSigned = !!ct.signature_tenant;
  return el('div', { class:'list-item', style:{ flexDirection:'column', alignItems:'stretch', gap:'8px' } },
    el('div', { style:{ display:'flex', gap:'10px', alignItems:'center' } },
      el('div', { style:{ fontSize:'28px' } }, '📄'),
      el('div', { style:{ flex:1 } },
        el('div', { class:'name' }, `${ct.house_name} — ${ct.tenant_name}`),
        el('div', { class:'meta' },
          `Inicio ${fmtDate(ct.start_date)}${ct.end_date ? ' → ' + fmtDate(ct.end_date) : ''} · ${fmtMoney(ct.monthly_rent)}/mes`)
      ),
      el('span', { class:'badge ' + (ownerSigned && tenantSigned ? 'paid' : 'pending') },
        ownerSigned && tenantSigned ? 'Firmado' : 'Pendiente firma')
    ),
    el('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
      el('span', { class:'badge ' + (ownerSigned ? 'paid' : 'pending') },
        (ownerSigned ? '✅' : '⏳') + ' Dueño'),
      el('span', { class:'badge ' + (tenantSigned ? 'paid' : 'pending') },
        (tenantSigned ? '✅' : '⏳') + ' Inquilino'),
      el('button', { class:'btn sm', onclick: () => openContractView(ct) }, '👁️ Ver / Firmar')
    )
  );
}

async function loadHouseContract(container, house) {
  try {
    const { contracts } = await API.get('/api/contracts');
    const list = contracts.filter(ct => ct.house_id === house.id);
    if (!list.length) { container.append(emptyState('📄', 'Sin contrato. Toca «Editar / Firmar» para crearlo.')); return; }
    list.forEach(ct => container.append(renderContractCard(ct)));
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

async function openContractEditor(house) {
  const tenant = (house.tenants || [])[0];
  if (!tenant) return toast('Primero añade un inquilino', 'error');

  // Buscar contrato existente para esa casa
  let existing = null;
  try {
    const { contracts } = await API.get('/api/contracts');
    existing = contracts.find(ct => ct.house_id === house.id) || null;
  } catch {}

  const placeholder = `CONTRATO DE ARRENDAMIENTO

Entre el ARRENDADOR y el ARRENDATARIO ${tenant.name},
identificado con ${tenant.email}, se celebra el siguiente contrato sobre el inmueble
ubicado en ${house.address || '_____'}.

CLÁUSULAS:
1. CANON: El arrendatario pagará la suma de ${fmtMoney(house.monthly_rent || 0, house.currency)} mensuales.
2. DURACIÓN: ____ meses, contados a partir del ___ de _____ de 20__.
3. DEPÓSITO: ____.
4. SERVICIOS: A cargo del arrendatario (agua, luz, gas, internet salvo pacto en contrario).
5. ...
`;

  const ta = el('textarea', { rows: 14, name:'body_text', style:{ fontFamily:'monospace' } },
    existing?.body_text || placeholder);

  const f = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const extras = {
      grace_days: data.grace_days ? Number(data.grace_days) : undefined,
      late_fee_monthly_rate: data.late_fee_monthly_rate ? Number(data.late_fee_monthly_rate) : undefined,
      guarantor_name: data.guarantor_name || null,
      guarantor_national_id: data.guarantor_national_id || null,
      guarantor_phone: data.guarantor_phone || null,
      guarantor_email: data.guarantor_email || null
    };
    try {
      let contract;
      if (existing) {
        const r = await API.patch(`/api/contracts/${existing.id}`, {
          body_text: data.body_text,
          monthly_rent: data.monthly_rent ? Number(data.monthly_rent) : undefined,
          end_date: data.end_date || null,
          ...extras
        });
        contract = r.contract;
      } else {
        const r = await API.post('/api/contracts', {
          house_id: house.id,
          tenant_id: tenant.id,
          start_date: data.start_date || new Date().toISOString().slice(0,10),
          end_date: data.end_date || null,
          monthly_rent: Number(data.monthly_rent) || Number(house.monthly_rent) || 0,
          deposit: Number(data.deposit) || 0,
          payment_day: Number(data.payment_day) || house.rent_due_day || 5,
          body_text: data.body_text,
          ...extras
        });
        contract = r.contract;
      }
      m.close(); toast('Contrato guardado ✅', 'success');
      openContractView({ ...contract, house_name: house.name, tenant_name: tenant.name });
    } catch (err) { toast(err.message, 'error'); }
  }});

  f.append(
    el('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'10px' } },
      field('start_date', 'Inicio', 'date', !existing, existing?.start_date?.slice(0,10) || ''),
      field('end_date',   'Fin (opcional)', 'date', false, existing?.end_date?.slice(0,10) || ''),
      field('monthly_rent', 'Canon mensual', 'number', false, existing?.monthly_rent || house.monthly_rent || ''),
      field('deposit', 'Depósito', 'number', false, existing?.deposit || ''),
      field('payment_day', 'Día de pago', 'number', false, existing?.payment_day || house.rent_due_day || 5)
    ),
    el('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'10px', marginTop:'8px' } },
      field('grace_days', 'Días de gracia (mora)', 'number', false, existing?.grace_days ?? 3),
      field('late_fee_monthly_rate', 'Interés mensual (ej. 0.02 = 2%)', 'number', false,
        existing?.late_fee_monthly_rate ?? 0.02)
    ),
    el('hr', { style:{ borderColor:'var(--border)', margin:'10px 0' } }),
    el('h4', { style:{ margin:'4px 0' } }, '🤝 Codeudor / Fiador'),
    el('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'10px' } },
      field('guarantor_name', 'Nombre del codeudor', 'text', false, existing?.guarantor_name || ''),
      field('guarantor_national_id', 'Cédula', 'text', false, existing?.guarantor_national_id || ''),
      field('guarantor_phone', 'Teléfono', 'tel', false, existing?.guarantor_phone || ''),
      field('guarantor_email', 'Correo', 'email', false, existing?.guarantor_email || '')
    ),
    el('div', { class:'field' }, el('label', {}, 'Cuerpo del contrato'), ta),
    el('button', { class:'btn lg block', type:'submit' }, '💾 Guardar contrato')
  );

  const m = modal(el('div', {},
    el('h3', {}, existing ? '✏️ Editar contrato' : '📄 Nuevo contrato'),
    el('p', { class:'meta' }, `Inquilino: ${tenant.name}`),
    f
  ));
}

function openContractView(ct) {
  const isOwner = state.user.role !== 'tenant';
  const isTenant = state.user.role === 'tenant' && ct.tenant_id === state.user.id;

  const body = el('pre', {
    style:{ whiteSpace:'pre-wrap', padding:'14px', background:'var(--bg)',
            borderRadius:'10px', maxHeight:'320px', overflow:'auto', fontFamily:'inherit',
            border:'1px solid var(--border)' }
  }, ct.body_text || '(sin cuerpo escrito)');

  const sigBoxes = el('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'12px' } });
  function sigCell(label, dataUrl, signed_at) {
    return el('div', { style:{ padding:'10px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'10px', textAlign:'center' } },
      el('div', { style:{ fontWeight:'700', marginBottom:'6px' } }, label),
      dataUrl
        ? el('img', { src: dataUrl, alt:'firma', style:{ maxHeight:'80px', maxWidth:'100%', background:'#fff', borderRadius:'6px' } })
        : el('div', { class:'meta' }, 'Sin firma'),
      signed_at && el('div', { class:'meta', style:{ marginTop:'4px' } }, fmtDate(signed_at))
    );
  }
  sigBoxes.append(
    sigCell('🖊️ Firma del dueño', ct.signature_owner, ct.signed_owner_at),
    sigCell('🖊️ Firma del inquilino', ct.signature_tenant, ct.signed_tenant_at)
  );

  const canCurrentSign =
    (isTenant && !ct.signature_tenant) ||
    (isOwner  && !ct.signature_owner);

  const actions = el('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'12px' } });
  if (canCurrentSign) {
    actions.append(el('button', { class:'btn success', onclick: () => openSignaturePad(ct) }, '🖊️ Firmar ahora'));
  }
  actions.append(el('button', {
    class:'btn ghost',
    onclick: async () => {
      try { await API.openPdf(`/api/contracts/${ct.id}/pdf`, `contrato-${ct.id}.pdf`); }
      catch (e) { toast(e.message, 'error'); }
    }
  }, '📄 Descargar PDF'));

  modal(el('div', {},
    el('h3', {}, `📄 ${ct.house_name || ''} — ${ct.tenant_name || ''}`),
    el('div', { class:'meta', style:{ marginBottom:'10px' } },
      `Inicio ${fmtDate(ct.start_date)}${ct.end_date ? ' → ' + fmtDate(ct.end_date) : ''} · ${fmtMoney(ct.monthly_rent)}/mes`),
    body,
    sigBoxes,
    actions
  ));
}

function openSignaturePad(ct) {
  const canvas = el('canvas', {
    width: 500, height: 180,
    style:{ width:'100%', maxWidth:'500px', background:'#fff', borderRadius:'10px', border:'1px solid var(--border)', touchAction:'none', cursor:'crosshair' }
  });
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';

  let drawing = false, last = null, hasInk = false;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (canvas.width / r.width),
      y: (t.clientY - r.top)  * (canvas.height / r.height)
    };
  }
  function down(e){ e.preventDefault(); drawing = true; last = pos(e); }
  function move(e){
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; hasInk = true;
  }
  function up(){ drawing = false; }
  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down);
  canvas.addEventListener('touchmove', move);
  window.addEventListener('touchend', up);

  const m = modal(el('div', {},
    el('h3', {}, '🖊️ Firma digital'),
    el('p', { class:'meta' }, 'Firma con el dedo o el ratón dentro del recuadro.'),
    canvas,
    el('div', { style:{ display:'flex', gap:'8px', marginTop:'10px', flexWrap:'wrap' } },
      el('button', { class:'btn ghost', onclick: () => { ctx.clearRect(0,0,canvas.width,canvas.height); hasInk = false; } }, '🧹 Limpiar'),
      el('button', { class:'btn success', onclick: async () => {
        if (!hasInk) return toast('Firma vacía', 'error');
        try {
          const dataUrl = canvas.toDataURL('image/png');
          await API.post(`/api/contracts/${ct.id}/sign`, { signature: dataUrl });
          m.close(); toast('Firmado ✅', 'success'); render();
        } catch (e) { toast(e.message, 'error'); }
      }}, '✅ Confirmar firma')
    )
  ));
}

// ===================== INIT =====================
boot();
})();
