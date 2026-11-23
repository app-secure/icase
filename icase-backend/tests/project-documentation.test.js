const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
const Jobs = require('../src/infrastructure/services/DocumentationJobs');
const { deliveryFacts, safePath } = require('../src/infrastructure/services/DocumentationFacts');
const base = () => ({ proyecto: { nombre: 'Ventas', estado_fase: 'mockups_aprobados' }, requerimientos: [
  { tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Registrar venta', actores: ['Vendedor'], criterios_aceptacion: ['La venta queda registrada'] },
  { tipo: 'RF', aprobado: true, identificador: 'RF-02', nombre: 'Administrar usuarios', actores: ['Administrador'] },
  { tipo: 'RF', aprobado: false, identificador: 'RF-99', nombre: 'Sin aprobación' }
], diseno: { mockups: [{ nombre_pantalla: 'Venta', estado: 'generado', estado_calidad: 'valido', roles: ['Vendedor'], rf_trazabilidad: ['RF-01'], preview_code: '<h1>Registrar venta</h1>' }] }, artefactos: [{ aprobado: true, tipo: 'codigo_backend', version: 1, archivos: [
  { ruta: 'backend/package.json', contenido: JSON.stringify({ scripts: { start: 'node app.js', test: 'node --test', seed: 'node seed.js' }, dependencies: { mongoose: '8' } }) },
  { ruta: 'ops/docker-compose.yml', contenido: 'services:\n  backend:\n    ports: ["8081:3000"]\n    healthcheck:\n      test: [CMD, curl, http://localhost:3000/health]\n' },
  { ruta: 'ops/.env.example', contenido: 'API_PORT=8081\nADMIN_EMAIL=demo@example.test\nADMIN_PASSWORD=NO_PUBLICAR\n' },
  { ruta: 'backend/openapi.json', contenido: JSON.stringify({ paths: { '/ventas': { get: { summary: 'Ventas del usuario' } } }, components: { schemas: { Venta: { properties: { total: { type: 'number' } } } } } }) },
  { ruta: 'README.md', contenido: '# README original\n\nConservar instrucciones.' }
] }], opciones: { githubActions: true, licencia: 'MIT', titular: 'Equipo' } });

test('genera Markdown real, Material, Mermaid y PDF desde print-site sin manual HTML duplicado', () => {
  const result = new Generator().generar(base());
  const file = name => result.archivos.find(item => item.ruta === name)?.contenido;
  expect(result.paginas).toHaveLength(5);
  for (const page of result.paginas) { expect(page.markdown).toMatch(/^# /); expect(page.markdown).not.toMatch(/<\/?(?:h\d|p|table|div|section)\b/); }
  expect(file('documentation/mkdocs.yml')).toMatch(/name: material/);
  expect(file('documentation/mkdocs.yml')).toContain('scheme: slate');
  expect(file('documentation/mkdocs.yml')).toContain('print-site');
  expect(file('documentation/mkdocs.yml')).toContain('name: mermaid');
  expect(result.archivos.some(item => /manual-completo\.html$/.test(item.ruta))).toBe(false);
  expect(file('documentation/tools/export_pdf.py')).toContain('print_page.html');
  expect(file('README.md')).toContain('README original');
  for (const name of ['README.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'LICENSE.md']) expect(file(name)).toBeTruthy();
  expect(file('LICENSE.md')).toContain('MIT License');
  expect(file('LICENSE.md')).toContain('Equipo');
});

test('deriva comandos, puertos, salud, variables y endpoints sin publicar contraseñas', () => {
  const result = new Generator().generar(base());
  const docs = result.paginas.map(page => page.markdown).join('\n');
  expect(docs).toContain('8081:3000'); expect(docs).toContain('/health'); expect(docs).toContain('npm --prefix backend run test');
  expect(docs).toContain('ADMIN_PASSWORD'); expect(docs).not.toContain('NO_PUBLICAR'); expect(docs).toContain('/ventas'); expect(docs).toContain('Venta');
  expect(result.hechos.models[0].fields).toEqual(['total']);
});

test('respeta aprobación global, roles, criterios y excluye fuentes sin aprobación', () => {
  const result = new Generator().generar(base());
  expect(result.pantallas).toHaveLength(1);
  expect(result.flujos.find(flow => flow.role === 'Vendedor').steps.map(step => step.id)).toEqual(['RF-01']);
  expect(result.paginas[0].markdown).toContain('La venta queda registrada'); expect(result.paginas[0].markdown).not.toContain('RF-99');
  const pending = base(); pending.proyecto.estado_fase = 'mockups_pendientes'; expect(new Generator().generar(pending).pantallas).toHaveLength(0);
  expect(result.archivos.filter(file => /docs\/assets\/(?:flujo|modulos|datos|arquitectura)\.svg$/.test(file.ruta))).toHaveLength(4);
});

test('licencia explícita, preservación y decisión pendiente sin concesión implícita', () => {
  const data = base(); data.opciones = {};
  const generated = new Generator().generar(data); expect(generated.manifiesto.licencia).toBe('pendiente');
  expect(generated.archivos.find(file => file.ruta === 'LICENSE.md').contenido).toContain('no concede permisos');
  expect(() => new Generator().generar({ ...data, opciones: { licencia: 'invalida' } })).toThrow('Licencia no válida');
  expect(() => new Generator().generar({ ...data, opciones: { licencia: 'conservar' } })).toThrow('No existe');
  const apache = new Generator().generar({ ...data, opciones: { licencia: 'Apache-2.0', titular: 'Equipo' } });
  expect(apache.archivos.find(file => file.ruta === 'LICENSE.md').contenido).toContain('TERMS AND CONDITIONS');
});

test('workflow automático y manual valida enlaces y solo publica por decisión explícita', () => {
  const result = new Generator().generar(base()), workflow = result.archivos.find(file => file.ruta.endsWith('documentation.yml')).contenido;
  expect(workflow).toContain('workflow_dispatch:'); expect(workflow).toContain('push:'); expect(workflow).toContain('documentation/**'); expect(workflow).toContain('DOCUMENTATION_PUBLISH'); expect(workflow).toContain('default: false');
  expect(result.archivos.find(file => file.ruta.endsWith('check_links.py'))).toBeTruthy();
});

test('manifiesto reproducible con huellas y rutas protegidas', () => {
  const a = new Generator().generar(base()), b = new Generator().generar(base()); expect(a).toEqual(b);
  for (const entry of a.manifiesto.archivos) expect(crypto.createHash('sha256').update(a.archivos.find(file => file.ruta === entry.ruta).contenido).digest('hex')).toBe(entry.sha256);
  for (const name of ['../.env', 'C:/secrets', '/etc/passwd', 'folder\\file']) expect(safePath(name)).toBe(false);
  expect(deliveryFacts([{ ruta: '../compose.yml', contenido: 'services: {x: {}}' }]).services).toHaveLength(0);
});

test('trabajos versionados persisten el fallo, bloquean descargas incompletas y aíslan proyectos', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-docs-'));
  const jobs = new Jobs({ root }); jobs.build = async () => { throw new Error('Chromium no disponible'); };
  try {
    const job = await jobs.start('project-a', new Generator().generar(base())); await jobs.queue;
    expect((await jobs.status('project-a', job.id)).estado).toBe('fallida');
    expect((await jobs.list('project-a'))[0].error).toBe('Chromium no disponible');
    await expect(jobs.file('project-a', job.id, 'documentacion.zip')).rejects.toThrow('no está lista');
    await expect(jobs.status('project-b', job.id)).rejects.toThrow('no encontrada');
    const second = await jobs.start('project-a', new Generator().generar(base())); await jobs.queue; expect(second.version).toBe(2);
    await expect(jobs.status('../escape', job.id)).rejects.toThrow('Identificador');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'icase-docs-')) throw new Error('Limpieza fuera del directorio temporal'); await fs.rm(root, { recursive: true, force: true }); }
});

test('la entrega fija la versión y la licencia, rechaza fuentes distintas y conserva bytes de medios', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-docs-'));
  const jobs = new Jobs({ root });
  jobs.build = async (base, state, bundle) => {
    for (const file of bundle.archivos) await jobs.write(base, file);
    await jobs.write(base, { ruta: 'documentation/docs/assets/captura.png', contenido: Buffer.from([0, 255, 80, 78, 71]) });
    state.estado = 'lista'; state.archivos = [...bundle.manifiesto.archivos, { ruta: 'documentation/docs/assets/captura.png' }];
    await jobs.save(base, state);
  };
  try {
    const bundle = new Generator().generar(base()), state = await jobs.start('demo', bundle); await jobs.queue;
    const attached = await jobs.forDelivery('demo', bundle);
    expect(attached.versionId).toBe(state.id); expect(attached.archivos.find(file => file.ruta === 'LICENSE.md').contenido).toContain('MIT License');
    const assets = await jobs.deliveryAssets('demo', state.id);
    const Zip = require('../src/infrastructure/services/ZipArchiveService');
    const { unzipSync } = require('fflate');
    const bytes = new Zip().crear(assets);
    expect(Buffer.from(unzipSync(bytes)['documentation/docs/assets/captura.png'])).toEqual(Buffer.from([0, 255, 80, 78, 71]));
    const changed = new Generator().generar(base()); changed.informe.proyecto.nombre = 'Otra versión';
    await expect(jobs.forDelivery('demo', changed)).rejects.toThrow('insumos aprobados actuales');
  } finally { if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'icase-docs-')) throw new Error('Limpieza fuera del directorio temporal'); await fs.rm(root, { recursive: true, force: true }); }
});

test('IA rechaza referencias inventadas, hace segunda revisión y usa plantilla al fallar', async () => {
  const Ai = require('../src/infrastructure/services/DocumentationAi');
  const bundle = new Generator().generar(base());
  const converse = jest.fn().mockResolvedValueOnce({ text: JSON.stringify({ secciones: [
    { id: 'ok', manual: 'usuario', rol: 'Vendedor', texto: 'Revisa la venta.', referencias: ['RF-01'], uso: 'manual' },
    { id: 'inventado', manual: 'usuario', texto: 'Exporta contabilidad.', referencias: ['RF-999'], uso: 'manual' }
  ] }) }).mockResolvedValueOnce({ text: JSON.stringify({ revisiones: [{ id: 'ok', sustentado: true }] }) });
  const result = await new Ai({ client: { configured: true, converse } }).improve(bundle);
  expect(result.accepted.map(section => section.id)).toEqual(['ok']); expect(converse).toHaveBeenCalledTimes(2);
  expect(converse.mock.calls[0][0].prompt).toContain('La venta queda registrada');
  const fallback = await new Ai({ client: { configured: true, converse: async () => { throw new Error('sin servicio'); } } }).improve(bundle);
  expect(fallback.accepted).toEqual([]); expect(fallback.warnings.join(' ')).toContain('plantillas');
});

test('API de documentación y archivos exige sesión y propiedad antes de trabajar', async () => {
  const express = require('express'), jwt = require('jsonwebtoken');
  const Controller = require('../src/interface-adapters/controllers/CodificacionController');
  const buildRoutes = require('../src/routes/codificacionRoutes'), buildAccess = require('../src/infrastructure/security/projectAccess');
  const projectId = '100000000000000000000001', owner = '200000000000000000000001', secret = 'docs-tests-only';
  const controller = new Controller({ gestionarArtefactosCodigo: {} }); controller.documentationJobs = { list: jest.fn(async () => []) };
  const app = express(); app.locals.jwtSecret = secret;
  app.use('/proyectos', buildRoutes(controller, buildAccess({ proyectoRepository: { obtenerPorId: async () => ({ usuario_id: owner }) } })));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/proyectos/${projectId}/codificacion/documentacion/versiones`;
  try {
    expect((await fetch(url)).status).toBe(401);
    const headers = id => ({ Authorization: `Bearer ${jwt.sign({ id }, secret)}` });
    expect((await fetch(url, { headers: headers('other') })).status).toBe(404);
    expect((await fetch(url, { headers: headers('other') })).status).toBe(404);
    expect(controller.documentationJobs.list).not.toHaveBeenCalled();
    expect((await fetch(url, { headers: headers(owner) })).status).toBe(200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
