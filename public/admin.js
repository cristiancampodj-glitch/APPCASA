// =============================================================
//   Mi Casa — Panel ADMIN
//   Solo accesible para usuarios con role = 'admin'.
// =============================================================
(() => {
'use strict';

// ---------- Helpers ------------------------------------------
const $ = (s, r=document) => r.querySelector(s);
function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}
function toast(msg, type='info') {
  const t = el('div', { class:'toast-box', style:{ background: type==='error' ? '#dc2626' : type==='success' ? '#16a34a' : '#0f172a' } }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
function fmtDate(s) { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('es-CO'); }
function fmtDT(s)   { if (!s) return '—'; const d = new Date(s); return d.toLocaleString('es-CO'); }

// ---------- API ----------------------------------------------
const API = {
  token: () => localStorage.getItem('admin_token'),
  setToken: (t) => t ? localStorage.setItem('admin_token', t) : localStorage.removeItem('admin_token'),
  async req(path, opts={}) {
    const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
    const tk = this.token(); if (tk) headers.Authorization = `Bearer ${tk}`;
    const r = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data; try { data = await r.json(); } catch { data = {}; }
    if (r.status === 401 || r.status === 403) {
      this.setToken(null);
      if (state.user) { state.user = null; render(); }
      throw new Error(data.error || 'Sesión expirada');
    }
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data;
  },
  get(p)     { return this.req(p); },
  post(p, b) { return this.req(p, { method:'POST',  body: b }); },
  patch(p,b) { return this.req(p, { method:'PATCH', body: b }); }
};

// ---------- State --------------------------------------------
const state = {
  user: null,
  tab: 'pending',     // pending | owners | tenants | inactive | all
  query: '',
  users: [],
  stats: null
};

// ---------- Modal helper -------------------------------------
function modal(content) {
  const bg = el('div', { class:'modal-bg', onclick: e => { if (e.target === bg) close(); } });
  const card = el('div', { class:'modal-card' }, content);
  bg.appendChild(card);
  document.body.appendChild(bg);
  function close() { bg.remove(); }
  return { close, card };
}

// ---------- Login --------------------------------------------
function renderLogin() {
  const root = $('#app'); root.innerHTML = '';
  const errBox = el('div', { class:'err' });
  const form = el('form', { onsubmit: async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    errBox.classList.remove('show');
    try {
      const r = await fetch('/api/auth/login', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      if (j.user.role !== 'admin') throw new Error('Esta cuenta no tiene permisos de administrador.');
      API.setToken(j.token);
      state.user = j.user;
      render();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.add('show');
    }
  }});

  form.append(
    el('label', {}, 'Correo'),
    el('input', { name:'email', type:'email', required:true, autocomplete:'username' }),
    el('label', {}, 'Contraseña'),
    el('input', { name:'password', type:'password', required:true, autocomplete:'current-password' }),
    el('button', { type:'submit' }, 'Entrar como administrador'),
    errBox
  );

  root.appendChild(el('div', { class:'login-box' },
    el('h1', {}, '🛡️ Panel Admin'),
    el('p', {}, 'Solo administradores pueden gestionar dueños y aprobaciones.'),
    form
  ));
}

// ---------- Layout -------------------------------------------
async function render() {
  if (!state.user) {
    if (!API.token()) return renderLogin();
    try {
      const { user } = await API.get('/api/auth/me');
      if (user.role !== 'admin') {
        API.setToken(null);
        return renderLogin();
      }
      state.user = user;
    } catch {
      return renderLogin();
    }
  }

  const root = $('#app'); root.innerHTML = '';
  const shell = el('div', { class:'admin-shell' });
  root.appendChild(shell);

  shell.append(
    el('div', { class:'admin-header' },
      el('div', {},
        el('h1', {}, '🛡️ Panel de administración'),
        el('div', { class:'meta' }, 'Conectado como ', el('b', {}, state.user.full_name), ` · ${state.user.email}`)
      ),
      el('div', {},
        el('button', { class:'btn ghost', onclick: () => { window.location.href = '/'; } }, '🏠 Ir a la app'),
        ' ',
        el('button', { class:'btn ghost', onclick: () => { API.setToken(null); state.user=null; render(); } }, '🚪 Salir')
      )
    )
  );

  // Stats
  const statsBox = el('div', { class:'admin-stats' });
  shell.appendChild(statsBox);

  // Tabs
  const tabsBox = el('div', { class:'admin-tabs' });
  shell.appendChild(tabsBox);

  // Search
  const search = el('input', { type:'search', placeholder:'Buscar por nombre o correo...', value: state.query });
  search.addEventListener('input', () => { state.query = search.value; loadUsers(); });
  shell.appendChild(el('div', { class:'admin-search' }, search));

  const list = el('div', { id:'user-list' });
  shell.appendChild(list);

  // Cargar stats + lista
  await loadStats(statsBox, tabsBox);
  await loadUsers();
}

async function loadStats(statsBox, tabsBox) {
  try {
    state.stats = await API.get('/api/admin/users/stats');
  } catch (e) { toast(e.message, 'error'); return; }
  const s = state.stats;

  statsBox.innerHTML = '';
  const cards = [
    ['Pendientes', s.pending,  '#ef4444'],
    ['Aprobados', s.approved,  '#16a34a'],
    ['Dueños',    s.owners,    '#1e40af'],
    ['Inquilinos',s.tenants,   '#0891b2'],
    ['Inactivos', s.inactive,  '#64748b'],
    ['Total',     s.total,     '#6366f1']
  ];
  for (const [lbl, num, color] of cards) {
    statsBox.appendChild(el('div', { class:'admin-stat' },
      el('div', { class:'num', style:{ color } }, String(num ?? 0)),
      el('div', { class:'lbl' }, lbl)
    ));
  }

  tabsBox.innerHTML = '';
  const tabs = [
    { key:'pending', label:'⏳ Pendientes', badge: s.pending },
    { key:'owners',  label:'👑 Dueños',    badge: 0 },
    { key:'tenants', label:'🏠 Inquilinos', badge: 0 },
    { key:'inactive',label:'🚫 Inactivos', badge: 0 },
    { key:'all',     label:'📋 Todos',     badge: 0 }
  ];
  for (const t of tabs) {
    const btn = el('button', {
      class: state.tab === t.key ? 'active' : '',
      onclick: () => { state.tab = t.key; render(); }
    }, t.label, t.badge ? el('span', { class:'badge' }, String(t.badge)) : null);
    tabsBox.appendChild(btn);
  }
}

async function loadUsers() {
  const list = $('#user-list'); if (!list) return;
  list.innerHTML = 'Cargando...';
  let qs = [];
  if (state.tab === 'pending')  qs.push('status=pending');
  if (state.tab === 'inactive') qs.push('status=inactive');
  if (state.tab === 'owners')   { qs.push('status=approved'); qs.push('role=owner'); }
  if (state.tab === 'tenants')  { qs.push('status=approved'); qs.push('role=tenant'); }
  if (state.query) qs.push('q=' + encodeURIComponent(state.query));
  try {
    const { users } = await API.get('/api/admin/users?' + qs.join('&'));
    state.users = users;
  } catch (e) { list.innerHTML = ''; toast(e.message, 'error'); return; }

  list.innerHTML = '';
  if (!state.users.length) {
    list.appendChild(el('div', { class:'empty-msg' }, 'No hay usuarios en esta categoría.'));
    return;
  }
  for (const u of state.users) list.appendChild(renderUserCard(u));
}

function rolePill(role) {
  return el('span', { class: 'pill ' + (role || 'tenant') }, role || 'tenant');
}

function renderUserCard(u) {
  const isPending  = u.approved !== true;
  const isInactive = u.is_active === false;

  const status = el('span', { class: 'pill ' + (isPending ? 'pending' : isInactive ? 'inactive' : (u.role || 'tenant')) },
    isPending ? '⏳ Pendiente' : isInactive ? '🚫 Inactivo' : '✅ Activo'
  );

  const card = el('div', { class: 'user-card' + (isPending ? ' pending' : '') });
  card.append(
    el('div', { class:'top' },
      el('div', {},
        el('div', { style:{ fontWeight:'700', fontSize:'16px' } }, u.full_name || '(sin nombre)'),
        el('div', { class:'meta' }, u.email + (u.phone ? ' · ' + u.phone : '')),
        u.national_id && el('div', { class:'meta' }, 'Cédula: ' + u.national_id),
        u.pending_house_name && el('div', { class:'meta' }, '🏠 Quiere registrar: ' + u.pending_house_name + ' · ' + (u.pending_currency || 'COP')),
        u.approval_notes && el('div', { class:'meta' }, '📝 ' + u.approval_notes),
        el('div', { class:'meta' }, 'Creada: ' + fmtDate(u.created_at) + (u.last_login ? ' · Último ingreso ' + fmtDT(u.last_login) : ''))
      ),
      el('div', { style:{ textAlign:'right' } },
        rolePill(u.role),
        ' ',
        status
      )
    )
  );

  const actions = el('div', { class:'actions' });
  if (isPending) {
    actions.append(
      el('button', { class:'btn success', onclick: () => openApproveModal(u) }, '✅ Aprobar'),
      el('button', { class:'btn danger',  onclick: () => askReject(u) }, '❌ Rechazar')
    );
  } else {
    actions.append(
      el('button', { class:'btn ghost', onclick: () => openEditModal(u) }, '✏️ Editar'),
      el('button', {
        class: isInactive ? 'btn success' : 'btn danger',
        onclick: () => askToggleActive(u)
      }, isInactive ? '🔓 Reactivar' : '🚫 Desactivar')
    );
  }
  card.appendChild(actions);
  return card;
}

// ---------- Aprobar ------------------------------------------
function openApproveModal(u) {
  const isOwner = (u.requested_role || u.role) === 'owner';
  const m = modal(el('div', {}));
  const f = el('form', { onsubmit: async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    try {
      await API.post(`/api/admin/users/${u.id}/approve`, {
        role: data.role,
        house_name: data.house_name || null,
        currency: data.currency || null,
        notes: data.notes || null
      });
      toast('Cuenta aprobada ✅', 'success');
      m.close(); render();
    } catch (err) { toast(err.message, 'error'); }
  }});

  const houseFields = el('div', {},
    el('label', {}, 'Nombre de la propiedad'),
    el('input', { name:'house_name', value: u.pending_house_name || '' }),
    el('label', {}, 'Moneda'),
    el('input', { name:'currency', value: u.pending_currency || 'COP' })
  );
  if (!isOwner) houseFields.style.display = 'none';

  const roleSel = el('select', { name:'role',
    onchange: () => houseFields.style.display = roleSel.value === 'owner' ? 'block' : 'none'
  },
    el('option', { value:'owner',  selected: isOwner ? 'selected' : null }, 'Dueño / Owner'),
    el('option', { value:'tenant', selected: !isOwner ? 'selected' : null }, 'Inquilino / Tenant'),
    el('option', { value:'admin' }, 'Administrador')
  );

  f.append(
    el('label', {}, 'Rol que tendrá'),
    roleSel,
    houseFields,
    el('label', {}, 'Notas (opcional)'),
    el('textarea', { name:'notes', rows:2 }),
    el('div', { class:'row-btns' },
      el('button', { class:'btn success', type:'submit' }, '✅ Aprobar y activar'),
      el('button', { class:'btn ghost', type:'button', onclick: m.close }, 'Cancelar')
    )
  );

  m.card.append(
    el('h3', {}, '✅ Aprobar a ' + u.full_name),
    el('p', { class:'meta' }, u.email),
    f
  );
}

function askReject(u) {
  const m = modal(el('div', {}));
  const ta = el('textarea', { rows:3, placeholder:'Motivo del rechazo (opcional)' });
  m.card.append(
    el('h3', {}, '❌ Rechazar a ' + u.full_name),
    el('p', { class:'meta' }, 'La cuenta quedará marcada como rechazada y no podrá iniciar sesión.'),
    el('label', {}, 'Motivo'),
    ta,
    el('div', { class:'row-btns' },
      el('button', { class:'btn danger', onclick: async () => {
        try {
          await API.post(`/api/admin/users/${u.id}/reject`, { reason: ta.value });
          toast('Rechazado', 'success'); m.close(); render();
        } catch (err) { toast(err.message, 'error'); }
      }}, 'Sí, rechazar'),
      el('button', { class:'btn ghost', onclick: m.close }, 'Cancelar')
    )
  );
}

function askToggleActive(u) {
  const verb = u.is_active === false ? 'reactivar' : 'desactivar';
  const m = modal(el('div', {}));
  m.card.append(
    el('h3', {}, '¿Seguro que quieres ' + verb + ' a ' + u.full_name + '?'),
    el('p', { class:'meta' }, u.email),
    el('div', { class:'row-btns' },
      el('button', { class: u.is_active === false ? 'btn success' : 'btn danger', onclick: async () => {
        try {
          await API.post(`/api/admin/users/${u.id}/toggle-active`, {});
          toast(verb + ' OK', 'success'); m.close(); render();
        } catch (err) { toast(err.message, 'error'); }
      }}, 'Sí, ' + verb),
      el('button', { class:'btn ghost', onclick: m.close }, 'Cancelar')
    )
  );
}

function openEditModal(u) {
  const m = modal(el('div', {}));
  const f = el('form', { onsubmit: async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const payload = {
      role: data.role,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone
    };
    if (data.password && data.password.length >= 6) payload.password = data.password;
    try {
      await API.patch(`/api/admin/users/${u.id}`, payload);
      toast('Guardado ✅', 'success'); m.close(); render();
    } catch (err) { toast(err.message, 'error'); }
  }});
  f.append(
    el('label', {}, 'Nombre'),
    el('input', { name:'full_name', value: u.full_name || '' }),
    el('label', {}, 'Correo'),
    el('input', { name:'email', type:'email', value: u.email || '' }),
    el('label', {}, 'Teléfono'),
    el('input', { name:'phone', value: u.phone || '' }),
    el('label', {}, 'Rol'),
    (() => {
      const sel = el('select', { name:'role' });
      for (const r of ['owner','tenant','admin']) {
        sel.appendChild(el('option', { value:r, selected: u.role === r ? 'selected' : null }, r));
      }
      return sel;
    })(),
    el('label', {}, 'Nueva contraseña (opcional, mín 6)'),
    el('input', { name:'password', type:'text', autocomplete:'off' }),
    el('div', { class:'row-btns' },
      el('button', { class:'btn primary', type:'submit' }, '💾 Guardar'),
      el('button', { class:'btn ghost', type:'button', onclick: m.close }, 'Cancelar')
    )
  );
  m.card.append(
    el('h3', {}, '✏️ Editar usuario'),
    f
  );
}

// ---------- Boot ---------------------------------------------
render();

})();
