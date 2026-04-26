/**
 * Mercado Pago — crear preferencia de pago
 * Funciona si MP_ACCESS_TOKEN está definido. Si no, devuelve un link "demo".
 */
async function createPreference({ title, amount, external_reference, payer_email }) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.warn('[mp] MP_ACCESS_TOKEN no definido — devolviendo link demo');
    return `https://example.com/pay-demo?ref=${external_reference}&amount=${amount}`;
  }
  try {
    const { MercadoPagoConfig, Preference } = require('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: token });
    const pref = new Preference(client);
    const result = await pref.create({
      body: {
        items: [{ title, quantity: 1, unit_price: Number(amount), currency_id: 'COP' }],
        external_reference,
        payer: { email: payer_email },
        back_urls: {
          success: process.env.APP_URL + '/?pago=ok',
          failure: process.env.APP_URL + '/?pago=fail',
          pending: process.env.APP_URL + '/?pago=pending'
        },
        auto_return: 'approved',
        notification_url: process.env.APP_URL + '/webhooks/mercadopago'
      }
    });
    return result.init_point;
  } catch (e) {
    console.error('[mp]', e.message);
    throw new Error('No se pudo crear el pago');
  }
}

module.exports = { createPreference };
