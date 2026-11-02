const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../verification-results/ui-interactions');
(async () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8'));
  if (!report.fin) throw new Error('El navegador aún no ha terminado la prueba.');
  const pdfPath = path.join(root, 'documento.pdf');
  if (fs.existsSync(pdfPath)) {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
    try {
      const result = await parser.getText();
      report.pdf = { paginas: result.total, caracteresExtraibles: result.text.length, bytes: fs.statSync(pdfPath).size };
    } finally { await parser.destroy(); }
  }
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  const lines = ['# Pruebas de interacción por navegador — 1 de noviembre de 2026', '',
    'Chromium real sobre iCase local, cuenta y base de datos sintéticas. Sin edición de requisitos, diagramas, mockups ni código generado. No se realizaron llamadas de generación IA.', '',
    `Resultado: ${report.correctas} comprobaciones correctas, ${report.fallidas} fallidas; ${report.erroresJS.length} errores JavaScript no capturados.`, '',
    '| Comprobación | Resultado |', '| --- | --- |',
    ...report.pruebas.map(p => `| ${p.nombre} | ${p.estado}${p.error ? ': ' + p.error.replace(/\n/g, ' ').replace(/\|/g, '/') : ''} |`), '',
    '## Descargas', '',
    'Se comprobó el clic de descarga, la recepción por Chromium y el contenido del archivo, no solo que el botón estuviera visible.', '',
    ...(report.pdf ? [`PDF: ${report.pdf.paginas} páginas, ${report.pdf.bytes} bytes y ${report.pdf.caracteresExtraibles} caracteres extraíbles. El análisis no certifica la fidelidad visual de todas las páginas.`, ''] : []),
    'La descarga ZIP positiva no quedó acreditada: generar el paquete respondió HTTP 400 por falta de confirmación de entrega parcial. No se aceptó esa excepción ni se alteraron decisiones para eludir la compuerta.', '',
    '## Persistencia y límites', '',
    'Se compararon identificadores, contenido, versiones y estados de los requisitos/diagramas y el HTML/versiones de los mockups antes y después de navegar y recargar. La prueba de persistencia exige igualdad exacta.', '',
    ...(report.noCubierto || []).map(item => '- No cubierto: ' + item), '',
    'Capturas 01.png en adelante, report.json, mockup.html y documento.pdf guardan la evidencia. login.private.json es privado y no debe compartirse. Los diagnósticos iniciales conservan ajustes del automatizador (visor SVG y cancelación de recursos durante navegación); no son correcciones de la aplicación.', ''];
  fs.writeFileSync(path.join(root, 'resultado.md'), lines.join('\n'));
  console.log(JSON.stringify({ correctas: report.correctas, fallidas: report.fallidas, erroresJS: report.erroresJS, pdf: report.pdf }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
