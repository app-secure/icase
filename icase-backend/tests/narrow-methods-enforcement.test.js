const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const GenericBackendGenerator = require('../src/infrastructure/services/GenericBackendGenerator');
const AccessControlService = require('../src/core/services/AccessControlService');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const GenerationCoverageService = require('../src/core/services/GenerationCoverageService');

const rf = (identificador, nombre) => ({ identificador, nombre, tipo: 'RF', aprobado: true });
const requirements = [rf('RF-04', 'Gestionar pedidos'), rf('RF-05', 'Consultar reportes')];
const generate = (verbosPorRf, extra = {}) => new GenericBackendGenerator().generate({
  proyecto: { nombre: 'Tienda' }, requirements, stack: { backend: 'Express', base_datos: 'PostgreSQL' }, verbosPorRf, ...extra
});
const fileOf = (files, ruta) => JSON.parse(files.find((file) => file.ruta === ruta).contenido);

describe('OpenAPI de operaciones con métodos reducidos', () => {
  test('una operación solo de consulta documenta únicamente GET y no publica la ruta por id', () => {
    const { paths } = fileOf(generate({ 'RF-05': ['consultar'] }), 'backend/openapi.json');
    expect(Object.keys(paths['/api/operations/rf-05'])).toEqual(['get']);
    expect(paths['/api/operations/rf-05/{id}']).toBeUndefined();
  });

  test('con PATCH sin DELETE documenta solo el PATCH por id', () => {
    const { paths } = fileOf(generate({ 'RF-04': ['consultar', 'editar'] }), 'backend/openapi.json');
    expect(Object.keys(paths['/api/operations/rf-04'])).toEqual(['get']);
    expect(Object.keys(paths['/api/operations/rf-04/{id}']).filter((key) => key !== 'parameters')).toEqual(['patch']);
  });

  test('comportamiento previo: sin verbos se documenta el CRUD completo', () => {
    const { paths } = fileOf(generate(), 'backend/openapi.json');
    expect(Object.keys(paths['/api/operations/rf-05'])).toEqual(expect.arrayContaining(['get', 'post']));
    expect(Object.keys(paths['/api/operations/rf-05/{id}'])).toEqual(expect.arrayContaining(['patch', 'delete']));
  });
});

describe('permisos recortados a los métodos de la operación', () => {
  const proposal = {
    autenticacion: { metodo: 'jwt', expiracion: '8h' },
    roles: [{ id: 'lector', nombre: 'Lector', incluir: true }],
    permisos: [{ operacion: 'RF-05', rol: 'lector', metodos: ['GET', 'POST', 'PATCH', 'DELETE'], alcance: 'todos' }]
  };

  test('un rol no recibe métodos que la operación no declara', () => {
    const policy = new AccessControlService().politica(proposal, [{ id: 'RF-05', key: 'rf-05', methods: ['GET'] }]);
    expect(policy.operaciones['rf-05'].lector).toEqual({ metodos: ['GET'], alcance: 'todos' });
  });

  test('comportamiento previo: sin methods en la operación se conservan los métodos del permiso', () => {
    const policy = new AccessControlService().politica(proposal, [{ id: 'RF-05', key: 'rf-05' }]);
    expect(policy.operaciones['rf-05'].lector.metodos).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
  });

  test('el backend generado publica la política recortada en el manifiesto', () => {
    const access = { ...proposal, permisos: [{ operacion: 'RF-05', rol: 'lector', metodos: ['GET', 'POST'], alcance: 'todos' }] };
    const manifest = fileOf(generate({ 'RF-05': ['consultar'] }, { access }), 'backend/icase.manifest.json');
    expect(manifest.auth.operaciones['rf-05'].lector.metodos).toEqual(['GET']);
  });
});

describe('verificación y cobertura con operaciones de solo consulta', () => {
  test('un backend con una operación solo GET sigue siendo apto estructuralmente', async () => {
    const result = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Tienda' }, versionesOrigen: {},
      insumos: { decisiones: { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } }, requerimientos: requirements, verbosPorRf: { 'RF-05': ['consultar'] } }
    });
    const verification = new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', archivos: result.archivos });
    expect(verification.errores || []).toEqual([]);
    expect(verification.estado).toBe('apta_estructuralmente');
  });

  const manifest = (methods) => ({ archivos: [{ ruta: 'backend/icase.manifest.json', contenido: JSON.stringify({ operations: [{ id: 'RF-05', key: 'rf-05', collectionPath: '/api/operations/rf-05', methods }] }) }] });
  test.each([
    ['sin GET', ['POST'], true],
    ['método desconocido', ['GET', 'TRACE'], true],
    ['sin métodos', [], true]
  ])('la verificación rechaza una operación %s', (_name, methods, fails) => {
    const result = new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', ...manifest(methods) });
    expect(result.errores.join(' ').includes('rf-05') || result.errores.join(' ').includes('RF-05')).toBe(fails);
  });

  const coverageContract = (methods) => ({ entities: [{ key: 'libro', name: 'Libro' }], operations: [{ id: 'RF-01', key: 'rf-01', entity: 'libro', methods }] });
  const requirement = { identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Consultar libros', descripcion: 'Ver libros' };
  const coverage = (methods) => {
    const service = new GenerationCoverageService();
    const declaration = { requisito: 'RF-01', tipo: 'crud', capacidades: [], confirmado: true, huella_requisito: service.huellaRequisito(requirement), justificacion: '' };
    return service.evaluar({ requisitos: [requirement], contrato: coverageContract(methods), declaracion: { requisitos: [declaration] } });
  };

  test('la cobertura no exige el ciclo CRUD completo, solo GET y métodos válidos', () => {
    const blockers = (methods) => (coverage(methods).bloqueos || coverage(methods).blockers || []).join(' ');
    expect(blockers(['GET'])).not.toContain('ciclo CRUD');
    expect(blockers(['POST'])).toContain('GET');
  });
});
