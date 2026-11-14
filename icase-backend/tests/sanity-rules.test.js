const SanityRuleService = require('../src/core/services/SanityRuleService');
const BusinessRuleService = require('../src/core/services/BusinessRuleService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const plantuml = `@startuml
class Caja {\n+String id\n+DateTime fechaApertura\n+DateTime fechaCierre\n+float totalRecaudado\n}
class Plato {\n+String id\n+String nombre\n+float precio\n+boolean disponible\n}
class Mesa {\n+String id\n+int numero\n+String estado\n}
class Evento {\n+String id\n+Date fechaInicio\n+DateTime fechaFin\n}
@enduml`;
const model = new DomainModelExtractor().extract(plantuml);
const entidades = model.entities;
const rfPorEntidad = Object.fromEntries(entidades.map((entity) => [entity.key, ['RF-01']]));
const requerimientos = [{ identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Operar' }];

describe('reglas de sentido común', () => {
  const reglas = new SanityRuleService().derivar({ entidades, rfPorEntidad });
  const ids = reglas.map((regla) => regla.id);

  test('importes y cantidades no pueden ser negativos', () => {
    expect(ids).toContain('SEN-caja-totalRecaudado');
    expect(ids).toContain('SEN-plato-precio');
    expect(reglas.find((regla) => regla.id === 'SEN-plato-precio')).toMatchObject({ tipo: 'rango', min: 0, origen: 'inferido', estado_decision: 'pendiente', rf: ['RF-01'] });
  });

  test('la fecha de cierre no puede ser anterior a la de apertura', () => {
    expect(reglas.find((regla) => regla.tipo === 'comparacion')).toMatchObject({ entidad: 'Caja', campo: 'fechaCierre', operador: '>=', con_campo: 'fechaApertura' });
  });

  test('no inventa reglas para campos sin esa semántica ni compara fechas de formato distinto', () => {
    expect(ids).not.toContain('SEN-mesa-numero');
    expect(reglas.some((regla) => regla.entidad === 'Evento')).toBe(false);
    expect(reglas.some((regla) => regla.campo === 'nombre' || regla.campo === 'estado')).toBe(false);
  });

  test('todas las reglas propuestas son válidas para el motor de reglas', () => {
    const result = new BusinessRuleService().validar(reglas, { entidades, requerimientos });
    expect(result.errores).toEqual([]);
    expect(result.reglas).toHaveLength(reglas.length);
  });

  test('sin RF que sustenten la entidad no se propone nada', () => {
    expect(new SanityRuleService().derivar({ entidades, rfPorEntidad: {} })).toEqual([]);
  });
});

describe('la etapa de reglas incluye las de sentido común', () => {
  const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
  const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, version: 1, codigo_plantuml: plantuml };
  const rf = [
    { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Cerrar la caja' },
    { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Gestionar platos' }
  ];

  test('la propuesta inicial trae reglas SEN pendientes junto a las DOM', async () => {
    const { valor } = await new CodePlanningProposalService()._reglas_negocio({ requisitosAprobados: rf, diagramasAprobados: [dominio], plan: null, analisis: { reglas_negocio: [] }, inicial: true });
    const sen = valor.reglas.filter((regla) => regla.id.startsWith('SEN-'));
    expect(sen.map((regla) => regla.id).sort()).toEqual(['SEN-caja-fechaCierre-fechaApertura', 'SEN-caja-totalRecaudado', 'SEN-plato-precio']);
    expect(sen.every((regla) => regla.estado_decision === 'pendiente' && regla.rf.length > 0)).toBe(true);
    expect(valor.reglas.some((regla) => regla.id.startsWith('DOM-'))).toBe(true);
  });
});
