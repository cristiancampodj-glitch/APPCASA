const router = require('express').Router();
const { query } = require('../db');

// Webhook Mercado Pago
router.post('/mercadopago', require('express').json(), async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (type === 'payment' && data?.id) {
      // En producción: validar firma + llamar MP API para detalles
      const ext = req.body.external_reference || req.query.external_reference;
      if (ext) {
        await query(
          `UPDATE payments SET status='paid', paid_at=NOW(), gateway='mercadopago', gateway_id=$2
           WHERE id = $1`,
          [ext, String(data.id)]
        );
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('[webhook mp]', e);
    res.sendStatus(500);
  }
});

// Webhook Wompi (Colombia)
router.post('/wompi', require('express').json(), async (req, res) => {
  try {
    const t = req.body?.data?.transaction;
    if (t && t.status === 'APPROVED' && t.reference) {
      await query(
        `UPDATE payments SET status='paid', paid_at=NOW(), gateway='wompi', gateway_id=$2
         WHERE id = $1`,
        [t.reference, t.id]
      );
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

module.exports = router;
