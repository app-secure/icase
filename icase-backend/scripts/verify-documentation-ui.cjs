// Prueba de interfaz con datos sintéticos. No modifica proyectos ni usa credenciales.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { chromium } = require('@playwright/test');
const { unzipSync } = createRequire(path.resolve(__dirname, '../../icase-frontend/package.json'))('fflate');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');

async function main() {
  if (!process.argv[2]) throw new Error('Indica la carpeta de evidencias.');
  const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: true });
  const url = process.env.DOCS_TEST_URL || 'http://127.0.0.1:5180';
  const bundle = new Generator().generar({ proyecto: { nombre: 'Gestión de Restaurante', descripcion: 'Reservas, preparación y atención, con recorridos específicos para cada responsable.' }, requerimientos: [
    { tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Reservar una mesa', descripcion: 'Selecciona fecha, horario y número de personas. Revisa los datos antes de confirmar la reserva.', actores: ['Cliente'], precondiciones: 'Selecciona un horario con mesas disponibles.', poscondiciones: 'Se registra la reserva y se muestra su referencia.' },
    { tipo: 'RF', aprobado: true, identificador: 'RF-02', nombre: 'Preparar los pedidos asignados', descripcion: 'Consulta los pedidos pendientes de cocina y actualiza su estado al terminar la preparación.', actores: ['Cocinero'], precondiciones: 'Existe un pedido pendiente asignado a cocina.', poscondiciones: 'El pedido queda listo para ser entregado.' },
    { tipo: 'RF', aprobado: true, identificador: 'RF-03', nombre: 'Administrar usuarios y permisos', descripcion: 'Asigna los roles aprobados para cada usuario del equipo.', actores: ['Administrador'], precondiciones: 'La cuenta tiene permiso de administración.', poscondiciones: 'Los permisos del usuario quedan actualizados.' }
  ], artefactos: [{ tipo: 'codigo_backend', version: 1, aprobado: true, archivos: [{ ruta: 'backend/README.md', contenido: '# Iniciar el proyecto\n\n**Requisitos**: Node.js y la base de datos configurada.\n\n1. Instala las dependencias.\n2. Configura el entorno.\n\n```sh\nnpm install\nnpm start\n```\n\n| Servicio | Uso |\n| --- | --- |\n| API | Funciones del proyecto |\n' }] }], opciones: { githubActions: true } });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
    const failures = []; page.on('pageerror', error => failures.push(error.message));
    await page.route('**/proyectos/docs-test/codificacion/documentacion', route => route.fulfill({ json: bundle }));
    await page.goto(url);
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const client = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = client.createRoot || client.default.createRoot;
      const Panel = (await import('/src/components/ProjectDocumentationPanel.jsx')).default;
      const target = document.createElement('div'); target.style.cssText = 'padding:24px;max-width:1240px;margin:auto'; document.body.replaceChildren(target);
      window.docsTestRoot = createRoot(target); window.docsTestRoot.render(React.createElement(Panel, { projectId: 'docs-test' }));
    });
    await page.getByRole('button', { name: 'Generar documentación', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'lista para revisar' }).waitFor();
    const frame = page.frameLocator('iframe[title="Manuales del proyecto generado"]');
    await frame.locator('[data-role="Cliente"]').waitFor();
    assert(!(await frame.locator('[data-role="Cliente"]').textContent()).includes('Preparar los pedidos'));
    assert(!(await frame.locator('[data-role="Cocinero"]').textContent()).includes('Reservar una mesa'));
    assert.equal(await frame.locator('main > section').count(), 1);
    await frame.locator('[data-role="Cliente"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'manual-por-roles.png'), fullPage: true });
    await page.getByRole('button', { name: /Desarrollador Código/ }).click();
    await frame.locator('.markdown-body h1').waitFor();
    assert.equal(await frame.locator('.markdown-body h1').textContent(), 'Iniciar el proyecto');
    assert.equal(await frame.locator('.markdown-body table').count(), 1);
    assert.equal(await frame.locator('.markdown-body code.language-sh').count(), 1);
    await frame.locator('.repository-document').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'markdown-renderizado.png'), fullPage: true });
    await page.getByRole('button', { name: /Guías animadas/ }).click();
    await page.getByLabel('Ver guías de').selectOption('cliente');
    await page.screenshot({ path: path.join(output, 'guias-por-rol.png'), fullPage: true });
    await page.getByRole('button', { name: 'Crear y reproducir guía', exact: true }).first().click();
    await page.getByRole('status').filter({ hasText: 'Guía lista' }).waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('.docs-video-preview video')?.readyState >= 2);
    const video = page.locator('.docs-video-preview video').first();
    assert.equal(await video.evaluate(element => element.videoWidth), 1280);
    assert.equal(await video.evaluate(element => element.videoHeight), 720);
    await video.evaluate(element => new Promise(resolve => { element.pause(); element.addEventListener('seeked', resolve, { once: true }); element.currentTime = 2.5; setTimeout(resolve, 2000); }));
    const frameImage = await video.evaluate(element => { const canvas = document.createElement('canvas'); canvas.width = element.videoWidth; canvas.height = element.videoHeight; canvas.getContext('2d').drawImage(element, 0, 0); return canvas.toDataURL('image/png').split(',')[1]; });
    fs.writeFileSync(path.join(output, 'fotograma-guia.png'), Buffer.from(frameImage, 'base64'));
    const videoDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar WebM', exact: true }).first().click();
    await (await videoDownload).saveAs(path.join(output, 'guia-cliente.webm'));
    assert(fs.statSync(path.join(output, 'guia-cliente.webm')).size > 1000);
    const zipDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ZIP con guías (1)', exact: true }).click();
    const zipPath = path.join(output, 'documentacion-con-guia.zip'); await (await zipDownload).saveAs(zipPath);
    const entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath)));
    const manifest = JSON.parse(Buffer.from(entries['documentation/documentation-manifest.json']).toString());
    assert.equal(manifest.videos_exportados.length, 1);
    for (const file of manifest.archivos) assert.equal(crypto.createHash('sha256').update(entries[file.ruta]).digest('hex'), file.sha256);
    assert(Buffer.from(entries['documentation/docs/manual-completo.html']).toString().includes('<video controls'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'panel-movil.png'), fullPage: true });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'Desbordamiento horizontal en móvil');
    await page.getByRole('button', { name: /Manuales/ }).click();
    await page.screenshot({ path: path.join(output, 'manual-movil.png'), fullPage: true });
    const printed = page.frameLocator('iframe[title="Documento completo para imprimir"]');
    assert.equal(await printed.locator('main > section').count(), 5);
    const pdf = await browser.newPage(); await pdf.setContent(bundle.html); await pdf.evaluate(() => document.fonts.ready);
    await pdf.pdf({ path: path.join(output, 'manual-completo.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); await pdf.close();
    assert.deepEqual(failures, []);
    console.log('OK: Markdown renderizado y seguro; flujos separados por rol; guía WebM reproducible 1280×720; ZIP con hashes válidos; móvil sin desbordamiento; PDF completo de cinco manuales.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
