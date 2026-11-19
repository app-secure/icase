const CrossDiagramConsistencyValidatorService = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');

const validador = new CrossDiagramConsistencyValidatorService();
const casosUso = (etiquetas) => ({ tipo: 'casos_de_uso', aprobado: true, codigo_plantuml: `@startuml\n${etiquetas.map((etiqueta, index) => `usecase "${etiqueta}" as UC${index}`).join('\n')}\n@enduml` });
const arbol = (pantallas) => `@startwbs\n* Sistema\n** Aplicación Web Interna\n*** Módulo\n${pantallas.map((nombre) => `**** ${nombre}`).join('\n')}\n@endwbs`;
const omitidos = (etiquetas, pantallas) => validador.validarNavegacion(arbol(pantallas), [casosUso(etiquetas)]).metricas.elementos_origen_omitidos;

describe('consistencia entre casos de uso y árbol de navegación', () => {
  test('plurales, conjugaciones y sustantivos derivados del verbo no cuentan como elementos distintos', () => {
    expect(omitidos(['Comprar paquete semanal prepagado'], ['Pantalla de compra de paquetes semanales', 'Pantalla de inicio de sesión', 'Pantalla de menú'])).toEqual([]);
    expect(omitidos(['Visualizar comandas en KDS'], ['Pantalla KDS de cocina', 'Pantalla de cobros', 'Pantalla de menú'])).toEqual([]);
    expect(omitidos(['Reservar mesa o silla'], ['Pantalla de reserva de mesa o silla', 'Pantalla de cobros', 'Pantalla de menú'])).toEqual([]);
    expect(omitidos(['Consultar mesas asignadas'], ['Pantalla de mesas asignadas', 'Pantalla de cobros', 'Pantalla de menú'])).toEqual([]);
  });

  test('los conectores y las palabras genéricas de interfaz no inflan la comparación', () => {
    // «Pantalla de …» y «de/en/por» no deben contar como evidencia ni como ruido.
    expect(omitidos(['Validar reserva mediante QR'], ['Pantalla de validación de reserva mediante QR', 'Pantalla de cobros', 'Pantalla de menú'])).toEqual([]);
    expect(omitidos(['Cerrar sesión de caja'], ['Pantalla de cierre de caja', 'Pantalla de cobros', 'Pantalla de menú'])).toEqual([]);
  });

  test('lo que de verdad falta en el árbol se sigue señalando', () => {
    const resultado = omitidos(['Marcar plato como agotado', 'Reasignar mesas'], ['Pantalla KDS de cocina', 'Pantalla de reasignación de mesas', 'Pantalla de menú']);
    expect(resultado).toEqual(['Marcar plato como agotado']);
  });

  test('palabras que solo comparten un comienzo corto no se confunden', () => {
    // «pago» no es «paquete»; «mesa» no es «mesero».
    expect(omitidos(['Registrar pago'], ['Pantalla de paquetes', 'Pantalla de menú', 'Pantalla de usuarios'])).toEqual(['Registrar pago']);
    expect(omitidos(['Consultar mesas'], ['Pantalla de meseros', 'Pantalla de menú', 'Pantalla de usuarios'])).toEqual(['Consultar mesas']);
  });
});

describe('árbol de navegación vigente para el catálogo de mockups', () => {
  const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
  const caso = Object.create(GenerarMockups.prototype);
  const diagrama = (version, aprobado, pantalla, creado) => ({ tipo: 'arbol_navegacion', version, aprobado, createdAt: creado, codigo_plantuml: `@startwbs\n* Sistema\n** Aplicación Web\n*** Módulo\n**** ${pantalla}\n@endwbs` });

  test('con versiones anteriores desactualizadas, usa el árbol aprobado y no el más antiguo', () => {
    const diagramas = [diagrama(2, false, 'Pantalla vieja', '2026-11-15'), diagrama(3, false, 'Pantalla intermedia', '2026-11-17'), diagrama(5, true, 'Pantalla vigente', '2026-11-17')];
    const { pantallas } = caso._pantallasDelProyecto(diagramas);
    expect(JSON.stringify(pantallas)).toContain('vigente');
    expect(JSON.stringify(pantallas)).not.toContain('vieja');
  });

  test('sin ninguno aprobado, usa la versión más reciente', () => {
    const { pantallas } = caso._pantallasDelProyecto([diagrama(2, false, 'Pantalla vieja', '2026-11-15'), diagrama(3, false, 'Pantalla nueva', '2026-11-17')]);
    expect(JSON.stringify(pantallas)).toContain('nueva');
  });
});
