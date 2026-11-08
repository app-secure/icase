const Validator = require('../src/infrastructure/services/DiagramSemanticValidatorService');
const ProcesarConIA = require('../src/core/use-cases/ProcesarConIA');

const rf = (identificador, nombre) => ({ identificador, nombre, tipo: 'RF', prioridad: 'Alta', aprobado: true });
const validar = (codigo, requisitos) => new Validator().validar({ tipo: 'clases_dominio', codigo, requisitos });

test('las propiedades y operaciones representan conceptos sin exigir clases independientes', () => {
  const result = validar('@startuml\nclass Cuenta {\n +int puntos\n +acumularPuntos(): void\n}\nclass Articulo {\n +float precio\n}\nCuenta -- Articulo\n@enduml', [rf('RF-1', 'Acumular puntos'), rf('RF-2', 'Modificar precio')]);
  expect(result.metricas.cobertura_conceptos_porcentaje).toBe(100);
  expect(result.advertencias).toEqual([]);
});

test('autenticación y copias no obligan a inventar entidades técnicas', () => {
  const result = validar('class Prestamo', [rf('RF-1', 'Autenticación JWT'), rf('RF-2', 'Gestionar copias de seguridad')]);
  expect(result.valido).toBe(true);
  expect(result.metricas.rf_transversales_no_exigen_entidad).toEqual(['RF-1', 'RF-2']);
});

test('una nota con palabras del RF no acredita cobertura; explica la incertidumbre', () => {
  const result = validar('class Prestamo\nclass Socio\nnote top of Socio : inventario\nSocio -- Prestamo', [rf('RF-1', 'Consultar préstamo'), rf('RF-2', 'Consultar inventario')]);
  expect(result.advertencias.join(' ')).toContain('RF-2');
  expect(result.advertencias.join(' ')).toContain('Consultar inventario');
  expect(result.advertencias.join(' ')).toContain('heurística');
});

test('la cobertura incierta del dominio solicita reparación acotada sin alterar otros tipos', () => {
  const service = new ProcesarConIA({ plantumlValidatorService: { validar: () => ({ valido: true, advertencias: ['Cobertura de dominio por verificar: RF-2 — Inventario'] }) } });
  const data = { diagramas: [{ tipo: 'clases_dominio', codigo_plantuml: '@startuml\nclass Cuenta\n@enduml' }] };
  expect(service._detectarProblemasDiagrama(data, 'clases_dominio', [], [])).toContain('RF-2');
});
