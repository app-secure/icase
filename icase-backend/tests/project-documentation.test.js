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
