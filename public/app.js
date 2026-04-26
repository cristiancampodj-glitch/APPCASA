/* Casa SaaS v3 — Frontend SPA (vanilla JS, sin frameworks) */
(() => {
'use strict';

// ============= API CLIENT =============
const API = {
  base: '',
  token: () => localStorage.getItem('token'),
  setToken(t) { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); },
  user: () => JSON.parse(localStorage.getItem('user') || 'null'),
  setUser(u) { u ? localStorage.setItem('user', JSON.stringify(u)) : localStorage.removeItem('user'); },
  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = this.token();
    if (t) headers.Authorization = `Bearer ${t}`;
    const r = await fetch(this.base + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data; try { data = await r.json(); } catch { data = {}; }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  },
  get(p)        { return this.req(p); },
  post(p, b)    { return this.req(p, { method: 'POST', body: b }); },
  patch(p, b)   { return this.req(p, { method: 'PATCH', body: b }); },
  del(p)        { return this.req(p, { method: 'DELETE' }); }
};

// ============= I18N =============
const I18N = {
  locale: localStorage.getItem('locale') || 'es',
  dict: {
    es: {
      dashboard: 'Inicio', payments: 'Pagos', damages: 'Daños', pqrs: 'PQRS',
      chores: 'Turnos', announcements: 'Anuncios', expenses: 'Gastos',
      bookings: 'Reservas', polls: 'Votaciones', inventory: 'Inventario',
      messages: 'Chat', users: 'Personas', settings: 'Ajustes', logout: 'Cerrar sesión',
      welcome: 'Bienvenido', login: 'Iniciar sesión', register: 'Registrarse',
      email: 'Correo', password: 'Contraseña', name: 'Nombre completo',
      house_name: 'Nombre de la casa/inmueble', phone: 'Teléfono',
      add: 'Añadir', save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar',
      pay: 'Pagar', mark_paid: 'Marcar pagado', view_receipt: 'Ver recibo',
      no_data: 'No hay datos por ahora.',
      ai_placeholder: 'Pregúntame algo (ej: ¿cuánto debo este mes?)'
    },
    en: {
      dashboard: 'Home', payments: 'Payments', damages: 'Damages', pqrs: 'Tickets',
      chores: 'Chores', announcements: 'Announcements', expenses: 'Expenses',
      bookings: 'Bookings', polls: 'Polls', inventory: 'Inventory',
      messages: 'Chat', users: 'People', settings: 'Settings', logout: 'Sign out',
      welcome: 'Welcome', login: 'Sign in', register: 'Sign up',
      email: 'Email', password: 'Password', name: 'Full name',
      house_name: 'House / property name', phone: 'Phone',
      add: 'Add', save: 'Save', cancel: 'Cancel', delete: 'Delete',
      pay: 'Pay', mark_paid: 'Mark as paid', view_receipt: 'View receipt',
      no_data: 'No data yet.',
      ai_placeholder: 'Ask me anything (e.g. how much do I owe?)'
    }
  },
  t(k) { return this.dict[this.locale]?.[k] || k; },
  set(loc) { this.locale = loc; localStorage.setItem('locale', loc); render(); }
};
const t = (k) => I18N.t(k);

// ============= UI HELPERS =============
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};

function toast(msg, type = '') {
  const t = el('div', { class: `toast ${type}` }, msg);
  $('#toast-host').append(t);
  setTimeout(() => t.remove(), 3500);
}

function modal(content) {
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } });
  const m = el('div', { class: 'modal' }, content);
  back.append(m); document.body.append(back);
  return { close: () => back.remove() };
}

function fmtMoney(n, currency) {
  const cur = (currency || state.house?.currency || 'COP').toUpperCase();
  const meta = {
    COP: { locale: 'es-CO', dec: 0 },
    EUR: { locale: 'es-ES', dec: 2 },
    USD: { locale: 'en-US', dec: 2 },
    MXN: { locale: 'es-MX', dec: 2 }
  }[cur] || { locale: 'es-CO', dec: 2 };
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency', currency: cur,
      minimumFractionDigits: meta.dec, maximumFractionDigits: meta.dec
    }).format(Number(n) || 0);
  } catch {
    return cur + ' ' + (Number(n) || 0).toLocaleString(meta.locale);
  }
}
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' });
}
function currencyOptions() {
  const list = state.currencies?.length ? state.currencies : [
    { code: 'COP', name: 'Peso Colombiano', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'Dólar', symbol: 'US$' },
    { code: 'MXN', name: 'Peso Mexicano', symbol: '$' }
  ];
  const houseCur = state.house?.currency || 'COP';
  // pone la moneda de la casa primero
  return list
    .slice()
    .sort((a, b) => (a.code === houseCur ? -1 : b.code === houseCur ? 1 : 0))
    .map(c => ({ value: c.code, label: `${c.symbol} ${c.code} — ${c.name}` }));
}

// ============= STATE =============
const state = {
  view: 'dashboard',
  user: null,
  house: null,
  currencies: [],
  theme: localStorage.getItem('theme') || 'light',
};

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}
setTheme(state.theme);

// ============= ROUTES (views) =============
const VIEWS = {
  dashboard:    { icon: '📊', render: viewDashboard },
  payments:     { icon: '💰', render: viewPayments },
  damages:      { icon: '🛠️', render: viewDamages },
  pqrs:         { icon: '📩', render: viewPqrs },
  chores:       { icon: '🧹', render: viewChores },
  announcements:{ icon: '📢', render: viewAnnouncements },
  expenses:     { icon: '🧾', render: viewExpenses },
  bookings:     { icon: '📅', render: viewBookings },
  polls:        { icon: '🗳️', render: viewPolls },
  inventory:    { icon: '📦', render: viewInventory },
  messages:     { icon: '💬', render: viewMessages },
  users:        { icon: '👥', render: viewUsers },
  settings:     { icon: '⚙️', render: viewSettings }
};

// ============= APP RENDER =============
async function boot() {
  // Cargar lista de monedas (público)
  try { state.currencies = await API.get('/api/currencies'); } catch { state.currencies = []; }
  const tk = API.token();
  if (!tk) return render();
  try {
    const { user } = await API.get('/api/auth/me');
    state.user = user;
    if (user.theme) setTheme(user.theme);
    if (user.locale) I18N.locale = user.locale;
    try {
      const { house } = await API.get('/api/houses/mine');
      state.house = house;
    } catch {}
  } catch { API.setToken(null); }
  render();
}

function render() {
  const root = $('#app');
  root.innerHTML = '';
  if (!state.user) return root.append(renderAuth());
  root.append(renderLayout());
}

// ============= AUTH VIEW =============
function renderAuth() {
  let mode = 'login';
  const wrap = el('div', { class: 'auth' });
  const card = el('div', { class: 'auth-card' });

  function paint() {
    card.innerHTML = '';
    card.append(
      el('h1', {}, '🏡 Casa SaaS'),
      el('div', { class: 'sub' }, mode === 'login' ? 'Inicia sesión en tu casa' : 'Crea tu cuenta'),
      el('div', { class: 'auth-tabs' },
        el('button', { class: mode === 'login' ? 'active' : '', onclick: () => { mode='login'; paint(); } }, 'Iniciar sesión'),
        el('button', { class: mode === 'register' ? 'active' : '', onclick: () => { mode='register'; paint(); } }, 'Registrarse')
      )
    );

    const form = el('form', { onsubmit: async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      try {
        const data = await API.post('/api/auth/' + mode, fd);
        API.setToken(data.token); API.setUser(data.user);
        state.user = data.user;
        try { state.house = (await API.get('/api/houses/mine')).house; } catch {}
        render();
        toast('¡Bienvenido!', 'success');
      } catch (err) { toast(err.message, 'error'); }
    }});

    if (mode === 'register') {
      form.append(field('full_name', t('name'), 'text', true));
      form.append(field('house_name', t('house_name') + ' (opcional, si eres dueño)', 'text', false));
      form.append(field('phone', t('phone'), 'tel', false));
      // Selector de moneda
      const curOpts = (state.currencies.length ? state.currencies : [
        { code: 'COP', name: 'Peso Colombiano', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'USD', name: 'Dólar', symbol: 'US$' }
      ]);
      const sel = el('select', { name: 'currency' });
      curOpts.forEach(c => sel.append(el('option', { value: c.code }, `${c.symbol} ${c.code} — ${c.name}`)));
      form.append(el('div', { class: 'field' },
        el('label', {}, 'Moneda principal'), sel
      ));
    }
    form.append(field('email', t('email'), 'email', true));
    form.append(field('password', t('password'), 'password', true));
    form.append(el('button', { class: 'btn', style: { width: '100%', marginTop: '8px' } }, mode === 'login' ? t('login') : t('register')));

    card.append(form);
  }
  paint();
  wrap.append(card);
  return wrap;
}

function field(name, label, type = 'text', required = false) {
  return el('div', { class: 'field' },
    el('label', {}, label),
    el('input', { name, type, required, autocomplete: type === 'password' ? 'current-password' : 'on' })
  );
}

// ============= LAYOUT =============
function renderLayout() {
  const wrap = el('div', { class: 'layout' });

  const navItems = Object.entries(VIEWS).map(([k, v]) =>
    el('button', {
      class: state.view === k ? 'active' : '',
      onclick: () => { state.view = k; render(); }
    }, el('span', { class: 'nav-icon' }, v.icon), t(k))
  );

  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'brand' }, el('span', { class: 'brand-icon' }, '🏡'), 'Casa SaaS'),
    el('nav', { class: 'nav' }, ...navItems),
    el('div', { class: 'sidebar-footer' },
      el('div', { style: { padding: '8px 10px', fontSize: '13px', color: 'var(--text-muted)' } },
        '👤 ', state.user.full_name, el('br'),
        el('span', { style: { fontSize: '11px' } }, state.user.role.toUpperCase())
      ),
      el('button', { class: 'btn ghost', style: { width: '100%' }, onclick: logout }, t('logout'))
    )
  );

  // Mobile header
  const mobileHeader = el('header', { class: 'mobile-header' },
    el('div', { style: { fontWeight: '800' } }, '🏡 ', t(state.view)),
    el('button', { class: 'btn icon ghost', onclick: openSettings }, '⚙️')
  );

  // Mobile bottom bar (5 principales)
  const mobileItems = ['dashboard','payments','chores','announcements','settings'];
  const mobileBar = el('nav', { class: 'mobile-bar' },
    ...mobileItems.map(k => el('button', {
      class: state.view === k ? 'active' : '',
      onclick: () => { state.view = k; render(); }
    }, el('span', { class: 'nav-icon' }, VIEWS[k].icon), t(k)))
  );

  const main = el('main', { class: 'main' });
  main.append(mobileHeader);
  const topbar = el('div', { class: 'topbar' },
    el('h2', {}, t(state.view)),
    el('div', { class: 'topbar-actions' },
      el('button', { class: 'btn icon ghost', onclick: () => setTheme(state.theme === 'dark' ? 'light' : 'dark') },
        state.theme === 'dark' ? '☀️' : '🌙')
    )
  );
  main.append(topbar);

  const container = el('div');
  main.append(container);

  // AI fab
  main.append(el('button', { class: 'ai-fab', onclick: openAi, title: 'Asistente IA' }, '🤖'));

  Promise.resolve(VIEWS[state.view].render(container)).catch(err => {
    container.append(el('div', { class: 'empty' }, '⚠️ ', err.message));
  });

  wrap.append(sidebar, main, mobileBar);
  return wrap;
}

function logout() { API.setToken(null); API.setUser(null); state.user = null; render(); }

// ============= VIEW: DASHBOARD =============
async function viewDashboard(c) {
  c.append(el('div', { class: 'kpi-grid', id: 'kpis' }, skeleton(4)));
  const data = await API.get('/api/dashboard');
  const k = data.kpis;
  const cur = data.currency;
  $('#kpis', c).replaceWith(el('div', { class: 'kpi-grid' },
    kpiCard('Ingresos año', fmtMoney(k.income_year, cur), 'success'),
    kpiCard('Mora total', fmtMoney(k.overdue_amount, cur), 'danger', `${k.overdue_count} pagos vencidos`),
    kpiCard('Gastos mes', fmtMoney(k.expenses_month, cur), 'warning'),
    kpiCard('Ocupantes', k.occupants, ''),
    kpiCard('Daños activos', k.active_damages, k.active_damages > 0 ? 'warning' : ''),
    kpiCard('Turnos pendientes', k.pending_chores, '')
  ));

  // Gráfica
  const chartCard = el('div', { class: 'card', style: { marginTop: '20px' } },
    el('h3', { class: 'card-title' }, 'Ingresos vs Gastos (12 meses)'),
    el('canvas', { id: 'chart-monthly', height: 80 })
  );
  c.append(chartCard);
  const ctx = $('#chart-monthly', c).getContext('2d');
  if (window.Chart) new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.monthly.map(m => m.month),
      datasets: [
        { label: 'Ingresos', data: data.monthly.map(m => m.income),  backgroundColor: '#16a34a' },
        { label: 'Gastos',   data: data.monthly.map(m => m.expense), backgroundColor: '#f59e0b' }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function kpiCard(label, value, type = '', delta = '') {
  return el('div', { class: 'kpi ' + type },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, String(value)),
    delta && el('div', { class: 'delta', style: { color: 'var(--text-muted)' } }, delta)
  );
}

function skeleton(n) { return Array.from({ length: n }, () => el('div', { class: 'kpi' }, el('div', { class: 'skel', style: { width: '60%' } }), el('div', { class: 'skel', style: { width: '80%', height: '24px', marginTop: '10px' } }))); }

// ============= VIEW: PAYMENTS =============
async function viewPayments(c) {
  if (state.user.role !== 'tenant') {
    c.append(el('button', { class: 'btn', onclick: openCreatePayment }, '+ Generar cobro'));
  }
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  c.append(list);
  const { payments } = await API.get('/api/payments');
  if (!payments.length) return list.append(emptyState('💰', 'No hay pagos registrados'));
  payments.forEach(p => {
    const status = p.status === 'paid' ? 'paid' : (p.status === 'overdue' ? 'overdue' : 'pending');
    const item = el('div', { class: 'list-item' },
      el('div', {},
        el('div', { style: { fontWeight: 600 } }, `Arriendo ${p.period_month}/${p.period_year} — ${p.tenant_name || ''}`),
        el('div', { class: 'meta' }, `Vence ${fmtDate(p.due_date)} · ${fmtMoney(p.amount, p.currency)}`)
      ),
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        el('span', { class: 'badge ' + status }, p.status),
        p.status !== 'paid' && state.user.role === 'tenant' && el('button', { class: 'btn sm', onclick: () => payOnline(p) }, '💳 Pagar'),
        p.status !== 'paid' && state.user.role !== 'tenant' && el('button', { class: 'btn sm success', onclick: () => markPaid(p) }, '✓ Pagado'),
        p.status === 'paid' && el('a', { class: 'btn sm ghost', href: `/api/payments/${p.id}/receipt.pdf`, target: '_blank' }, '📄 PDF')
      )
    );
    list.append(item);
  });
}

function openCreatePayment() {
  const m = modal(el('div', {},
    el('h3', {}, 'Generar cobro de arriendo'),
    formBuilder([
      { name: 'tenant_id', label: 'ID inquilino', type: 'text', required: true },
      { name: 'contract_id', label: 'ID contrato', type: 'text', required: true },
      { name: 'period_month', label: 'Mes', type: 'number', required: true },
      { name: 'period_year', label: 'Año', type: 'number', required: true },
      { name: 'amount', label: 'Monto', type: 'number', required: true },
      { name: 'currency', label: 'Moneda', type: 'select', options: currencyOptions(), required: true },
      { name: 'due_date', label: 'Vencimiento', type: 'date', required: true }
    ], async (data) => {
      await API.post('/api/payments', data);
      m.close(); render(); toast('Cobro creado', 'success');
    })
  ));
}

async function payOnline(p) {
  try {
    const { checkout_url } = await API.post(`/api/payments/${p.id}/checkout`);
    window.open(checkout_url, '_blank');
  } catch (e) { toast(e.message, 'error'); }
}
async function markPaid(p) {
  const ref = prompt('Referencia/comprobante (opcional):') || '';
  await API.patch(`/api/payments/${p.id}/pay`, { method: 'transfer', amount_paid: p.amount, reference: ref });
  toast('Pago registrado', 'success'); render();
}

// ============= VIEW: DAMAGES =============
async function viewDamages(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('Reportar daño', '/api/damages', [
    { name: 'title', label: 'Título', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea', required: true },
    { name: 'location', label: 'Ubicación' },
    { name: 'priority', label: 'Prioridad', type: 'select', options: ['low','medium','high','urgent'] },
    { name: 'estimated_cost', label: 'Costo estimado', type: 'number' }
  ]) }, '+ Reportar daño'));
  const { damages } = await API.get('/api/damages');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!damages.length) list.append(emptyState('🛠️', 'Sin daños reportados'));
  damages.forEach(d => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, d.title),
      el('div', { class: 'meta' }, `${d.location || '—'} · Reportado por ${d.reporter_name} · ${fmtDate(d.created_at)}`)
    ),
    el('div', { style: { display: 'flex', gap: '8px' } },
      el('span', { class: 'badge ' + d.priority }, d.priority),
      el('span', { class: 'badge ' + (d.status === 'resolved' ? 'paid' : 'pending') }, d.status)
    )
  )));
  c.append(list);
}

// ============= VIEW: PQRS =============
async function viewPqrs(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('Nueva PQRS', '/api/pqrs', [
    { name: 'type', label: 'Tipo', type: 'select', options: ['peticion','queja','reclamo','sugerencia','felicitacion'] },
    { name: 'subject', label: 'Asunto', required: true },
    { name: 'body', label: 'Detalle', type: 'textarea', required: true },
    { name: 'is_anonymous', label: 'Anónimo', type: 'checkbox' }
  ]) }, '+ Nueva PQRS'));
  const { pqrs } = await API.get('/api/pqrs');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!pqrs.length) list.append(emptyState('📩', 'Sin PQRS'));
  pqrs.forEach(p => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, p.subject),
      el('div', { class: 'meta' }, `${p.type} · ${p.author_name} · ${fmtDate(p.created_at)}`)
    ),
    el('span', { class: 'badge ' + (p.status === 'answered' ? 'paid' : 'pending') }, p.status)
  )));
  c.append(list);
}

// ============= VIEW: CHORES =============
async function viewChores(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('Nuevo turno', '/api/chores', [
    { name: 'type', label: 'Tipo', type: 'select', options: ['cleaning','trash','gas_purchase','cooking','laundry','other'] },
    { name: 'title', label: 'Título', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'due_date', label: 'Fecha', type: 'date', required: true }
  ]) }, '+ Asignar turno'));
  const { chores } = await API.get('/api/chores');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!chores.length) list.append(emptyState('🧹', 'Sin turnos'));
  chores.forEach(ch => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, ch.title),
      el('div', { class: 'meta' }, `${ch.assignee_name || 'Sin asignar'} · ${fmtDate(ch.due_date)}`)
    ),
    ch.status === 'pending' ?
      el('button', { class: 'btn sm success', onclick: async () => { await API.patch(`/api/chores/${ch.id}/complete`); render(); } }, '✓ Hecho') :
      el('span', { class: 'badge paid' }, 'Hecho')
  )));
  c.append(list);
}

// ============= VIEW: ANNOUNCEMENTS =============
async function viewAnnouncements(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('Nuevo anuncio', '/api/announcements', [
    { name: 'title', label: 'Título', required: true },
    { name: 'body', label: 'Contenido', type: 'textarea', required: true },
    { name: 'pinned', label: 'Fijar', type: 'checkbox' }
  ]) }, '+ Anuncio'));
  const { announcements } = await API.get('/api/announcements');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!announcements.length) list.append(emptyState('📢', 'Sin anuncios'));
  announcements.forEach(a => list.append(el('div', { class: 'card', style: { marginBottom: '10px' } },
    a.pinned && el('span', { class: 'badge', style: { background: 'rgba(245,158,11,.15)', color: 'var(--warning)' } }, '📌 Fijado'),
    el('h4', { style: { margin: '6px 0' } }, a.title),
    el('div', { class: 'meta', style: { color: 'var(--text-muted)', fontSize: '13px' } }, `${a.author_name} · ${fmtDate(a.created_at)}`),
    el('p', { style: { whiteSpace: 'pre-wrap' } }, a.body),
    el('div', { style: { display: 'flex', gap: '12px' } },
      el('button', { class: 'btn sm ghost', onclick: async () => {
        a.liked ? await API.del(`/api/announcements/${a.id}/like`) : await API.post(`/api/announcements/${a.id}/like`);
        render();
      } }, `${a.liked ? '❤️' : '🤍'} ${a.likes || 0}`),
      el('span', { style: { color: 'var(--text-muted)', fontSize: '13px', alignSelf: 'center' } }, `💬 ${a.comments || 0}`)
    )
  )));
  c.append(list);
}

// ============= VIEW: EXPENSES =============
async function viewExpenses(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('Nuevo gasto', '/api/expenses', [
    { name: 'title', label: 'Título', required: true },
    { name: 'amount', label: 'Monto', type: 'number', required: true },
    { name: 'currency', label: 'Moneda', type: 'select', options: currencyOptions(), required: true },
    { name: 'category', label: 'Categoría' },
    { name: 'expense_date', label: 'Fecha', type: 'date' }
  ]) }, '+ Gasto'));
  const { expenses } = await API.get('/api/expenses');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!expenses.length) list.append(emptyState('🧾', 'Sin gastos'));
  expenses.forEach(e => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, e.title),
      el('div', { class: 'meta' }, `${e.payer_name} · ${e.category || ''} · ${fmtDate(e.expense_date)}`)
    ),
    el('div', { style: { fontWeight: 700 } }, fmtMoney(e.amount, e.currency))
  )));
  c.append(list);
}

// ============= VIEW: BOOKINGS =============
async function viewBookings(c) {
  const { areas } = await API.get('/api/bookings/areas');
  c.append(
    el('div', { style: { display: 'flex', gap: '8px', marginBottom: '14px' } },
      el('button', { class: 'btn', onclick: () => crudModal('Reservar', '/api/bookings', [
        { name: 'area_id', label: 'Área', type: 'select', options: areas.map(a => ({ value: a.id, label: a.name })) },
        { name: 'start_at', label: 'Inicio', type: 'datetime-local', required: true },
        { name: 'end_at', label: 'Fin', type: 'datetime-local', required: true },
        { name: 'notes', label: 'Notas' }
      ]) }, '+ Reserva'),
      state.user.role !== 'tenant' && el('button', { class: 'btn ghost', onclick: () => crudModal('Nueva área común', '/api/bookings/areas', [
        { name: 'name', label: 'Nombre', required: true },
        { name: 'description', label: 'Descripción' },
        { name: 'capacity', label: 'Capacidad', type: 'number' }
      ]) }, '+ Área común')
    )
  );
  const { bookings } = await API.get('/api/bookings');
  const list = el('div', { class: 'list' });
  if (!bookings.length) list.append(emptyState('📅', 'Sin reservas'));
  bookings.forEach(b => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, `${b.area_name} — ${b.user_name}`),
      el('div', { class: 'meta' }, `${fmtDate(b.start_at)} → ${fmtDate(b.end_at)}`)
    ),
    el('span', { class: 'badge ' + (b.status === 'confirmed' ? 'paid' : 'pending') }, b.status)
  )));
  c.append(list);
}

// ============= VIEW: POLLS =============
async function viewPolls(c) {
  c.append(el('button', { class: 'btn', onclick: () => {
    const m = modal(el('div', {},
      el('h3', {}, 'Nueva votación'),
      formBuilder([
        { name: 'question', label: 'Pregunta', required: true },
        { name: 'description', label: 'Descripción', type: 'textarea' },
        { name: 'options', label: 'Opciones (separadas por coma)', required: true },
        { name: 'is_anonymous', label: 'Anónima', type: 'checkbox' }
      ], async (data) => {
        data.options = data.options.split(',').map(s => s.trim()).filter(Boolean);
        await API.post('/api/polls', data); m.close(); render(); toast('Creada', 'success');
      })
    ));
  } }, '+ Votación'));
  const { polls } = await API.get('/api/polls');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!polls.length) list.append(emptyState('🗳️', 'Sin votaciones'));
  polls.forEach(p => {
    const total = p.options?.reduce((s, o) => s + Number(o.votes), 0) || 0;
    list.append(el('div', { class: 'card' },
      el('h4', {}, p.question),
      p.description && el('div', { class: 'meta' }, p.description),
      el('div', { style: { marginTop: '12px' } },
        ...(p.options || []).map(o => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          return el('div', { style: { marginBottom: '8px', cursor: 'pointer' }, onclick: async () => {
            if (p.status === 'open') { await API.post(`/api/polls/${p.id}/vote`, { option_id: o.id }); render(); }
          } },
            el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              el('span', {}, (p.my_vote === o.id ? '✓ ' : '') + o.label),
              el('span', { style: { color: 'var(--text-muted)' } }, `${o.votes} (${pct}%)`)
            ),
            el('div', { style: { background: 'var(--surface-2)', height: '6px', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' } },
              el('div', { style: { width: pct + '%', height: '100%', background: 'var(--primary)' } })
            )
          );
        })
      )
    ));
  });
  c.append(list);
}

// ============= VIEW: INVENTORY =============
async function viewInventory(c) {
  c.append(el('button', { class: 'btn', onclick: () => crudModal('+ Item', '/api/inventory', [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'quantity', label: 'Cantidad', type: 'number' },
    { name: 'unit', label: 'Unidad' },
    { name: 'min_stock', label: 'Stock mínimo', type: 'number' }
  ]) }, '+ Item'));
  const { items } = await API.get('/api/inventory');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  if (!items.length) list.append(emptyState('📦', 'Inventario vacío'));
  items.forEach(i => list.append(el('div', { class: 'list-item' },
    el('div', {}, el('div', { style: { fontWeight: 600 } }, i.name),
      el('div', { class: 'meta' }, `${i.quantity} ${i.unit} · mín ${i.min_stock}`)),
    Number(i.quantity) <= Number(i.min_stock) && el('span', { class: 'badge overdue' }, 'Reponer')
  )));
  c.append(list);
}

// ============= VIEW: MESSAGES =============
async function viewMessages(c) {
  const { messages } = await API.get('/api/messages');
  const box = el('div', { class: 'card', style: { maxHeight: '60vh', overflowY: 'auto' } });
  messages.slice().reverse().forEach(m => box.append(el('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--border)' } },
    el('div', { style: { fontWeight: 600 } }, m.from_name),
    el('div', {}, m.body),
    el('div', { class: 'meta' }, fmtDate(m.created_at))
  )));
  c.append(box);
  const f = el('form', { style: { display: 'flex', gap: '8px', marginTop: '12px' }, onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    await API.post('/api/messages', { body: fd.get('body') });
    f.reset(); render();
  } },
    el('input', { name: 'body', placeholder: 'Escribe a la casa...', required: true }),
    el('button', { class: 'btn' }, 'Enviar'));
  c.append(f);
}

// ============= VIEW: USERS =============
async function viewUsers(c) {
  if (state.user.role !== 'tenant') {
    c.append(el('button', { class: 'btn', onclick: () => crudModal('+ Persona', '/api/users', [
      { name: 'full_name', label: 'Nombre', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Teléfono' },
      { name: 'password', label: 'Contraseña inicial', type: 'password' },
      { name: 'role', label: 'Rol', type: 'select', options: ['tenant','owner','admin'] }
    ]) }, '+ Persona'));
  }
  const { users } = await API.get('/api/users');
  const list = el('div', { class: 'list', style: { marginTop: '14px' } });
  users.forEach(u => list.append(el('div', { class: 'list-item' },
    el('div', {},
      el('div', { style: { fontWeight: 600 } }, u.full_name),
      el('div', { class: 'meta' }, `${u.email} · ${u.role}`)
    ),
    el('span', { class: 'badge ' + (u.is_active ? 'paid' : 'overdue') }, u.is_active ? 'Activo' : 'Inactivo')
  )));
  c.append(list);
}

// ============= VIEW: SETTINGS =============
function viewSettings(c) {
  c.append(el('div', { class: 'card' },
    el('h3', {}, 'Apariencia'),
    el('div', { style: { display: 'flex', gap: '8px', marginBottom: '20px' } },
      el('button', { class: 'btn ghost', onclick: () => setTheme('light') }, '☀️ Claro'),
      el('button', { class: 'btn ghost', onclick: () => setTheme('dark') }, '🌙 Oscuro')
    ),
    el('h3', {}, 'Idioma'),
    el('div', { style: { display: 'flex', gap: '8px' } },
      el('button', { class: 'btn ghost', onclick: () => I18N.set('es') }, '🇪🇸 Español'),
      el('button', { class: 'btn ghost', onclick: () => I18N.set('en') }, '🇺🇸 English')
    ),
    el('h3', { style: { marginTop: '24px' } }, 'Cuenta'),
    el('div', { class: 'meta' }, state.user.email, ' · ', state.user.role),
    el('button', { class: 'btn danger', style: { marginTop: '14px' }, onclick: logout }, 'Cerrar sesión')
  ));
}
function openSettings() { state.view = 'settings'; render(); }

// ============= AI MODAL =============
function openAi() {
  const m = modal(el('div', {},
    el('h3', {}, '🤖 Asistente Casa'),
    el('div', { id: 'ai-output', style: { minHeight: '60px', padding: '12px', background: 'var(--surface-2)', borderRadius: '10px', marginBottom: '12px' } }, '¿En qué te ayudo?'),
    el('form', { onsubmit: async (e) => {
      e.preventDefault();
      const inp = e.target.elements.q;
      const out = $('#ai-output');
      out.textContent = 'Pensando...';
      try {
        const r = await API.post('/api/ai/ask', { prompt: inp.value });
        out.textContent = r.answer;
      } catch (err) { out.textContent = '⚠️ ' + err.message; }
    } },
      el('div', { style: { display: 'flex', gap: '8px' } },
        el('input', { name: 'q', placeholder: t('ai_placeholder'), required: true }),
        el('button', { class: 'btn' }, 'Enviar')
      )
    )
  ));
}

// ============= UTILS =============
function emptyState(emoji, msg) {
  return el('div', { class: 'empty' }, el('div', { class: 'emoji' }, emoji), el('div', {}, msg));
}

function formBuilder(fields, onSubmit) {
  const f = el('form', { onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const data = {};
    for (const [k, v] of fd.entries()) {
      const def = fields.find(x => x.name === k);
      if (def?.type === 'checkbox') data[k] = true;
      else if (def?.type === 'number') data[k] = v ? Number(v) : null;
      else data[k] = v;
    }
    fields.filter(x => x.type === 'checkbox' && !data[x.name]).forEach(x => data[x.name] = false);
    try { await onSubmit(data); } catch (err) { toast(err.message, 'error'); }
  }});
  fields.forEach(fd => {
    let input;
    if (fd.type === 'textarea') {
      input = el('textarea', { name: fd.name, rows: 3, required: fd.required });
    } else if (fd.type === 'select') {
      input = el('select', { name: fd.name, required: fd.required },
        ...fd.options.map(o => typeof o === 'string'
          ? el('option', { value: o }, o)
          : el('option', { value: o.value }, o.label)));
    } else if (fd.type === 'checkbox') {
      input = el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        el('input', { type: 'checkbox', name: fd.name, style: { width: 'auto' } }),
        el('span', {}, fd.label));
    } else {
      input = el('input', { name: fd.name, type: fd.type || 'text', required: fd.required });
    }
    if (fd.type === 'checkbox') f.append(el('div', { class: 'field' }, input));
    else f.append(el('div', { class: 'field' }, el('label', {}, fd.label), input));
  });
  f.append(el('button', { class: 'btn', style: { width: '100%' } }, t('save')));
  return f;
}

function crudModal(title, endpoint, fields) {
  const m = modal(el('div', {},
    el('h3', {}, title),
    formBuilder(fields, async (data) => {
      await API.post(endpoint, data);
      m.close(); render(); toast('Guardado', 'success');
    })
  ));
}

// PWA Service Worker
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

// ============= GO =============
boot();
})();
