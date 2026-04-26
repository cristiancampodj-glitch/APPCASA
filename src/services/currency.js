// Utilidades para multi-moneda
const SUPPORTED = ['COP', 'EUR', 'USD', 'MXN'];

const CURRENCY_META = {
    COP: { symbol: '$',   decimals: 0, locale: 'es-CO' },
    EUR: { symbol: '€',   decimals: 2, locale: 'es-ES' },
    USD: { symbol: 'US$', decimals: 2, locale: 'en-US' },
    MXN: { symbol: '$',   decimals: 2, locale: 'es-MX' }
};

function normalize(code) {
    const c = String(code || 'COP').toUpperCase();
    return SUPPORTED.includes(c) ? c : 'COP';
}

function format(amount, currency = 'COP') {
    const cur = normalize(currency);
    const meta = CURRENCY_META[cur];
    const n = Number(amount) || 0;
    try {
        return new Intl.NumberFormat(meta.locale, {
            style: 'currency', currency: cur,
            minimumFractionDigits: meta.decimals,
            maximumFractionDigits: meta.decimals
        }).format(n);
    } catch {
        return `${meta.symbol}${n.toFixed(meta.decimals)}`;
    }
}

module.exports = { SUPPORTED, CURRENCY_META, normalize, format };
