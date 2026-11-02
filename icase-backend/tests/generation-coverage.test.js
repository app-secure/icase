const Coverage = require('../src/core/services/GenerationCoverageService');
const Registry = require('../src/core/services/GenerationCapabilityService');
const Report = require('../src/core/services/GenerationReportService');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');

const service = new Coverage();
const requirement = { identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Gestionar libros', descripcion: 'Registrar y consultar libros' };
const contract = { entities: [{ key: 'libro', name: 'Libro' }], operations: [
  { id: 'RF-01', key: 'rf-01', entity: 'libro', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
] };
const declaration = (rf = requirement, changes = {}) => ({
  requisito: rf.identificador, tipo: 'crud', capacidades: [], confirmado: true,
  huella_requisito: service.huellaRequisito(rf), justificacion: '', ...changes
});
const evaluate = (value = {}, requisitos = [requirement], contrato = contract) =>
  service.evaluar({ requisitos, contrato, declaracion: value });
const complete = (rf = requirement, changes = {}) => ({
  modo_entrega: 'completa', requisitos: [declaration(rf, changes)]
});
const artifact = (input) => ({ tipo: 'paquete_entrega', archivos: [
  { ruta: 'backend/icase.manifest.json', contenido: JSON.stringify(input.contrato) },
  { ruta: 'backend/GENERATION-REPORT.json', contenido: JSON.stringify({ fuente_cobertura: input }) }
] });

describe('contrato y compuerta de cobertura funcional', () => {
  test('el catálogo declara los diez módulos pendientes sin activarlos', () => {
    const registry = new Registry().catalogo();
    expect(registry).toHaveLength(10);
    expect(registry.every((item) => item.estado === 'no_soportado' && item.archivos_generados.length === 0)).toBe(true);
    expect(registry.find((item) => item.id === 'pagos').dependencias).toContain('integraciones');
  });

  test('una entidad y ausencia de palabras clave no certifican el alcance', () => {
    const result = evaluate();
    expect(result.exportable).toBe(false);
    expect(result.requisitos[0].estado).toBe('pendiente');
  });

  test('solo habilita alcance completo base tras declaración explícita del RF actual', () => {
    expect(evaluate(complete())).toMatchObject({ exportable: true, estado: 'alcance_base_cubierto' });
  });

  test('cambiar una descripción invalida su confirmación previa', () => {
    const result = evaluate(complete(), [{ ...requirement, descripcion: 'Ahora también admite reservas' }]);
    expect(result.exportable).toBe(false);
    expect(result.requisitos[0].confirmado).toBe(false);
  });

  test('no vincula una operación distinta por su posición en el arreglo', () => {
    const different = { ...contract, operations: [{ ...contract.operations[0], id: 'RF-99' }] };
    const report = new Report().build({ requisitos: [requirement], contrato: different, declaracion: complete() });
    expect(report.requisitos[0].entidad).toBeNull();
    expect(report.cobertura_funcional.exportable).toBe(false);
  });

  test('declarar un módulo pendiente no lo convierte en soportado', () => {
    const result = evaluate(complete(requirement, { capacidades: ['notificaciones'] }));
    expect(result.exportable).toBe(false);
    expect(result.bloqueos.join(' ')).toContain('notificaciones');
  });

  test('descartar una sugerencia necesita justificación explícita', () => {
    const rf = { ...requirement, nombre: 'Consultar el reporte almacenado' };
    expect(evaluate(complete(rf), [rf]).exportable).toBe(false);
    expect(evaluate(complete(rf, { justificacion: 'Solo se consulta un registro existente, no se exporta ni agrega.' }), [rf]).exportable).toBe(true);
  });

  test('un proceso personalizado sigue pendiente aunque no existan palabras detectadas', () => {
    expect(evaluate(complete(requirement, { tipo: 'personalizado' })).exportable).toBe(false);
  });

  test('una entrega parcial exige reconocer los pendientes', () => {
    expect(evaluate({ modo_entrega: 'parcial' }).exportable).toBe(false);
    expect(evaluate({ modo_entrega: 'parcial', aceptar_pendientes: true })).toMatchObject({ exportable: true, estado: 'pendiente' });
  });

  test.each([
    { modo_entrega: 'inventado' },
    { requisitos: [declaration(requirement, { capacidades: ['modulo_inexistente'] })] },
    { requisitos: [declaration(), declaration()] },
    { requisitos: [declaration(requirement, { huella_requisito: '' })] }
  ])('rechaza configuración incoherente %j', (value) => {
    expect(() => service.validar(value)).toThrow();
  });

  test('un contrato editado no puede reutilizar el informe previo', () => {
    const input = { requisitos: [requirement], contrato: contract, declaracion: complete() };
    const item = artifact(input);
    expect(service.exigirEntrega(item).exportable).toBe(true);
    item.archivos[0].contenido = JSON.stringify({ ...contract, operations: [] });
    expect(() => service.exigirEntrega(item)).toThrow('no corresponde');
  });

  test('evidencia Docker apta no permite aprobar una entrega funcionalmente incompleta', () => {
    const useCase = new GestionarArtefactosCodigo({});
    useCase.verifier.verificar = jest.fn(() => ({ estado: 'apta_estructuralmente', huella: 'hash' }));
    const item = artifact({ requisitos: [requirement], contrato: contract, declaracion: { modo_entrega: 'completa' } });
    item.verificacion = { huella: 'hash', estado: 'apta', nivel: 'ejecucion_aislada', protocolo_despliegue: 'compose-exportado-v1' };
    expect(() => useCase._exigirVerificacion(item)).toThrow('alcance pendiente');
  });
});
