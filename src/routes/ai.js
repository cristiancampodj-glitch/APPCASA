const router = require('express').Router();
const { requireAuth } = require('../middleware');
const { query } = require('../db');

// POST /api/ai/ask  { prompt: "..."}
// Si OPENAI_API_KEY está, usa OpenAI. Si no, hace respuesta heurística básica con datos de la BD.
router.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Falta prompt' });

    // Contexto del usuario (saldos, turnos, etc)
    const ctx = await buildContext(req.user);

    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const r = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Eres el asistente de Mi Casa. Responde breve, en español, con datos del contexto.' },
            { role: 'system', content: 'CONTEXTO: ' + JSON.stringify(ctx) },
            { role: 'user', content: prompt }
          ]
        });
        return res.json({ answer: r.choices[0].message.content, source: 'openai' });
      } catch (e) {
        console.error('[ai] fallback', e.message);
      }
    }

    // Fallback heurístico
    const p = prompt.toLowerCase();
    let answer = 'No tengo IA configurada. Activa OPENAI_API_KEY para respuestas inteligentes.';
    if (p.includes('debo') || p.includes('pago') || p.includes('arriendo')) {
      answer = ctx.next_payment
        ? `Tu próximo pago es de $${ctx.next_payment.amount} con vencimiento ${ctx.next_payment.due_date}.`
        : 'No tienes pagos pendientes.';
    } else if (p.includes('limpia') || p.includes('turno') || p.includes('aseo')) {
      answer = ctx.next_chore
        ? `Le toca a ${ctx.next_chore.assignee_name || 'sin asignar'}: ${ctx.next_chore.title} el ${ctx.next_chore.due_date}.`
        : 'No hay turnos próximos.';
    }
    res.json({ answer, source: 'heuristic', context: ctx });
  } catch (e) { next(e); }
});

async function buildContext(user) {
  const [pay, chore] = await Promise.all([
    query(
      `SELECT amount, due_date FROM payments
       WHERE tenant_id=$1 AND status IN ('pending','overdue','partial')
       ORDER BY due_date ASC LIMIT 1`, [user.id]),
    query(
      `SELECT c.title, c.due_date, u.full_name AS assignee_name FROM chores c
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.house_id=$1 AND c.status='pending'
       ORDER BY c.due_date ASC LIMIT 1`, [user.house_id])
  ]);
  return {
    user_role: user.role,
    next_payment: pay.rows[0] || null,
    next_chore: chore.rows[0] || null
  };
}

module.exports = router;
