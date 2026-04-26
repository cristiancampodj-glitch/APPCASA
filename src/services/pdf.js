/**
 * Generación de recibos PDF con QR de validación.
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

async function generateReceipt(stream, payment) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  // Header
  doc.fillColor('#0f172a').fontSize(24).text('Casa SaaS — Recibo de Pago', { align: 'left' });
  doc.moveDown(0.3);
  doc.fillColor('#64748b').fontSize(10).text(`ID: ${payment.id}`);
  doc.moveDown(2);

  // Datos
  doc.fillColor('#0f172a').fontSize(12);
  doc.text(`Inquilino: ${payment.tenant_name}`);
  doc.text(`Email: ${payment.tenant_email}`);
  doc.text(`Inmueble: ${payment.house_name}`);
  doc.text(`Dirección: ${payment.address || '—'}`);
  doc.moveDown();

  doc.fontSize(14).fillColor('#0ea5e9').text(`Período: ${payment.period_month}/${payment.period_year}`);
  doc.fillColor('#0f172a').fontSize(12);
  doc.text(`Concepto: Arriendo mensual`);
  doc.text(`Vencimiento: ${new Date(payment.due_date).toLocaleDateString('es-CO')}`);
  doc.text(`Estado: ${payment.status.toUpperCase()}`);
  if (payment.paid_at) doc.text(`Pagado el: ${new Date(payment.paid_at).toLocaleDateString('es-CO')}`);
  doc.text(`Método: ${payment.method || '—'}`);
  if (payment.reference) doc.text(`Referencia: ${payment.reference}`);
  doc.moveDown();

  // Monto
  doc.fontSize(20).fillColor('#16a34a').text(
    `Total pagado: $${Number(payment.amount_paid || payment.amount).toLocaleString('es-CO')} COP`,
    { align: 'right' }
  );

  // QR de validación
  const qrUrl = `${process.env.APP_URL || 'https://example.com'}/verify/${payment.id}`;
  const qrPng = await QRCode.toDataURL(qrUrl);
  const buf = Buffer.from(qrPng.split(',')[1], 'base64');
  doc.image(buf, 50, 600, { width: 110 });
  doc.fontSize(9).fillColor('#64748b').text('Escanea para verificar', 50, 715, { width: 110, align: 'center' });

  // Footer
  doc.fontSize(9).fillColor('#94a3b8').text(
    'Documento generado electrónicamente. Casa SaaS — gestión de propiedades.',
    50, 760, { align: 'center', width: 495 }
  );

  doc.end();
}

module.exports = { generateReceipt };
