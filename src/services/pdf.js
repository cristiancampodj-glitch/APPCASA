/**
 * Generación de recibos PDF con QR de validación.
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { format: fmtMoney, normalize } = require('./currency');

async function generateReceipt(stream, payment) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  // Header
  doc.fillColor('#0f172a').fontSize(24).text('Mi Casa — Recibo de Pago', { align: 'left' });
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
  const cur = normalize(payment.currency);
  doc.fontSize(20).fillColor('#16a34a').text(
    `Total pagado: ${fmtMoney(payment.amount_paid || payment.amount, cur)}`,
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
    'Documento generado electrónicamente. Mi Casa — gestión de propiedades.',
    50, 760, { align: 'center', width: 495 }
  );

  doc.end();
}

module.exports = { generateReceipt, generateContract };

async function generateContract(stream, contract) {
  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  doc.pipe(stream);

  const cur = normalize(contract.currency || 'COP');
  const fmt = (n) => fmtMoney(n || 0, cur);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' }) : '—';

  // Encabezado
  doc.fillColor('#0ea5e9').fontSize(10).text('MI CASA — Gestión Inmobiliaria', { align:'right' });
  doc.moveDown(0.2);
  doc.fillColor('#94a3b8').fontSize(9).text(`Documento: ${contract.id}`, { align:'right' });
  doc.moveDown(1.5);

  doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold')
     .text('CONTRATO DE ARRENDAMIENTO', { align:'center' });
  doc.moveDown(1.5);

  // Datos básicos
  doc.font('Helvetica').fontSize(11).fillColor('#0f172a');
  const line = (label, value) => {
    doc.font('Helvetica-Bold').text(label + ': ', { continued: true });
    doc.font('Helvetica').text(value || '—');
  };
  line('ARRENDADOR',  contract.owner_name || '—');
  line('ARRENDATARIO', contract.tenant_name || '—');
  if (contract.tenant_email) line('Correo del arrendatario', contract.tenant_email);
  line('Inmueble', contract.house_name || '—');
  if (contract.address) line('Dirección', contract.address);
  line('Inicio',   fmtDate(contract.start_date));
  line('Fin',      contract.end_date ? fmtDate(contract.end_date) : 'Indefinido');
  line('Canon mensual', fmt(contract.monthly_rent));
  if (Number(contract.deposit) > 0) line('Depósito', fmt(contract.deposit));
  line('Día de pago', `${contract.payment_day || 5} de cada mes`);
  doc.moveDown(1);

  // Cuerpo del contrato
  doc.font('Helvetica-Bold').fontSize(12).text('CLÁUSULAS', { underline: true });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor('#0f172a');

  const body = (contract.body_text && contract.body_text.trim().length > 0)
    ? contract.body_text
    : defaultContractBody(contract, fmt, fmtDate);

  doc.text(body, { align:'justify', lineGap: 2 });
  doc.moveDown(2);

  // Firmas
  const yStart = doc.y < 600 ? doc.y : 600;
  doc.y = yStart;
  const colW = (doc.page.width - 120 - 30) / 2;
  const leftX = 60;
  const rightX = 60 + colW + 30;

  drawSignatureBox(doc, leftX, doc.y, colW, 'Arrendador (Dueño)', contract.signature_owner, contract.signed_owner_at, fmtDate);
  drawSignatureBox(doc, rightX, doc.y, colW, 'Arrendatario (Inquilino)', contract.signature_tenant, contract.signed_tenant_at, fmtDate);

  // Pie
  doc.moveDown(2);
  doc.fontSize(9).fillColor('#94a3b8').text(
    'Documento generado electrónicamente. Las firmas digitales registradas tienen validez como expresión de voluntad de las partes.',
    60, doc.page.height - 80, { align:'center', width: doc.page.width - 120 }
  );

  doc.end();
}

function defaultContractBody(c, fmt, fmtDate) {
  const months = (c.start_date && c.end_date)
    ? Math.max(1, monthsBetween(c.start_date, c.end_date))
    : 12;
  return [
    `PRIMERA — OBJETO: El ARRENDADOR entrega en arrendamiento al ARRENDATARIO el inmueble identificado en el encabezado, en perfectas condiciones de uso y habitabilidad.`,
    ``,
    `SEGUNDA — CANON: El ARRENDATARIO pagará la suma de ${fmt(c.monthly_rent)} mensuales, dentro de los primeros ${c.payment_day || 5} días de cada mes, en la cuenta o medio de pago designado por el ARRENDADOR.`,
    ``,
    `TERCERA — DURACIÓN: El presente contrato regirá desde el ${fmtDate(c.start_date)}${c.end_date ? ` hasta el ${fmtDate(c.end_date)} (${months} meses)` : ' por tiempo indefinido'}, prorrogable de común acuerdo entre las partes.`,
    Number(c.deposit) > 0
      ? `\nCUARTA — DEPÓSITO: El ARRENDATARIO entrega la suma de ${fmt(c.deposit)} a título de depósito, que será devuelto al término del contrato previa verificación del estado del inmueble y solvencia en pagos de servicios.`
      : '',
    ``,
    `QUINTA — SERVICIOS PÚBLICOS: Los servicios públicos (agua, energía, gas, internet) serán pagados por el ARRENDATARIO, salvo pacto en contrario por escrito.`,
    ``,
    `SEXTA — USO: El ARRENDATARIO destinará el inmueble exclusivamente a vivienda y se obliga a conservarlo en buen estado, respondiendo por los daños distintos al desgaste natural.`,
    ``,
    `SÉPTIMA — INCUMPLIMIENTO: El no pago oportuno de dos (2) cánones consecutivos faculta al ARRENDADOR para terminar unilateralmente el contrato y exigir la restitución del inmueble.`,
    ``,
    `OCTAVA — DOMICILIO: Para todos los efectos del presente contrato las partes fijan como domicilio el correspondiente al inmueble objeto del arriendo.`,
    ``,
    `En constancia de aceptación, las partes firman el presente documento de manera digital en la fecha indicada bajo cada firma.`
  ].filter(Boolean).join('\n');
}

function monthsBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function drawSignatureBox(doc, x, y, w, label, signatureDataUrl, signedAt, fmtDate) {
  const h = 90;
  doc.lineWidth(0.7).strokeColor('#94a3b8').roundedRect(x, y, w, h, 6).stroke();

  if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
    try {
      const buf = Buffer.from(signatureDataUrl.split(',')[1], 'base64');
      doc.image(buf, x + 6, y + 6, { fit: [w - 12, h - 22] });
    } catch (_) { /* ignore */ }
  } else {
    doc.fillColor('#94a3b8').fontSize(10).text('Sin firma', x, y + 35, { width: w, align:'center' });
  }

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
     .text(label, x, y + h + 6, { width: w, align:'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#64748b')
     .text(signedAt ? `Firmado el ${fmtDate(signedAt)}` : 'Pendiente de firma', x, y + h + 20, { width: w, align:'center' });
  doc.fillColor('#0f172a');
  doc.y = y + h + 40;
}
