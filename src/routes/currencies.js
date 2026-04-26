const { Router } = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware');
const { SUPPORTED, CURRENCY_META } = require('../services/currency');

const r = Router();

// Lista monedas soportadas (público para que el front pueda usarlo en signup)
r.get('/', async (_req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT code, name, symbol, decimals FROM currencies WHERE is_active = TRUE ORDER BY code`
        );
        if (rows.length) return res.json(rows);
    } catch { /* fallback si BD no migró aún */ }
    res.json(SUPPORTED.map(code => ({
        code,
        name: code,
        symbol: CURRENCY_META[code].symbol,
        decimals: CURRENCY_META[code].decimals
    })));
});

// Tasas de cambio recientes
r.get('/rates', requireAuth, async (_req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT DISTINCT ON (base, quote) base, quote, rate, captured_at
            FROM exchange_rates ORDER BY base, quote, captured_at DESC
        `);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

module.exports = r;
