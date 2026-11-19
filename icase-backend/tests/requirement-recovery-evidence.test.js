const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const makeNeed = (id, text) => ({ id, tipo: 'RF', objetivo_id: `O-${id}`, estado: 'confirmado', necesidad: text, evidencia: text });
const needs = [makeNeed('N-01', 'Consultar registros'), makeNeed('N-02', 'Exportar registros')];
const input = needs.map(n => n.evidencia).join('. ');
const makeReq = (n, id) => ({ identificador: id, tipo: 'RF', nombre: n.necesidad, descripcion: n.necesidad,
  necesidades_origen: [n.id], criterios_aceptacion: [{ descripcion: n.necesidad, necesidades_origen: [n.id] }] });

test('recupera solo objetivos omitidos y conserva los requisitos correctos', async () => {
  const first = makeReq(needs[0], 'RF-01');
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: needs })
    .mockResolvedValueOnce({ requerimientos: [first] })
    .mockResolvedValueOnce({ requerimientos_corregidos: [makeReq(needs[1], 'RF-02')] });
  const result = await new Coverage().generate({ input, prompt: 'Genera', request });
  expect(result.requerimientos.map(r => r.identificador)).toEqual(['RF-01', 'RF-02']);
  expect(result.requerimientos[0]).toMatchObject(first);
  expect(result.requerimientos.every(r => r.evidencias.length === 1)).toBe(true);
  expect(result.auditoria_requisitos.diagnostico_generacion.necesidades_pendientes).toEqual([]);
  expect(request).toHaveBeenCalledTimes(3);
});

test('fallo al recuperar conserva el borrador y explica pendientes', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: needs })
    .mockResolvedValueOnce({ requerimientos: [makeReq(needs[0], 'RF-01')] })
    .mockRejectedValueOnce(new Error('Proveedor no disponible'));
  const result = await new Coverage().generate({ input, prompt: 'Genera', request });
  expect(result.requerimientos).toHaveLength(1);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.diagnostico_generacion.necesidades_pendientes).toEqual(['N-02']);
});

test('no hereda evidencia para referencias ajenas, mezcla de objetivos ni citas inventadas', () => {
  const service = new Coverage();
  for (const req of [
    { ...makeReq(needs[0], 'RF-01'), necesidades_origen: ['N-99'] },
    { ...makeReq(needs[0], 'RF-01'), necesidades_origen: ['N-01', 'N-02'] },
    { ...makeReq(needs[0], 'RF-01'), evidencia: 'Texto inventado' }
  ]) expect(service._preserveEvidence(req, needs, input)).toEqual(req);
});

test('conserva fragmentos separados, fuentes y offsets sin cambiar origen o decisión', () => {
  const n = { ...needs[0], evidencias: [{ texto: 'Consultar registros', fuente: 'a.txt' }, { texto: 'De acuerdo', fuente: 'a.txt' }] };
  const source = '[Fuente enriquecida]\nArchivo: a.txt\n[Contenido extraído]\nConsultar registros. De acuerdo';
  const result = new Coverage()._preserveEvidence({ ...makeReq(n, 'RF-01'), origen: 'explicito', requiere_confirmacion: true }, [n], source);
  expect(result.evidencias).toHaveLength(2);
  expect(result.evidencias.every(e => e.fuente === 'a.txt' && Number.isInteger(e.inicio))).toBe(true);
  expect(result.origen).toBe('explicito');
  expect(result.requiere_confirmacion).toBe(true);
});

test('reparación no puede borrar cobertura previa para incorporar otra necesidad', async () => {
  const first = { ...makeReq(needs[0], 'RF-01'), evidencia: 'Incorrecta' };
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: needs })
    .mockResolvedValueOnce({ requerimientos: [first] })
    .mockResolvedValueOnce({ eliminar_identificadores: ['RF-01'], requerimientos_corregidos: [makeReq(needs[1], 'RF-02')] });
  const result = await new Coverage().generate({ input, prompt: 'Genera', request });
  expect(result.requerimientos).toEqual([first]);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
});
