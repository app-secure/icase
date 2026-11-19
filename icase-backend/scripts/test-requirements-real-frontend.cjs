// Ensayo opt-in de requisitos con IA real sobre frontend y backend aislados.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('./lib/playwright-runtime.cjs').configureBrowserCache();
const { chromium } = require('@playwright/test');

async function main() {
  if (!process.argv.includes('--run-real')) throw new Error('La prueba real requiere --run-real.');
  const file = process.env.REQUIREMENTS_TEST_INPUT_FILE;
  if (!file || !fs.existsSync(file)) throw new Error('Define REQUIREMENTS_TEST_INPUT_FILE con la entrevista de prueba.');
  const base = process.env.REQUIREMENTS_TEST_FRONTEND || 'http://127.0.0.1:43292';
  const output = path.resolve(__dirname, '../verification-results/requirements-frontend', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const report = { inicio: new Date().toISOString(), fuente: path.basename(file), estado: 'en_curso', incidencias: [] };
  const save = () => fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', e => report.incidencias.push({ tipo: 'javascript', detalle: e.message }));
    page.on('response', async r => {
      if (r.status() >= 400 && r.url().includes('/icase-api/')) report.incidencias.push({ tipo: 'api', estado: r.status(), ruta: new URL(r.url()).pathname });
    });
    page.on('dialog', dialog => dialog.accept());
    const resumeExisting = process.argv.includes('--resume-existing');
    const observeExisting = process.argv.includes('--observe-existing');
    if (resumeExisting || observeExisting) {
      require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
      const mongoose = require('mongoose');
      const jwt = require('jsonwebtoken');
      await mongoose.connect(process.env.REQUIREMENTS_TEST_MONGO_URI || 'mongodb://127.0.0.1:27018/icase_requirements_e2e');
      const job = await mongoose.connection.db.collection('trabajogeneracions').findOne(resumeExisting ? { tipo: 'requisitos', estado: 'esperando_proveedor' } : { tipo: 'requisitos' }, { sort: { createdAt: -1 } });
      if (!job) throw new Error('No existe un trabajo de requisitos pendiente en la base aislada.');
      const project = await mongoose.connection.db.collection('proyectos').findOne({ _id: job.proyecto_id });
      const user = await mongoose.connection.db.collection('usuarios').findOne({ _id: project.usuario_id });
      await mongoose.disconnect();
      const auth = { id: String(user._id), nombre: user.nombre, apellido: user.apellido, correo: user.correo };
      const token = jwt.sign(auth, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h', jwtid: randomUUID() });
      await page.addInitScript(({ auth, token }) => {
        localStorage.setItem('icase_token', token);
        localStorage.setItem('icase_user', JSON.stringify(auth));
      }, { auth, token });
      report.proyecto_prueba = String(project._id);
    }
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    if (!resumeExisting && !observeExisting) {
    await page.getByRole('button', { name: /Regístrate gratis/i }).click();
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Prueba');
    await page.getByPlaceholder('Apellido', { exact: true }).fill('Requisitos');
    await page.getByPlaceholder('Número de celular').fill('0999999999');
    await page.getByPlaceholder('Correo electrónico').fill(`requisitos-${Date.now()}@example.test`);
    await page.getByPlaceholder('Contraseña', { exact: true }).fill(`Prueba-${randomUUID()}`);
    await page.locator('button[type=submit]').click();
    await page.getByText('Crear Proyecto', { exact: true }).first().waitFor({ timeout: 30000 });
    await page.getByText('Crear Proyecto', { exact: true }).first().click();
    await page.locator('input[type=file]').first().setInputFiles(file);
    const saveContext = page.getByRole('button', { name: 'Guardar contexto', exact: true });
    if (await saveContext.isVisible().catch(() => false)) await saveContext.click();
    await page.getByRole('button', { name: 'Procesar', exact: true }).waitFor({ timeout: 60000 });
    const providers = page.locator('select').filter({ has: page.locator('option[value=gemini]') });
    if (await providers.count()) await providers.first().selectOption('gemini');
    await page.screenshot({ path: path.join(output, 'fuente-cargada.png'), fullPage: true });
    await page.getByRole('button', { name: 'Procesar', exact: true }).click();
    } else {
      await page.getByText('Entrevista gerente', { exact: true }).first().click();
      if (resumeExisting) {
        const resumeButton = page.getByRole('button', { name: 'Reanudar pendientes', exact: true });
        await resumeButton.click();
        await resumeButton.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      }
    }
    const approval = page.getByRole('button', { name: 'Aprobar y generar diagramas', exact: true });
    const resume = page.getByRole('button', { name: 'Reanudar pendientes', exact: true });
    const first = await Promise.race([
      approval.waitFor({ timeout: 300000 }).then(() => 'generado'),
      resume.waitFor({ timeout: 300000 }).then(() => 'pausado')
    ]);
    await page.screenshot({ path: path.join(output, 'requisitos-generados.png'), fullPage: true });
    report.texto_visible = (await page.locator('body').innerText()).slice(0, 30000);
    report.estado = first === 'pausado' ? 'pausado_proveedor_sin_reanudar' : 'generado_sin_aprobar';
  } catch (error) {
    report.estado = 'interrumpido'; report.error = error.message;
  } finally {
    report.fin = new Date().toISOString(); save();
    await browser?.close();
    console.log(`[Ensayo frontend] ${report.estado}; ${output}`);
    if (report.estado !== 'generado_sin_aprobar') process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
