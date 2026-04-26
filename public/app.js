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
          el('button', { class:'btn sm', onclick:()=> remindPayment(p, house) }, '📲 Recordar'),
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
    banner.append(
      el('div', { style:{ textAlign:'center', padding:'20px 8px' } },
        el('div', { style:{ fontSize:'18px', color:'var(--text-muted)', marginBottom:'8px' } },
          isOverdue ? '⚠️ Tienes un pago vencido' : 'Tu próximo pago'),
        el('div', { style:{ fontSize:'56px', fontWeight:'800', color: isOverdue ? 'var(--danger)' : 'var(--primary)', lineHeight:'1.1' } },
          fmtMoney(p.amount, cur)),
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
        el('span', { class:'badge ' + p.status }, p.status),
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

  const m = modal(el('div', {},
    el('h3', {}, '💳 Pagar arriendo'),
    el('div', { style:{ textAlign:'center', padding:'10px 0 20px' } },
      el('div', { style:{ color:'var(--text-muted)' } }, 'Total a pagar'),
      el('div', { style:{ fontSize:'42px', fontWeight:'800', color:'var(--primary)' } }, fmtMoney(p.amount, cur))
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
      const txt = `Hola${h.owner_name ? ' '+h.owner_name.split(' ')[0] : ''}, ya hice la transferencia del arriendo de ${fmtMoney(p.amount, cur)} (${p.period_month}/${p.period_year}). Por favor confírmame cuando te llegue.`;
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
    el('div', { class:'topbar-actions' },
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
