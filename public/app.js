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
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  },
  get(p)     { return this.req(p); },
  post(p, b) { return this.req(p, { method:'POST', body: b }); },
  patch(p,b) { return this.req(p, { method:'PATCH', body: b }); },
  del(p)     { return this.req(p, { method:'DELETE' }); }
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
  } catch {
    API.setToken(null);
  }
  render();
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
        API.setToken(data.token);
        state.user = data.user;
        toast('¡Bienvenido!', 'success');
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

  // Sidebar (desktop)
  const sidebar = el('aside', { class:'sidebar' },
    el('div', { class:'brand' }, el('span', { class:'brand-icon' }, '🏡'), 'Mi Casa'),
    el('nav', { class:'nav' },
      navBtn('home',     '🏠', state.user.role === 'tenant' ? 'Mi Apartamento' : 'Mis Propiedades'),
      navBtn('payments', '💰', 'Pagos'),
      navBtn('damages',  '🛠️', 'Daños'),
      navBtn('messages', '💬', 'Avisos'),
      navBtn('settings', '⚙️', 'Ajustes')
    ),
    el('div', { class:'sidebar-footer' },
      el('button', { class:'nav-btn', onclick: logout }, el('span',{ class:'nav-icon'},'🚪'), 'Cerrar sesión')
    )
  );

  // Mobile header
  const mobHeader = el('header', { class:'mobile-header' },
    el('div', { class:'brand' }, el('span', { class:'brand-icon' }, '🏡'), 'Mi Casa'),
    el('button', { class:'icon-btn', onclick:()=> setTheme(state.theme === 'dark' ? 'light' : 'dark') },
      state.theme === 'dark' ? '☀️' : '🌙')
  );

  // Main
  const main = el('main', { class:'main' });
  main.append(mobHeader);
  renderView(main);

  // Bottom nav (mobile)
  const bottom = el('nav', { class:'bottom-nav' },
    bottomBtn('home', '🏠', 'Inicio'),
    bottomBtn('payments', '💰', 'Pagos'),
    bottomBtn('damages', '🛠️', 'Daños'),
    bottomBtn('messages', '💬', 'Avisos'),
    bottomBtn('settings', '⚙️', 'Ajustes')
  );

  // FAB IA
  const fab = el('button', { class:'fab', title:'Asistente', onclick: openAI }, '🤖');

  layout.append(sidebar, main, bottom, fab);
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
    case 'home':     return state.user.role === 'tenant' ? viewTenantHome(c) : viewProperties(c);
    case 'payments': return viewAllPayments(c);
    case 'damages':  return viewAllDamages(c);
    case 'messages': return viewAnnouncements(c);
    case 'settings': return viewSettings(c);
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
      el('div', {},
        el('div', { class:'name' }, '👤 ' + t.name),
        el('div', { class:'meta' }, t.email + (t.phone ? ' · ' + t.phone : ''))
      )
    )));
    sec1.append(list);
  }
  c.append(sec1);

  // Pagos
  const sec2 = el('div', { class:'detail-section' },
    el('h3', {}, '💰 Pagos', el('button', {
      class:'btn sm', style:{ marginLeft:'auto' },
      onclick: () => openCreatePayment(h)
    }, '+ Cobro'))
  );
  c.append(sec2);
  loadPayments(sec2, h);

  // Daños
  const sec3 = el('div', { class:'detail-section' },
    el('h3', {}, '🛠️ Daños reportados')
  );
  c.append(sec3);
  loadDamages(sec3, h);
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
        el('div', { class:'meta' }, `Vence ${fmtDate(p.due_date)} · ${fmtMoney(p.amount, p.currency)}`)
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + p.status }, p.status),
        p.status !== 'paid' && state.user.role !== 'tenant' &&
          el('button', { class:'btn sm success', onclick:()=> markPaid(p) }, '✓ Pagado'),
        p.status === 'paid' &&
          el('a', { class:'btn sm ghost', href:`/api/payments/${p.id}/receipt.pdf`, target:'_blank' }, '📄 PDF')
      )
    )));
    container.append(list);
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

async function loadDamages(container, house) {
  try {
    const { damages } = await API.get('/api/damages');
    const filtered = (damages || []).filter(d => d.house_id === house.id);
    if (!filtered.length) { container.append(emptyState('✅', 'Sin daños reportados')); return; }
    const list = el('div', { class:'list' });
    filtered.forEach(d => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, '🛠️ ' + d.title),
        el('div', { class:'meta' }, `${d.location || '—'} · ${fmtDate(d.created_at)}`)
      ),
      el('div', { class:'list-actions' },
        el('span', { class:'badge ' + (d.status === 'resolved' ? 'paid' : 'pending') }, d.status)
      )
    )));
    container.append(list);
  } catch (e) { container.append(emptyState('⚠️', e.message)); }
}

// ===================== INVITAR INQUILINO =====================
function openInviteTenant(houseId) {
  const m = modal(el('div', {},
    el('h3', {}, '👤 Añadir inquilino'),
    el('p', { style:{ color:'var(--text-muted)', marginBottom:'16px' } }, 'Le crearemos una cuenta. Comparte estos datos con tu inquilino.'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        try {
          const r = await API.post(`/api/houses/${houseId}/invite-tenant`, data);
          m.close();
          toast('Inquilino añadido ✅', 'success');
          alert(`Comparte estos datos con tu inquilino:\n\nCorreo: ${r.login.email}\nContraseña: ${r.login.password}`);
          render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('full_name', 'Nombre completo', 'text', true),
        field('email', 'Correo del inquilino', 'email', true),
        field('phone', 'Teléfono', 'tel'),
        field('password', 'Contraseña que tendrá (mín 6)', 'text', true),
        el('button', { class:'btn lg block', type:'submit' }, '✅ Crear cuenta del inquilino')
      );
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
        data.contract_id = tenant.id; // simplificado
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
  if (!confirm('¿Marcar este pago como recibido?')) return;
  try {
    await API.patch(`/api/payments/${p.id}/pay`, { method:'transfer', amount_paid: p.amount });
    toast('Pago registrado ✅', 'success');
    state.currentHouseId = null; render();
  } catch (e) { toast(e.message, 'error'); }
}

// ===================== VISTA INQUILINO =====================
async function viewTenantHome(c) {
  c.append(el('div', { class:'topbar' }, el('h1', {}, '🏠 Mi Apartamento')));
  try {
    const { houses } = await API.get('/api/houses');
    if (!houses.length) return c.append(emptyState('🏠', 'No tienes apartamento asignado'));
    state.houses = houses;
    state.currentHouseId = houses[0].id;
    render();
  } catch (e) { c.append(emptyState('⚠️', e.message)); }
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
        el('span', { class:'badge ' + p.status }, p.status),
        p.status !== 'paid' && state.user.role !== 'tenant' &&
          el('button', { class:'btn sm success', onclick:()=> markPaid(p) }, '✓ Pagado')
      )
    )));
    sec.append(list);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

async function viewAllDamages(c) {
  c.append(el('div', { class:'topbar' },
    el('h1', {}, '🛠️ Daños'),
    el('button', { class:'btn', onclick: openReportDamage }, '+ Reportar daño')
  ));
  const sec = el('div', { class:'detail-section' });
  c.append(sec);
  try {
    const { damages } = await API.get('/api/damages');
    if (!damages || !damages.length) return sec.append(emptyState('✅', 'Sin daños reportados'));
    const list = el('div', { class:'list' });
    damages.forEach(d => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, '🛠️ ' + d.title),
        el('div', { class:'meta' }, `${d.location || '—'} · ${fmtDate(d.created_at)}`)
      ),
      el('span', { class:'badge ' + (d.status === 'resolved' ? 'paid' : 'pending') }, d.status)
    )));
    sec.append(list);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

function openReportDamage() {
  const m = modal(el('div', {},
    el('h3', {}, '🛠️ Reportar daño'),
    (() => {
      const f = el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        try {
          await API.post('/api/damages', data);
          m.close(); toast('Daño reportado ✅', 'success'); render();
        } catch (err) { toast(err.message, 'error'); }
      }});
      f.append(
        field('title', 'Título (ej: Fuga en baño)', 'text', true),
        field('location', 'Ubicación (ej: cocina)', 'text'),
        el('div', { class:'field' },
          el('label', {}, 'Descripción'),
          el('textarea', { name:'description', rows:4, placeholder:'Cuéntanos qué pasó...' })
        ),
        el('button', { class:'btn lg block', type:'submit' }, '📤 Enviar reporte')
      );
      return f;
    })()
  ));
}

// ===================== AVISOS =====================
async function viewAnnouncements(c) {
  c.append(el('div', { class:'topbar' }, el('h1', {}, '💬 Avisos')));
  const sec = el('div', { class:'detail-section' });
  c.append(sec);
  try {
    const { announcements } = await API.get('/api/announcements');
    if (!announcements || !announcements.length) return sec.append(emptyState('📭', 'Sin avisos'));
    const list = el('div', { class:'list' });
    announcements.forEach(a => list.append(el('div', { class:'list-item' },
      el('div', {},
        el('div', { class:'name' }, a.title),
        el('div', { class:'meta' }, (a.author_name || '') + ' · ' + fmtDate(a.created_at))
      )
    )));
    sec.append(list);
  } catch (e) { sec.append(emptyState('⚠️', e.message)); }
}

// ===================== AJUSTES =====================
function viewSettings(c) {
  c.append(el('div', { class:'topbar' }, el('h1', {}, '⚙️ Ajustes')));
  c.append(el('div', { class:'detail-section' },
    el('h3', {}, '👤 Mi cuenta'),
    el('p', {}, el('b', {}, 'Nombre: '), state.user.full_name),
    el('p', {}, el('b', {}, 'Correo: '), state.user.email),
    el('p', {}, el('b', {}, 'Rol: '), state.user.role),
    el('hr'),
    el('h3', {}, '🎨 Apariencia'),
    el('button', { class:'btn ghost', onclick:()=> setTheme(state.theme==='dark'?'light':'dark') },
      state.theme==='dark' ? '☀️ Modo claro' : '🌙 Modo oscuro'),
    el('hr'),
    el('button', { class:'btn danger', onclick: logout }, '🚪 Cerrar sesión')
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

// ===================== INIT =====================
boot();
})();
