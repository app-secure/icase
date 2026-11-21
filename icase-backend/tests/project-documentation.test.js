const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
const { JSDOM } = require('jsdom');
const crypto = require('node:crypto');
const base = () => ({ proyecto: { nombre: 'Reservas <script>alert(1)</script>', descripcion: 'Proyecto de ejemplo' },
  requerimientos: [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Reservar una cita', descripcion: 'Elegir horario y confirmar.', actores: ['Cliente'] },
    { aprobado: false, tipo: 'RF', identificador: 'RF-02', nombre: 'Función sin aprobar' },
    { aprobado: true, desactualizado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Función obsoleta' }
  ], diagramas: [
    { aprobado: true, tipo: 'clases', version: 1, codigo_plantuml: '@startuml\nclass Antigua\n@enduml' },
    { aprobado: true, tipo: 'clases', version: 2, codigo_plantuml: '@startuml\nclass Reserva\n@enduml' }
  ] });

test('los manuales preservan requisitos aprobados, escapan HTML y eligen el diagrama vigente', () => {
  const result = new Generator().generar(base());
  const document = new JSDOM(result.html).window.document;
  expect(document.querySelectorAll('script')).toHaveLength(0);
  expect(document.querySelectorAll('main > section')).toHaveLength(5);
  expect(document.body.textContent).toContain('RF-01');
  expect(document.body.textContent).not.toContain('RF-02');
  expect(document.body.textContent).not.toContain('RF-03');
  expect(document.body.textContent).toContain('class Reserva');
  expect(document.body.textContent).not.toContain('class Antigua');
});

test('no inventa licencia ni habilita publicación automática; el workflow es optativo', () => {
  const generator = new Generator();
  expect(generator.generar(base()).archivos.some(file => file.ruta.startsWith('.github/'))).toBe(false);
  const opted = generator.generar({ ...base(), opciones: { githubActions: true } });
  const workflow = opted.archivos.find(file => file.ruta === '.github/workflows/documentation.yml').contenido;
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('default: false');
  expect(workflow).not.toMatch(/^  push:/m);
  expect(opted.archivos.find(file => file.ruta.endsWith('LICENSE.md')).contenido).toContain('no concede permisos');
});

test('el manifiesto verifica los archivos exportados y la generación es reproducible', () => {
  const generator = new Generator();
  const result = generator.generar(base());
  expect(generator.generar(base())).toEqual(result);
  const manifest = JSON.parse(result.archivos.find(file => file.ruta.endsWith('documentation-manifest.json')).contenido);
  for (const item of manifest.archivos) {
    const file = result.archivos.find(file => file.ruta === item.ruta);
    expect(crypto.createHash('sha256').update(file.contenido).digest('hex')).toBe(item.sha256);
  }
});

test('recupera los insumos del proyecto solicitado sin escribir en repositorios', async () => {
  const UseCase = require('../src/core/use-cases/GestionarArtefactosCodigo');
  const project = jest.fn(async () => ({ nombre: 'Demo' }));
  const requirements = jest.fn(async () => base().requerimientos);
  const service = new UseCase({ proyectoRepository: { obtenerPorId: project }, requerimientoRepository: { listarPorProyecto: requirements } });
  const result = await service.generarDocumentacion('proyecto-1');
  expect(project).toHaveBeenCalledWith('proyecto-1');
  expect(requirements).toHaveBeenCalledWith('proyecto-1');
  expect(result.categorias).toHaveLength(5);
});

test('la API exige sesión y propiedad del proyecto antes de generar documentación', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const buildRoutes = require('../src/routes/codificacionRoutes');
  const buildAccess = require('../src/infrastructure/security/projectAccess');
  const Controller = require('../src/interface-adapters/controllers/CodificacionController');
  const projectId = '100000000000000000000001';
  const owner = '200000000000000000000001';
  const secret = 'documentation-test-secret-only';
  const generate = jest.fn(async () => new Generator().generar(base()));
  const controller = new Controller({ gestionarArtefactosCodigo: { generarDocumentacion: generate } });
  const app = express(); app.locals.jwtSecret = secret; app.use(express.json());
  app.use('/proyectos', buildRoutes(controller, buildAccess({ proyectoRepository: { obtenerPorId: async () => ({ usuario_id: owner }) } })));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/proyectos/${projectId}/codificacion/documentacion`;
  try {
    expect((await fetch(url, { method: 'POST' })).status).toBe(401);
    const headers = id => ({ Authorization: `Bearer ${jwt.sign({ id }, secret, { algorithm: 'HS256' })}`, 'Content-Type': 'application/json' });
    expect((await fetch(url, { method: 'POST', headers: headers('otro-usuario'), body: '{}' })).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    const response = await fetch(url, { method: 'POST', headers: headers(owner), body: JSON.stringify({ githubActions: true }) });
    expect(response.status).toBe(200);
    expect((await response.json()).categorias).toHaveLength(5);
    expect(generate).toHaveBeenCalledWith(projectId, { githubActions: true });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('conserva documentos y licencia originales de la última versión aprobada', () => {
  const artifact = (version, text) => ({ tipo: 'codigo_backend', version, aprobado: true, estado: 'aprobado', archivos: [
    { ruta: 'backend/README.md', contenido: text }, { ruta: 'backend/OPERATIONS.md', contenido: 'Operación original' }, { ruta: 'LICENSE', contenido: 'Licencia del titular' }
  ] });
  const result = new Generator().generar({ ...base(), artefactos: [artifact(1, 'Anterior'), artifact(2, 'Vigente')] });
  expect(result.archivos.find(file => file.ruta === 'documentation/repository/backend/README.md').contenido).toBe('Vigente');
  expect(result.archivos.find(file => file.ruta === 'documentation/repository/backend/OPERATIONS.md').contenido).toBe('Operación original');
  expect(result.archivos.find(file => file.ruta === 'documentation/LICENSE.md').contenido).toBe('Licencia del titular');
});

test('renderiza Markdown como contenido legible sin ejecutar HTML y conserva la fuente original', () => {
  const markdown = '# Invalidaciones CRUD\n\n**Contenido importante** con `Socket.IO`.\n\n- Primera opción\n- Segunda opción\n\n| Campo | Valor |\n| --- | --- |\n| Estado | Activo |\n\n```js\nconst ready = true;\n```\n\n<script>alert(1)</script>\n\n[Enlace malicioso](javascript:alert(1))\n\n[Operación](./OPERATIONS.md)';
  const result = new Generator().generar({ ...base(), artefactos: [{ tipo: 'codigo_backend', version: 1, aprobado: true, archivos: [
    { ruta: 'backend/CHANGE-EVENTS.md', contenido: markdown }, { ruta: 'backend/OPERATIONS.md', contenido: '## Operación\n\nTexto de operación.' }
  ] }] });
  const document = new JSDOM(result.html).window.document;
  const article = document.querySelector('.repository-document');
  expect(article.querySelector('.markdown-body h1').textContent).toBe('Invalidaciones CRUD');
  expect(article.querySelector('strong').textContent).toBe('Contenido importante');
  expect(article.querySelectorAll('.markdown-body li')).toHaveLength(2);
  expect(article.querySelector('.markdown-body table')).not.toBeNull();
  expect(article.querySelector('code.language-js').textContent).toContain('const ready');
  expect(document.querySelector('script, a[href^="javascript:"]')).toBeNull();
  expect(article.querySelector('.source-details pre').textContent).toBe(markdown);
  expect(article.querySelector('.markdown-body a').getAttribute('href')).toMatch(/^#repo-/);
  expect(result.archivos.find(file => file.ruta === 'documentation/repository/backend/CHANGE-EVENTS.md').contenido).toBe(markdown);
});

test('separa todos los requisitos por sus roles y no mezcla funciones de cliente y cocina', () => {
  const requirements = Array.from({ length: 8 }, (_, index) => ({ tipo: 'RF', aprobado: true, identificador: `RF-${index + 1}`, nombre: `Función ${index + 1}`, descripcion: 'Detalle del requisito.', actores: [index % 2 ? 'Cocinero' : 'Cliente'] }));
  requirements.push({ tipo: 'RF', aprobado: true, identificador: 'RF-09', nombre: 'Sin responsable' });
  const result = new Generator().generar({ proyecto: { nombre: 'Restaurante' }, requerimientos: requirements });
  expect(result.flujos.find(flow => flow.role === 'Cliente').steps.map(step => step.id)).toEqual(['RF-1', 'RF-3', 'RF-5', 'RF-7']);
  expect(result.flujos.find(flow => flow.role === 'Cocinero').steps.map(step => step.id)).toEqual(['RF-2', 'RF-4', 'RF-6', 'RF-8']);
  expect(result.flujos.find(flow => flow.pending).steps.map(step => step.id)).toEqual(['RF-09']);
  const document = new JSDOM(result.html).window.document;
  expect(document.querySelector('[data-role="Cliente"]').textContent).not.toContain('Función 2');
  expect(document.querySelector('[data-role="Cocinero"]').textContent).not.toContain('Función 1');
  expect(result.videos.filter(video => video.roleId === 'cliente').flatMap(video => video.steps.map(step => step.id))).toEqual(['RF-1', 'RF-3', 'RF-5', 'RF-7']);
  expect(result.paginas).toHaveLength(5);
  expect(new JSDOM(result.paginas[0].html).window.document.querySelectorAll('main > section')).toHaveLength(1);
});

test('los permisos aprobados identifican roles aun cuando un requisito no trae actores', () => {
  const result = new Generator().generar({ proyecto: { nombre: 'Ventas' }, requerimientos: [{ tipo: 'RF', aprobado: true, identificador: 'RF-01', nombre: 'Consultar ventas' }], plan: { etapas: [{ etapa: 'control_acceso', estado: 'aprobada', propuesta: {
    roles: [{ id: 'vendedor', nombre: 'Vendedor' }], permisos: [{ operacion: 'RF-01', rol: 'vendedor', metodos: ['GET'] }]
  } }] } });
  expect(result.flujos).toHaveLength(1);
  expect(result.flujos[0]).toMatchObject({ role: 'Vendedor', steps: [{ id: 'RF-01', actions: ['Consultar'] }] });
});

test('los recorridos largos generan varios clips sin perder funciones ni mezclarlos con otros roles', () => {
  const requirements = Array.from({ length: 9 }, (_, index) => ({ tipo: 'RF', aprobado: true, identificador: `RF-${index + 1}`, nombre: `Función ${index + 1}`, actores: ['Cliente'] }));
  const result = new Generator().generar({ proyecto: { nombre: 'Demo' }, requerimientos: requirements });
  const clips = result.videos.filter(video => video.roleId === 'cliente');
  expect(clips.map(clip => clip.steps.length)).toEqual([4, 4, 1]);
  expect(clips.flatMap(clip => clip.steps.map(step => step.id))).toEqual(requirements.map(requirement => requirement.identificador));
  expect(result.flujos[0].steps).toHaveLength(9);
});
