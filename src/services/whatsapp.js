/**
 * WhatsApp recordatorios vía Twilio.
 * Configura: TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM (ej: 'whatsapp:+14155238886')
 */
async function sendWhatsApp(to, message) {
  if (!process.env.TWILIO_SID || !process.env.TWILIO_TOKEN) {
    console.log('[whatsapp DEMO]', to, '→', message);
    return { demo: true };
  }
  try {
    const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    return await twilio.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      body: message
    });
  } catch (e) {
    console.error('[whatsapp]', e.message);
    return { error: e.message };
  }
}

module.exports = { sendWhatsApp };
