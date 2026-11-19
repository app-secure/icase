const { inspectEvidence, supportQuote } = require('../src/infrastructure/services/SourceEvidence');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Approval = require('../src/core/services/RequirementApprovalService');
const Entity = require('../src/core/entities/Requerimiento');
const Model = require('../src/infrastructure/database/schemas/RequerimientoSchema');

test('propuesta y confirmación son fragmentos separados con posiciones reales y fuente', () => {
  const input = '[Fuente enriquecida]\nArchivo: reunion.txt\nCategoría: Textos\n\n[Contenido extraído]\nAnalista: ¿Solo el supervisor autoriza?\nGerente: Sí, únicamente él.';
  const evidence = inspectEvidence({ evidencias: [{ texto: '¿Solo el supervisor autoriza?', fuente: 'reunion.txt', inicio: 0 }, { texto: 'Sí, únicamente él.', fuente: 'reunion.txt' }] }, input);
  expect(evidence.valido).toBe(true);
  for (const entry of evidence.valid) expect(input.slice(entry.inicio, entry.fin)).toBe(entry.texto);
  expect(evidence.valid[0].inicio).not.toBe(0);
  expect(inspectEvidence({ evidencias: [{ texto: '¿Solo el supervisor autoriza? Sí, únicamente él.' }] }, input).valido).toBe(false);
});

test('acepta el hablante o la puntuación final sobrante solo si el resto es literal y único', () => {
  const input = '[Fuente enriquecida]\nArchivo: entrevista_gerente.txt\n[contenido_original]\nGerente:\nSí. También debe poder reservar una mesa completa o una silla, comprar paquetes.\nAnalista:\nTambién podrán marcar un plato como agotado para que deje de aparecer.';
  expect(inspectEvidence({ evidencias: [{ texto: 'Gerente: También debe poder reservar una mesa completa o una silla.', fuente: 'entrevista_gerente.txt' }] }, input).valido).toBe(true);
  expect(inspectEvidence({ evidencias: [{ texto: 'y podrán marcar un plato como agotado.', fuente: 'entrevista_gerente.txt' }] }, input).valido).toBe(true);
  expect(inspectEvidence({ evidencias: [{ texto: 'Analista: ... comprar paquetes.', fuente: 'entrevista_gerente.txt' }] }, input).valido).toBe(false);
});
test('no acepta fuente ajena, elipsis, paráfrasis ni fragmentos ambiguos', () => {
  expect(inspectEvidence({ evidencias: [{ texto: 'Confirmado', fuente: 'otro.txt' }] }, 'Confirmado').valido).toBe(false);
  for (const texto of ['Cita [...] completa', 'Texto reformulado']) expect(inspectEvidence({ evidencias: [{ texto }] }, 'Cita original completa').valido).toBe(false);
  expect(inspectEvidence({ evidencias: [{ texto: 'Sí' }] }, 'Sí. Sí.').invalid[0].codigo).toBe('evidencia_ambigua');
});

test('recupera oraciones literales no contiguas como fragmentos del mismo archivo', () => {
  const first = 'Proponemos pantallas simples con botones claros y estados visibles.';
  const second = 'Los operadores usarán tabletas para realizar sus tareas diarias.';
  const input = `[Fuente enriquecida]\nArchivo: entrevista.txt\n\n[Contenido extraído]\n${first}\nPregunta: ¿Qué dispositivos utilizarán los operadores?\nRespuesta: ${second}`;
  const result = inspectEvidence({ evidencias: [{ texto: `${first} ${second}`, fuente: 'entrevista.txt' }] }, input);
  expect(result.valido).toBe(true);
  expect(result.valid).toHaveLength(2);
  expect(result.valid.map(e => e.fuente)).toEqual(['entrevista.txt', 'entrevista.txt']);
  for (const fragment of result.valid) expect(input.slice(fragment.inicio, fragment.fin)).toBe(fragment.texto);
  expect(result.valid[1].inicio).toBeGreaterThan(result.valid[0].fin);
  expect(inspectEvidence({ evidencia: `${second} ${first}` }, input).valido).toBe(false);
  expect(inspectEvidence({ evidencia: `${first} Los operadores utilizarán dispositivos móviles para todas sus actividades.` }, input).valido).toBe(false);
  const separateSources = `[Fuente enriquecida]\nArchivo: uno.txt\n\n[Contenido extraído]\n${first}\n[Fuente enriquecida]\nArchivo: dos.txt\n\n[Contenido extraído]\n${second}`;
  expect(inspectEvidence({ evidencia: `${first} ${second}` }, separateSources).valido).toBe(false);
  expect(inspectEvidence({ evidencia: `${first} ${second}` }, input + `\n${second}`).valido).toBe(false);
});

test('recupera la oración literal cuando la cita solo cambia una palabra', () => {
  const input = '[Fuente enriquecida]\nArchivo: entrevista.txt\n[contenido_original]\n¿Confirma que solamente el administrador podrá modificar precios, consultar reportes globales y gestionar usuarios?';
  const support = supportQuote({ necesidad: 'Solo el administrador puede modificar los precios.', evidencias: [{ texto: 'solo el administrador podrá modificar precios' }] }, input);
  expect(support.texto).toBe('¿Confirma que solamente el administrador podrá modificar precios, consultar reportes globales y gestionar usuarios?');
  expect(supportQuote({ necesidad: 'Otra cosa', evidencias: [{ texto: 'Texto reformulado' }] }, 'Cita original completa')).toBeNull();
  expect(supportQuote({ necesidad: 'Gestionar usuarios', evidencias: [{ texto: 'El administrador ... usuarios.' }] }, 'El administrador gestiona usuarios.')).toBeNull();
});
test('persiste múltiples evidencias y proyectos anteriores conservan defaults', () => {
  const evidencias = inspectEvidence({ evidencias: [{ texto: 'Consulta autorizada' }] }, 'Consulta autorizada').valid;
  const entity = new Entity({ proyecto_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', identificador: 'RF-1', nombre: 'Consulta', evidencias });
  const document = new Model(entity);
  expect(document.validateSync()).toBeUndefined();
  expect(document.toJSON().evidencias).toEqual(evidencias);
  expect(new Entity({}).evidencias).toEqual([]);
});

test('necesidad funcional rechazada por citación sigue pendiente y bloquea aprobación', async () => {
  const input = 'Consultar expedientes. Autorizar solicitudes.';
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [
    { id: 'N-1', tipo: 'RF', necesidad: 'Consultar', objetivo_id: 'O-1', estado: 'confirmado', evidencias: [{ texto: 'Consultar expedientes.' }] },
    { id: 'N-2', tipo: 'RF', necesidad: 'Autorizar', objetivo_id: 'O-2', estado: 'confirmado', evidencias: [{ texto: 'Cita inventada' }] }
  ] }).mockResolvedValueOnce(null).mockResolvedValueOnce({ requerimientos: [{ tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar', necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }], evidencias: [{ texto: 'Consultar expedientes.' }] }] });
  const result = await new Coverage().generate({ input, prompt: input, request });
  expect(result.auditoria_requisitos.necesidades_pendientes[0]).toMatchObject({ id: 'N-2', motivo: 'evidencia_incorrecta', estado_validacion: 'pendiente' });
  expect(result.auditoria_requisitos.necesidades_pendientes[0].historial).toHaveLength(2);
  expect(new Approval().evaluate(result.requerimientos, result.auditoria_requisitos).errores_criticos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'NECESIDAD_PENDIENTE_VALIDACION', necesidad: 'N-2' })]));
});
