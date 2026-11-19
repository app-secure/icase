const { build } = require('../src/infrastructure/services/RequirementSourceContext');
const { inspectEvidence } = require('../src/infrastructure/services/SourceEvidence');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const ProcesarConIA = require('../src/core/use-cases/ProcesarConIA');

const sources = [
  { nombre_archivo: 'entrevista.txt', tipo: 'texto', tipo_contenido: 'Acta', descripcion: 'Usar Redis y Prisma', etiquetas: ['Redis'], metadatos_generados_ia: true, texto_transcrito: 'Gerente: Necesitamos reservar mesas.' },
  { nombre_archivo: 'operacion.txt', tipo: 'texto', descripcion: 'Operación diaria', texto_transcrito: 'Cajero: Necesito registrar cobros.' }
];

test('separa pistas sugeridas de contenidos originales por archivo', () => {
  const context = build(sources);
  expect(context.content).not.toMatch(/Redis|Prisma|pistas_contextuales/);
  expect(context.hints[0]).toMatchObject({ archivo: 'entrevista.txt', procedencia: 'sugeridos_por_ia', descripcion: 'Usar Redis y Prisma' });
  expect(inspectEvidence({ evidencia: 'Necesitamos reservar mesas.', evidencias: [{ texto: 'Necesitamos reservar mesas.', fuente: 'entrevista.txt' }] }, context.content).valido).toBe(true);
  expect(inspectEvidence({ evidencias: [{ texto: 'Necesito registrar cobros.', fuente: 'entrevista.txt' }] }, context.content).valido).toBe(false);
});

test('las citas simples no se acreditan desde metadatos antiguos ni desde otra fuente', () => {
  const legacy = '[Fuente enriquecida]\nArchivo: entrevista.txt\nDescripción aportada por el usuario: Usar Redis y Prisma\n[Contenido extraído]\nGerente: Necesitamos reservar mesas.';
  expect(inspectEvidence({ evidencia: 'Usar Redis y Prisma' }, legacy).invalid[0].codigo).toBe('evidencia_fuera_del_contenido_original');
  const report = new Coverage().inspectInventory([{ id: 'N-01', tipo: 'restriccion_tecnica', necesidad: 'Usar Redis y Prisma', estado: 'confirmado', evidencia: 'Usar Redis y Prisma' }], legacy);
  expect(report.invalid[0].errores).toContain('evidencia_fuera_del_contenido_original');
  expect(inspectEvidence({ evidencia: 'Necesitamos reservar mesas.' }, legacy).valido).toBe(true);
});

test('acepta evidencia estructurada de Gemini solo si la cita pertenece al contenido y archivo', () => {
  const input = build(sources).content;
  const item = { id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Reservar mesas', estado: 'confirmado',
    evidencia: { texto: 'Necesitamos reservar mesas.', fuente: 'entrevista.txt' } };
  const valid = new Coverage().inspectInventory([item], input);
  expect(valid.invalid).toHaveLength(0);
  expect(valid.valid[0].evidencia).toBe('Necesitamos reservar mesas.');
  expect(valid.valid[0].evidencias[0].fuente).toBe('entrevista.txt');
  const wrongFile = new Coverage().inspectInventory([{ ...item, evidencia: { ...item.evidencia, fuente: 'operacion.txt' } }], input);
  expect(wrongFile.invalid[0].errores).toContain('evidencia_fuera_del_contenido_original');
  const metadataOnly = new Coverage().inspectInventory([{ ...item, evidencia: { texto: 'Usar Redis y Prisma', fuente: 'entrevista.txt' } }], input);
  expect(metadataOnly.invalid[0].errores).toContain('evidencia_no_localizada');
  expect(JSON.stringify(metadataOnly)).not.toContain('[object Object]');
});

test('una cita con elipsis exige que todos los fragmentos existan en la misma fuente', () => {
  const input = build([{ nombre_archivo: 'entrevista.txt', texto_transcrito: 'Primero se reservan mesas. Luego se registran los pagos.' }]).content;
  expect(inspectEvidence({ evidencia: 'Primero se reservan mesas. ... Luego se registran los pagos.' }, input).valido).toBe(true);
  expect(inspectEvidence({ evidencia: 'Primero se reservan mesas. / Luego se registran los pagos.' }, input).valido).toBe(true);
  expect(inspectEvidence({ evidencia: 'Primero se reservan mesas. ... Se inventa una confirmación.' }, input).valido).toBe(false);
  const split = build([{ nombre_archivo: 'uno.txt', texto_transcrito: 'Primero se reservan mesas.' },
    { nombre_archivo: 'dos.txt', texto_transcrito: 'Luego se registran los pagos.' }]).content;
  expect(inspectEvidence({ evidencia: 'Primero se reservan mesas. ... Luego se registran los pagos.' }, split).invalid[0].codigo).toBe('evidencia_fuentes_distintas');
});

test('un insumo adicional explícito conserva su propio origen citable', () => {
  const input = `${build(sources).content}\n\n[Insumo adicional]\nUsuario: El respaldo será diario.`;
  expect(inspectEvidence({ evidencias: [{ texto: 'El respaldo será diario.', fuente: 'insumo_directo' }] }, input).valido).toBe(true);
  expect(inspectEvidence({ evidencias: [{ texto: 'El respaldo será diario.', fuente: 'operacion.txt' }] }, input).valido).toBe(false);
});

test('las pistas se envían solo a la extracción, no se repiten en la redacción', async () => {
  const context = build([sources[0]]);
  const need = { id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Reservar mesas', estado: 'confirmado', evidencia: 'Necesitamos reservar mesas.' };
  const draft = { identificador: 'RF-01', tipo: 'RF', nombre: 'Reserva', descripcion: 'El sistema DEBE permitir reservar mesas.', necesidades_origen: ['N-01'], evidencia: need.evidencia };
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [need] }).mockResolvedValueOnce({ requerimientos: [draft] });
  await new Coverage().generate({ input: context.content, prompt: 'Analiza las fuentes', sourceHints: context.hints, request });
  expect(request.mock.calls[0][0]).toContain('Usar Redis y Prisma');
  expect(request.mock.calls[1][0]).not.toContain('Usar Redis y Prisma');
  expect(request.mock.calls[1][1].promptGroq).not.toContain('Usar Redis y Prisma');
});

test('el backend usa fuentes guardadas en vez del texto duplicado enviado por navegador', async () => {
  let received;
  const instance = new ProcesarConIA({
    proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'project', nombre: 'Proyecto', insumo_bruto: 'texto previo', estado_fase: 'analisis_pendiente' })) },
    fuenteRepository: { listarPorProyecto: jest.fn(async () => sources) },
    estandarRepository: { obtenerEstandares: jest.fn(async () => []) },
    requerimientoRepository: { listarPorProyecto: jest.fn(async () => []) },
    diagramaRepository: { listarPorProyecto: jest.fn(async () => []) },
    aiOrchestratorService: { procesar: jest.fn(async payload => { received = payload; throw new Error('capturado'); }) }
  });
  await expect(instance.ejecutar({ proyectoId: 'project', objetivo: 'requisitos', insumoBrutoInput: 'texto duplicado del navegador' })).rejects.toThrow('capturado');
  expect(received.insumo_bruto).toBe(build(sources).content);
  expect(received.insumo_bruto).not.toContain('texto duplicado del navegador');
  expect(received.pistas_fuentes).toHaveLength(2);
});
