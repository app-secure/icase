// Comprueba la paginación del PDF realmente descargado, no solo el código del exportador.
const fs = require('node:fs');
const path = require('node:path');
const { PDFParse } = require('pdf-parse');
(async () => {
  const root = path.resolve(__dirname, '../verification-results/correcciones');
  const name = process.env.PDF_EVIDENCE_NAME || 'documento-visual';
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Nombre de evidencia inválido');
  const pdf = new PDFParse({ data: fs.readFileSync(path.join(root, name + '.pdf')) });
  try {
    const result = await pdf.getText();
    const screens = result.pages.flatMap(page => [...page.text.matchAll(/(?:^|\n)9\.(\d+)\s+([^\n]+)/g)]
      .map(match => ({ pantalla: Number(match[1]), pagina: page.num, titulo: match[2], epigrafeEnMismaPagina: page.text.includes('Figura 9.' + match[1] + '.') })));
    const report = {
      fecha: new Date().toISOString(), paginas: result.total, pantallas: screens,
      titulosSinEpigrafe: screens.filter(s => !s.epigrafeEnMismaPagina),
      alcanceExplicito: result.text.includes('no constituyen certificación normativa'),
      diagramasEnRespaldoTextual: (result.text.match(/No se pudo obtener la imagen del diagrama/g) || []).length,
      seccionesDiagramas: ['8.1', '8.2', '8.3', '8.4', '8.5', '8.6'].filter(id => result.text.includes(id + ' Diagrama') || (id === '8.4' && result.text.includes(id + ' Árbol'))),
      limites: 'Empareja títulos y epígrafes. No acredita cobertura funcional ni fidelidad píxel a píxel del HTML.'
    };
    fs.writeFileSync(path.join(root, name + '-presentacion.json'), JSON.stringify(report, null, 2));
    const images = await pdf.getScreenshot({ partial: screens.slice(0, 1).map(s => s.pagina), desiredWidth: 1000 });
    for (const page of images.pages) fs.writeFileSync(path.join(root, name + '-pagina-' + page.pageNumber + '.png'), page.data);
    console.log(JSON.stringify(report));
    if (!screens.length || report.titulosSinEpigrafe.length || !report.alcanceExplicito || report.seccionesDiagramas.length !== 6) process.exitCode = 1;
  } finally { await pdf.destroy(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
