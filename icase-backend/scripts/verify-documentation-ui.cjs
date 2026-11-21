// Prueba local con datos sintéticos. No modifica proyectos ni requiere credenciales.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');

async function main() {
  const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: true });
  const url = process.env.DOCS_TEST_URL || 'http://127.0.0.1:5180';
  const bundle = new Generator().generar({ proyecto: { nombre: 'Proyecto de prueba visual', descripcion: 'Datos sintéticos' }, requerimientos: [{ tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Confirmar reserva', descripcion: 'Elegir horario, revisar los datos y confirmar.', actores: ['Cliente'] }], opciones: { githubActions: true } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  fs.mkdirSync(process.argv[2], { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const failures = []; page.on('pageerror', error => failures.push(error.message));
    await page.route('**/proyectos/docs-test/codificacion/documentacion', route => route.fulfill({ json: bundle }));
    await page.goto(url);
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const client = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = client.createRoot || client.default.createRoot;
      const Panel = (await import('/src/components/ProjectDocumentationPanel.jsx')).default;
      document.getElementById('root').style.display = 'none';
      const target = document.createElement('div'); target.id = 'docs-test'; target.style.padding = '24px'; document.body.appendChild(target);
      window.docsTestRoot = createRoot(target); window.docsTestRoot.render(React.createElement(Panel, { projectId: 'docs-test' }));
    });
    await page.getByRole('button', { name: 'Generar documentación', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'lista para revisar' }).waitFor();
    await page.screenshot({ path: path.join(output, 'panel-documentacion.png'), fullPage: true });
    const downloadWait = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar con 3 videos' }).click();
    const download = await downloadWait; await download.saveAs(path.join(output, 'documentacion-con-videos.zip'));
    const frame = page.frameLocator('iframe[title="Manuales del proyecto generado"]');
    if (await frame.locator('main > section').count() !== 5) throw new Error('Faltan manuales en la vista previa.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'panel-movil.png'), fullPage: true });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Desbordamiento horizontal en móvil.');
    await page.setViewportSize({ width: 1440, height: 1000 });
    const reportProject = { name: 'Sistema de reservas con seguimiento de atención y validación de disponibilidad', finalAudit: { exportable: true },
      description: 'Informe de prueba de paginación y conservación del contenido.',
      introduccion: ('Contenido de introducción extenso para comprobar la continuación entre páginas. ').repeat(160),
      requirements: { functional: [{ id: 'RF-01', name: 'Confirmar reserva con validación de disponibilidad, roles y datos obligatorios', description: ('Descripción extensa con información que debe conservarse entre páginas. ').repeat(300) + ' FIN-DESCRIPCION-RF-01', actors: ['Cliente'], priority: 'Alta' }], nonFunctional: [] },
      sources: [], mockups: [], diagrams: {} };
    await page.evaluate(async project => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const PDF = (await import('/src/components/PdfPreviewModal.jsx')).default;
      window.docsTestRoot.render(React.createElement(PDF, { project, onClose() {} }));
    }, reportProject);
    await page.locator('iframe[title="Previsualización PDF"]').waitFor({ timeout: 60000 });
    const pdfBytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch(document.querySelector('iframe[title="Previsualización PDF"]').src.split('#')[0])).arrayBuffer())));
    fs.writeFileSync(path.join(output, 'informe-prueba-textos-largos.pdf'), Buffer.from(pdfBytes));
    await page.screenshot({ path: path.join(output, 'visor-informe.png') });
    if (failures.length) throw new Error(failures.join('\n'));
    console.log('Vista previa: 5 manuales. ZIP: 3 videos. Móvil: sin desbordamiento. PDF de textos largos: exportado. Sin errores de JavaScript.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
