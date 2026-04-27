/**
 * Realtime bus simple basado en Server-Sent Events.
 * - subscribe(userId, res): registra una conexión SSE.
 * - publish(target, event): envía a uno o varios usuarios / 'all'.
 * - publishToHouse(houseId, event): a todos los miembros de la casa.
 *
 * No requiere Redis: vive en memoria del proceso (suficiente para 1 instancia).
 */
const { query } = require('../db');

// userId -> Set<res>
const subs = new Map();

function subscribe(userId, res) {
  if (!subs.has(userId)) subs.set(userId, new Set());
  subs.get(userId).add(res);
  res.on('close', () => unsubscribe(userId, res));
  res.on('error', () => unsubscribe(userId, res));
}

function unsubscribe(userId, res) {
  const set = subs.get(userId);
  if (!set) return;
  set.delete(res);
  if (!set.size) subs.delete(userId);
  try { res.end(); } catch {}
}

function send(res, event) {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    // conexión cerrada
  }
}

function publish(userIds, event) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const payload = { ts: Date.now(), ...event };
  for (const id of ids) {
    if (id === 'all') {
      for (const set of subs.values()) for (const res of set) send(res, payload);
      return;
    }
    const set = subs.get(id);
    if (!set) continue;
    for (const res of set) send(res, payload);
  }
}

// Envía a TODOS los usuarios activos de una casa + al dueño de la casa.
async function publishToHouse(houseId, event) {
  if (!houseId) return;
  try {
    const r = await query(
      `SELECT u.id
         FROM users u
        WHERE u.house_id = $1
        UNION
       SELECT h.owner_id AS id
         FROM houses h
        WHERE h.id = $1 AND h.owner_id IS NOT NULL`,
      [houseId]
    );
    const ids = r.rows.map(x => x.id).filter(Boolean);
    if (ids.length) publish(ids, event);
  } catch (e) {
    console.error('[realtime] publishToHouse error:', e.message);
  }
}

// Envía al dueño de una casa específica (admin de la propiedad).
async function publishToHouseOwner(houseId, event) {
  if (!houseId) return;
  try {
    const r = await query(`SELECT owner_id FROM houses WHERE id = $1`, [houseId]);
    const oid = r.rows[0] && r.rows[0].owner_id;
    if (oid) publish(oid, event);
  } catch (e) {
    console.error('[realtime] publishToHouseOwner error:', e.message);
  }
}

// Crea una notificación persistente Y la emite por SSE en el mismo paso.
async function notify(userId, { type='system', title, body=null, link=null }) {
  if (!userId || !title) return;
  try {
    const r = await query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [userId, type, title, body, link]
    );
    publish(userId, {
      type: 'notification',
      notification: { id: r.rows[0].id, type, title, body, link, created_at: r.rows[0].created_at }
    });
  } catch (e) {
    console.error('[realtime] notify error:', e.message);
  }
}

module.exports = { subscribe, unsubscribe, publish, publishToHouse, publishToHouseOwner, notify };
