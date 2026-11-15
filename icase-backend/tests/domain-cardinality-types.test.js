const Quality = require('../src/infrastructure/services/DomainModelQualityService');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const Procesar = require('../src/core/use-cases/ProcesarConIA');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const quality = new Quality();
const code = `@startuml
class Cuenta {
+String id
+String email
+String passwordHash
+String rol
}
class Solicitante {
+String nombre
}
class Operador {
+String nombre
}
class Movimiento {
+float importe
+tiempoTranscurrido: DateTime
+DateTime fechaHora
}
Cuenta "1" -- "1" Solicitante
Cuenta "1" -- "1" Operador
Solicitante "1" -- "0..*" Movimiento
@enduml`;

test('detecta perfiles obligatorios simultáneos, sin imponer herencia o invalidar por heurística', () => {
  const result = quality.validar(code);
  expect(result.advertencias.join(' ')).toContain('Cuenta exige simultáneamente');
  expect(result.advertencias.join(' ')).toContain('Solicitante, Operador');
  expect(result.errores).toEqual([]);
  expect(new Validator().validar(code, { tipo: 'clases_dominio' }).valido).toBe(true);
});

test('perfiles opcionales no se diagnostican como obligatorios', () => {
  const result = quality.validar(code.replaceAll('"1" -- "1"', '"1" -- "0..1"'));
  expect(result.advertencias.join(' ')).not.toContain('exige simultáneamente');
});

test('distingue instantes de duraciones y dinero de mediciones reales', () => {
  const result = quality.validar(code.replace('+float importe', '+float importe\n+float temperatura'));
  expect(result.advertencias.join(' ')).toContain('Movimiento.importe usa float');
  expect(result.advertencias.join(' ')).toContain('Movimiento.tiempoTranscurrido usa DateTime');
  expect(result.advertencias.join(' ')).not.toMatch(/Movimiento\.(?:fechaHora|temperatura)/);
  const fixed = quality.validar(code.replace('+float importe', '+Decimal importe').replace('+tiempoTranscurrido: DateTime', '+tiempoTranscurridoSegundos: int'));
  expect(fixed.advertencias.join(' ')).not.toMatch(/Movimiento\./);
});

test('no cambia el contrato del extractor ni reescribe relaciones declaradas', () => {
  const before = new Extractor().extract(code);
  quality.validar(code);
  expect(new Extractor().extract(code)).toEqual(before);
  expect(before.relations[0]).toMatchObject({ fromCardinality: '1', toCardinality: '1' });
});

test('los avisos llegan a la reparación controlada de dominio, no a otros diagramas', () => {
  const service = new Procesar({ plantumlValidatorService: new Validator() });
  const data = { diagramas: [{ tipo: 'clases_dominio', codigo_plantuml: code }] };
  const problems = service._detectarProblemasDiagrama(data, 'clases_dominio', [], []);
  expect(problems).toContain('Cuenta exige simultáneamente');
  expect(problems).toContain('Movimiento.importe');
  const repairedPayload = service._payloadReparacion({ contexto_proyecto: {} }, data, 'clases_dominio', problems, 1);
  expect(repairedPayload.insumo_adicional).toContain('Conserva todos los elementos correctos');
  expect(repairedPayload.insumo_adicional).toContain(code);
});

test('el prompt efectivo contrasta reglas, historial, canales y eventos sin copiar clases del restaurante', () => {
  const model = new Modelos({ env: {} });
  const prompt = model.construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'clases_dominio', contextoActualTexto: 'RF-01: Solicitudes por portal y operador; conservar vigencia y condiciones aprobadas.' });
  for (const text of ['CARDINALIDADES RAZONADAS', 'ambos extremos', 'ACTORES, CUENTAS Y CANALES', 'REGLAS Y CICLO DE VIDA', 'CONSOLIDACIONES', 'Decimal importe', 'RF-01: Solicitudes por portal y operador']) expect(prompt).toContain(text);
  expect(prompt).not.toMatch(/PaquetePrepagado|CierreCaja|Cocinero|Comanda/);
  const useCases = model.construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'casos_de_uso' });
  expect(useCases).not.toContain('CARDINALIDADES RAZONADAS');
});

test('la generación recibe los criterios y condiciones aprobados, no solo nombres de casos', async () => {
  const model = new Modelos({ env: {} });
  model.construirPrompt = jest.fn(() => { throw new Error('detener antes de llamar a IA'); });
  await expect(model.procesar({
    objetivo: 'diagramas', tipo_diagrama: 'clases_dominio',
    contexto_proyecto: {
      requerimientos_aprobados: [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar solicitud',
        descripcion: 'Desde portal o mediante operador', actores: ['Solicitante', 'Operador'],
        criterios_aceptacion: [{ descripcion: 'Conservar la vigencia y el origen de cada uso.' }] }],
      analisis_requisitos: { reglas_negocio: [{ id: 'N-02', necesidad: 'No admitir intervalos incompatibles; conservar historial.', estado: 'confirmado' }] }
    }
  })).rejects.toThrow('detener antes de llamar a IA');
  const context = model.construirPrompt.mock.calls[0][0].contextoActualTexto;
  expect(context).toContain('Desde portal o mediante operador');
  expect(context).toContain('Solicitante, Operador');
  expect(context).toContain('Conservar la vigencia y el origen de cada uso.');
  expect(context).toContain('No admitir intervalos incompatibles; conservar historial.');
});
