const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { safePath } = require('./DocumentationFacts');
const { zipSync } = require('fflate');
const backendRoot = path.resolve(__dirname, '../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(backendRoot, '.icase-browsers');
const sourceFingerprint = bundle => crypto.createHash('sha256').update(JSON.stringify({ informe: bundle.informe, pantallas: bundle.pantallas, diagramas: bundle.diagramas, hechos: bundle.hechos, fuentes: bundle.manifiesto.fuentes })).digest('hex');

/** Cola del servidor con versiones inmutables en disco; una ejecución a la vez limita Chromium/Docker. */
class DocumentationJobs {
  constructor({ root = process.env.ICASE_DOCUMENTATION_DIR || path.join(process.cwd(), '.icase-documentation'), browserFactory, execute = run } = {}) {
    this.root = path.resolve(root); this.execute = execute; this.browserFactory = browserFactory; this.queue = Promise.resolve(); this.active = new Set(); this.starting = new Set();
  }
  dir(project, version = '') {
    if (!/^[\w-]{1,64}$/.test(String(project)) || (version && !/^[a-f0-9-]{36}$/.test(version))) throw new Error('Identificador de documentación no válido.');
    return path.join(this.root, String(project), version);
  }
  async list(project) {
    const base = this.dir(project);
    const entries = await fs.readdir(base).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    return (await Promise.all(entries.filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => this.status(project, id).catch(() => null)))).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async status(project, version) {
    const state = JSON.parse(await fs.readFile(path.join(this.dir(project, version), 'status.json'), 'utf8').catch(() => { throw new Error('Documentación no encontrada.'); }));
    if (['pendiente', 'procesando'].includes(state.estado) && !this.active.has(version)) { state.estado = 'interrumpida'; state.error = 'El servidor se reinició. Genera una nueva versión; la fuente anterior se conserva.'; }
    return state;
  }
  async save(base, state) { const target = path.join(base, 'status.json'); await fs.writeFile(target + '.tmp', JSON.stringify(state, null, 2)); await fs.rename(target + '.tmp', target); }
  async start(project, bundle, options = {}, runtime = null) {
    if (this.starting.has(String(project))) throw new Error('Ya hay una generación de documentación en curso.');
    this.starting.add(String(project));
    try { return await this.enqueue(project, bundle, options, runtime); }
    finally { this.starting.delete(String(project)); }
  }
  async enqueue(project, bundle, options, runtime) {
    const versions = await this.list(project);
    if (versions.some(item => ['pendiente', 'procesando'].includes(item.estado))) throw new Error('Ya hay una generación de documentación en curso.');
    const id = crypto.randomUUID(), base = this.dir(project, id);
    await fs.mkdir(base, { recursive: true });
    const state = { id, version: versions.length + 1, proyecto: String(project), createdAt: new Date().toISOString(), estado: 'pendiente', etapa: 'En cola', progreso: 0, advertencias: [...bundle.advertencias], archivos: [], videos: [], licencia: bundle.manifiesto.licencia, huella_fuentes: sourceFingerprint(bundle) };
    await fs.writeFile(path.join(base, 'source.json'), JSON.stringify(bundle));
    await this.save(base, state); this.active.add(id);
    this.queue = this.queue.catch(() => {}).then(async () => { try { await this.build(base, state, bundle, options, runtime); } catch (error) { state.estado = 'fallida'; state.error = error.message; await fs.writeFile(path.join(base, 'error.log'), error.stack || error.message); await this.save(base, state); } finally { this.active.delete(id); } });
    return state;
  }
  async launch() {
    if (this.browserFactory) return this.browserFactory();
    const chromium = require('playwright').chromium;
    if (process.env.DOCUMENTATION_BROWSER_CHANNEL) return chromium.launch({ channel: process.env.DOCUMENTATION_BROWSER_CHANNEL, headless: true });
    try { return await chromium.launch({ headless: true }); }
    catch (error) { if (!/Executable doesn't exist/.test(error.message)) throw error; return chromium.launch({ channel: 'chrome', headless: true }); }
  }
  async write(base, file) {
    if (!safePath(file.ruta)) throw new Error('Ruta de documentación no permitida.');
    const target = path.join(base, 'package', file.ruta); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, file.contenido);
  }
  async build(base, state, bundle, options, runtime) {
    const progress = async (etapa, progreso) => { Object.assign(state, { estado: 'procesando', etapa, progreso }); await this.save(base, state); };
    await progress('Preparando páginas Markdown', 5);
    if (options.ia === true) {
      const ai = await new (require('./DocumentationAi'))().improve(bundle);
      state.advertencias.push(...ai.warnings); state.ia = { modelo: ai.model, revision: ai.review || [], secciones: ai.accepted };
      for (const section of ai.accepted) {
        const page = bundle.archivos.find(file => file.ruta === `documentation/docs/${section.manual}.md`);
        const text = `\n\n## Redacción asistida por IA: ${String(section.rol || section.id).replace(/[<>]/g, '')}\n\n${section.texto.replace(/[<>]/g, '')}\n\nFuentes: ${section.referencias.join(', ')}. Uso: ${section.uso}. Revisión asistida contra los artefactos aprobados.\n`;
        if (page) page.contenido += text;
      }
      bundle.archivos.push({ ruta: 'documentation/revision-ia.json', contenido: JSON.stringify(state.ia, null, 2) });
      const captions = ai.accepted.filter(section => section.uso === 'infografia');
      if (captions.length) for (const image of require('./DocumentationInfographics').buildInfographics(bundle.flujos, bundle.pantallas, bundle.hechos, captions)) {
        const existing = bundle.archivos.find(file => file.ruta === image.ruta);
        if (existing) existing.contenido = image.contenido;
      }
    }
    for (const file of bundle.archivos) await this.write(base, file);
    const browser = await this.launch();
    try {
      await progress('Renderizando diagramas SVG', 15);
      await this.diagrams(base, bundle, browser, state);
      await progress('Capturando mockups aprobados', 30);
      await this.screenshots(base, bundle, browser, state);
      if (options.videos === true) { await progress('Grabando recorridos en el servidor', 45); await this.videos(base, bundle, browser, state, runtime, options); }
      await this.report(base, bundle, browser, state);
    } finally { await browser.close(); }
    await progress('Construyendo Material, validando enlaces y exportando PDF', 75);
    const docs = path.join(base, 'package/documentation');
    const runtimeDir = path.join(base, 'runtime');
    await fs.mkdir(runtimeDir, { recursive: true });
    const probe = path.join(runtimeDir, crypto.randomUUID() + '.probe');
    try { await fs.writeFile(probe, ''); await fs.unlink(probe); }
    catch { throw new Error('No se puede escribir en la carpeta temporal de esta versión de documentación. Revisa los permisos de ICASE_DOCUMENTATION_DIR.'); }
    const pythonEnv = { ...process.env, ICASE_DOCUMENTATION_TEMP: runtimeDir, TEMP: runtimeDir, TMP: runtimeDir, TMPDIR: runtimeDir, PYTHONPATH: [path.join(backendRoot, '.documentation-python'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
    await this.execute(process.env.DOCUMENTATION_PYTHON || 'python', ['tools/export_pdf.py'], { cwd: docs, windowsHide: true, timeout: 240000, maxBuffer: 4 * 1024 * 1024, env: pythonEnv }).catch(async error => {
      const detail = String(error.stderr || error.message);
      await fs.writeFile(path.join(base, 'export-pdf.log'), String(error.stdout || '') + '\n' + detail);
      if (/EPERM|EACCES|PermissionError|Access is denied/i.test(detail)) throw new Error('Chromium no pudo utilizar su carpeta temporal privada. Revisa los permisos de escritura del almacén de documentación. El detalle se guardó en export-pdf.log.');
      if (/Executable doesn't exist|No module named/i.test(detail)) throw new Error('Faltan dependencias de PDF en el servidor. Ejecuta npm run docs:setup en icase-backend y vuelve a generar.');
      throw new Error('No se pudo construir o validar el sitio y su PDF. El detalle se guardó en export-pdf.log dentro de esta versión.');
    });
    const walk = async folder => (await Promise.all((await fs.readdir(folder, { withFileTypes: true })).map(async entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : path.join(folder, entry.name)))).flat();
    let paths = await walk(path.join(base, 'package'));
    const manifestPath = path.join(docs, 'documentation-manifest.json');
    const manifest = { ...bundle.manifiesto, id: state.id, version: state.version, createdAt: state.createdAt, advertencias: state.advertencias, videos: state.videos, capturas: state.capturas, archivos: await Promise.all(paths.filter(file => file !== manifestPath).map(async file => ({ ruta: path.relative(path.join(base, 'package'), file).replace(/\\/g, '/'), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }))) };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    paths = await walk(path.join(base, 'package'));
    const entries = {}; for (const file of paths) entries[path.relative(path.join(base, 'package'), file).replace(/\\/g, '/')] = new Uint8Array(await fs.readFile(file));
    await fs.writeFile(path.join(base, 'documentacion.zip'), zipSync(entries));
    Object.assign(state, { estado: 'lista', etapa: 'Lista para revisar', progreso: 100, categorias: bundle.categorias, flujos: bundle.flujos.map(flow => ({ id: flow.id, role: flow.role, pending: flow.pending, funciones: flow.steps.length })), archivos: manifest.archivos });
    await this.save(base, state);
  }
  async diagrams(base, bundle, browser, state) {
    for (const [index, diagram] of bundle.diagramas.entries()) {
      const ruta = `documentation/docs/assets/diagram-${index + 1}.svg`;
      try {
        let svg;
        if (diagram.codigo_mermaid) {
          const context = await browser.newContext({ javaScriptEnabled: true }); const page = await context.newPage();
          try {
            await page.setContent('<html><body></body></html>');
            await page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') });
            svg = await page.evaluate(async source => { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false } }); return (await mermaid.render('diagram', source)).svg; }, diagram.codigo_mermaid);
          } finally { await context.close(); }
        } else {
          const encoded = '~h' + Buffer.from(diagram.codigo_plantuml || '', 'utf8').toString('hex');
          const server = process.env.DOCUMENTATION_PLANTUML_SERVER || 'https://www.plantuml.com/plantuml';
          const response = await fetch(`${server.replace(/\/$/, '')}/svg/${encoded}`, { signal: AbortSignal.timeout(25000), redirect: 'error' });
          if (!response.ok) throw new Error(`PlantUML HTTP ${response.status}`);
          svg = await response.text();
        }
        if (!/<svg[\s>]/.test(svg) || /<script|<foreignObject|<iframe|\son\w+\s*=|(?:href|src)\s*=\s*["']?\s*javascript:/i.test(svg)) throw new Error('Respuesta SVG no válida o insegura');
        await this.write(base, { ruta, contenido: svg });
      } catch (error) {
        state.advertencias.push(`Diagrama ${diagram.titulo || diagram.tipo}: ${error.message}; se conserva la fuente editable.`);
        await this.write(base, { ruta, contenido: require('./DocumentationInfographics').buildInfographics([], [], { models: [], services: [] })[0].contenido });
      }
    }
  }
  async safeMockup(page, screen) {
    page.setDefaultTimeout(15000);
    // El diseño aprobado no ejecuta scripts ni consulta APIs/datos de usuarios durante la captura.
    await page.route('**/*', route => route.abort());
    const source = require('./DocumentationMockupRenderer').sanitizeMockup(screen.preview_code);
    const candidates = [...source.matchAll(/class(?:Name)?=["']([^"']*)["']/g)].flatMap(match => match[1].split(/\s+/));
    const theme = await fs.readFile(require.resolve('tailwindcss/theme.css'), 'utf8');
    const compiled = await require('tailwindcss').compile(`${theme}\n@tailwind utilities;`);
    const utilities = compiled.build(candidates);
    await page.setContent(`<html lang="es"><head><meta charset="utf-8"><style>body{font:16px Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:28px}main,section,form{max-width:1100px;margin:auto}button{background:#7c3aed;color:white;border:0;border-radius:8px;padding:10px 18px}input,select,textarea{padding:10px;border:1px solid #cbd5e1;border-radius:6px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #e2e8f0}img{max-width:100%}h1,h2{color:#4c1d95}</style></head><body>${source}</body></html>`, { waitUntil: 'load', timeout: 15000 });
    await page.evaluate(() => { document.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; input.setAttribute('value', ''); }); });
    await page.evaluate(css => { const style = document.createElement('style'); style.textContent = css; document.head.append(style); }, utilities);
  }
  async screenshots(base, bundle, browser, state) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, javaScriptEnabled: false });
    state.capturas = [];
    try { for (const [index, screen] of bundle.pantallas.entries()) {
      const page = await context.newPage();
      try { await this.safeMockup(page, screen); const bytes = await page.screenshot({ fullPage: true }); const ruta = `documentation/docs/assets/capturas/${index + 1}.png`; await this.write(base, { ruta, contenido: bytes }); state.capturas.push({ pantalla: screen.pantalla_id || screen.nombre_pantalla, ruta, origen: 'mockup-aprobado' }); }
      finally { await page.close(); }
    } } finally { await context.close(); }
    // Galería completa: incluye pantallas sin RF asociado, sin excluirlas silenciosamente.
    const gallery = '\n\n## Galería de mockups aprobados\n\n' + bundle.pantallas.map((screen, index) => `### ${String(screen.nombre_visible || screen.nombre_pantalla).replace(/[<>]/g, '')}\n\n![Mockup aprobado ${index + 1}](assets/capturas/${index + 1}.png)\n`).join('\n');
    await fs.appendFile(path.join(base, 'package/documentation/docs/usuario.md'), gallery);
  }
  async videos(base, bundle, browser, state, runtime, options) {
    let live = null;
    if (options.videoReal === true && runtime) {
      try { live = await runtime(); } catch (error) { state.advertencias.push(`No se pudo iniciar la aplicación: ${error.message}. Se grabarán mockups aprobados.`); }
    }
    for (const flow of bundle.flujos.filter(flow => !flow.pending)) {
      state.etapa = `Grabando recorrido de ${flow.role}`; await this.save(base, state);
      const screens = bundle.pantallas.filter(screen => (screen.roles || []).some(role => role.toLowerCase() === flow.role.toLowerCase()) || (!(screen.roles || []).length && (screen.rf_trazabilidad || []).some(rf => flow.steps.some(step => step.id === rf))));
      if (!screens.length) { state.advertencias.push(`Sin pantallas aprobadas para grabar el rol ${flow.role}.`); continue; }
      const record = async real => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(base, 'recordings'), size: { width: 1280, height: 720 } } });
        const page = await context.newPage();
        try {
          if (real) {
            await page.goto(live.url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.locator('input[type=email]').fill(live.credentials.email);
            await page.locator('input[type=password]').fill(live.credentials.password);
            await page.getByRole('button', { name: /iniciar|ingresar|entrar/i }).click();
            await page.waitForFunction(() => !document.querySelector('input[type=password]'), null, { timeout: 15000 });
          }
          for (const screen of screens) {
            if (real) {
              if (!screen.ruta || !screen.ruta.startsWith('/')) throw new Error('Pantalla sin ruta de aplicación confirmada.');
              const target = new URL(screen.ruta, live.url);
              if (target.origin !== new URL(live.url).origin) throw new Error('Ruta fuera de la aplicación local.');
              await page.goto(target.href, { waitUntil: 'networkidle', timeout: 30000 });
              const title = screen.nombre_visible || screen.nombre_pantalla;
              if (!(await page.getByText(title, { exact: false }).first().isVisible())) throw new Error(`La ruta no muestra la pantalla ${title}.`);
            } else await this.safeMockup(page, screen);
            const script = state.ia?.secciones?.find(section => section.uso === 'video' && section.rol?.toLowerCase() === flow.role.toLowerCase() && section.referencias.some(ref => (screen.rf_trazabilidad || []).includes(ref)));
            await page.evaluate(({ title, role, origin }) => { document.getElementById('documentation-caption')?.remove(); const label = document.createElement('aside'); label.id = 'documentation-caption'; label.textContent = `${role} · ${title} · ${origin}`; label.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;padding:18px;background:#4c1d95;color:white;border-radius:12px;z-index:2147483647;font:20px Arial'; document.body.append(label); }, { title: script ? script.texto + ' (guion asistido por IA)' : screen.nombre_visible || screen.nombre_pantalla, role: flow.role, origin: real ? 'Aplicación en ejecución' : 'Recorrido de mockups aprobados' });
            await page.waitForTimeout(2500);
          }
        } finally { await context.close(); }
        return page.video().path();
      };
      let video, source = 'mockups-aprobados';
      if (live?.url && live?.credentials && /administrador|administradora/i.test(flow.role)) {
        try { video = await record(true); source = 'aplicacion-docker'; }
        catch (error) { state.advertencias.push(`Recorrido real de ${flow.role} no confirmado: ${error.message}. Se graban sus mockups completos.`); }
      } else if (options.videoReal) state.advertencias.push(`Sin acceso de aplicación confirmado para ${flow.role}; video de mockups aprobados.`);
      if (!video) video = await record(false);
      const ruta = `documentation/docs/assets/videos/${flow.id}.webm`;
      await this.write(base, { ruta, contenido: await fs.readFile(video) });
      state.videos.push({ id: flow.id, rol: flow.role, titulo: `Recorrido de ${flow.role}`, origen: source, ruta });
    }
    if (state.videos.length) await fs.appendFile(path.join(base, 'package/documentation/docs/usuario.md'), '\n\n## Videos por rol\n\n' + state.videos.map(video => `- [${video.titulo}: ${video.origen}](assets/videos/${video.id}.webm)`).join('\n') + '\n');
  }
  async report(base, bundle, browser, state) {
    const { markdown, html } = require('./DocumentationReport')(bundle, state);
    await this.write(base, { ruta: 'informe-final.md', contenido: markdown });
    await this.write(base, { ruta: 'decisiones-aprobadas.json', contenido: JSON.stringify(bundle.informe?.decisiones || {}, null, 2) });
    await this.write(base, { ruta: 'informe-final.html', contenido: html });
    const page = await browser.newPage();
    try { await page.goto(require('node:url').pathToFileURL(path.join(base, 'package/informe-final.html')).href); await page.evaluate(() => Promise.all([...document.images].map(image => image.decode()))); await page.pdf({ path: path.join(base, 'package/informe-final.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true }); }
    finally { await page.close(); }
  }
  async file(project, version, relative) {
    const state = await this.status(project, version);
    if (state.estado !== 'lista') throw new Error('La documentación todavía no está lista.');
    if (!safePath(relative)) throw new Error('Ruta no permitida.');
    if (relative === 'documentacion.zip') return path.join(this.dir(project, version), relative);
    if (!state.archivos.some(file => file.ruta === relative) && relative !== 'documentation/documentation-manifest.json') throw new Error('Archivo no encontrado.');
    return path.join(this.dir(project, version), 'package', relative);
  }
  async forDelivery(project, bundle) {
    const state = (await this.list(project)).find(item => item.estado === 'lista' && item.huella_fuentes === sourceFingerprint(bundle));
    if (!state) throw new Error('Genera y revisa la documentación de los insumos aprobados actuales antes de crear el paquete de entrega.');
    const files = [];
    for (const file of state.archivos.filter(item => (/\.(?:md|svg|json|ya?ml|css|py|txt|puml|mmd)$/.test(item.ruta) || /^licen[cs]e$/i.test(item.ruta)) && !item.ruta.startsWith('documentation/site/'))) files.push({ ruta: file.ruta, contenido: await fs.readFile(await this.file(project, state.id, file.ruta), 'utf8') });
    files.push({ ruta: 'documentation/documentation-manifest.json', contenido: await fs.readFile(await this.file(project, state.id, 'documentation/documentation-manifest.json'), 'utf8') });
    return { archivos: files, advertencias: state.advertencias, versionId: state.id, version: state.version };
  }
  async deliveryAssets(project, version) {
    const state = await this.status(project, version);
    const files = [];
    for (const file of state.archivos.filter(item => item.ruta.startsWith('documentation/') || /^informe-final\./.test(item.ruta))) files.push({ ruta: file.ruta, contenido: await fs.readFile(await this.file(project, version, file.ruta)) });
    return files;
  }
}
module.exports = DocumentationJobs;
