const Models = require('../src/infrastructure/services/ModelosIaService');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Quality = require('../src/core/services/RequirementQualityService');
const normalize = (text, overrides = {}, needOverrides = {}) => {
  const need = { id: 'N-01', objetivo_id: 'O-01', tipo: 'RNF', estado: 'confirmado', necesidad: text, evidencia: text, ...needOverrides };
  const req = { identificador: 'RNF-01', nombre: 'Cualidad', descripcion: text, tipo: 'RNF', necesidades_origen: ['N-01'], evidencia: text,
    metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true, origen: 'inferido', ...overrides };
  return new Models().normalizarResultado({ requerimientos: [req] }, 'requisitos', null, { insumo: text,
    approvedAnalysis: { inventario: [need] } }).requerimientos[0];
};

test.each([
  'Se realizará una copia completa cada 24 horas. Se conservarán las últimas siete copias en almacenamiento separado.',
  'Al menos cuatro de cinco participantes completan sin ayuda las tareas habituales.',
  'Ante una caída, el tiempo máximo de recuperación es 1 hora. Se acepta una pérdida máxima de 24 horas.',
  'Las contraseñas no se almacenan ni se registran en texto claro.',
  'Las entradas inválidas se rechazan con mensajes comprensibles.'
])('conserva una condición aprobada verificable sin inventar cifras: %s', text => {
  const req = normalize(text);
  expect(req.metrica_medible).not.toContain('Por confirmar');
  expect(req.origen).toBe('explicito');
  expect(req.requiere_confirmacion).toBe(false);
  expect(req.estado_decision).toBe('confirmado');
});

test('admite notación numérica equivalente sin descartar una proporción escrita con palabras', () => {
  const req = normalize('Al menos cuatro de cinco participantes completan sin ayuda las tareas.', { metrica_medible: '4 de 5 participantes completan sin ayuda las tareas.' });
  expect(req.metrica_medible).toBe('4 de 5 participantes completan sin ayuda las tareas.');
});

test('el origen inferido no deshace una confirmación expresa del análisis aprobado', () => {
  const req = normalize('Las entradas inválidas se rechazan con mensajes comprensibles.', {}, { origen: 'inferido', estado: 'confirmado' });
  expect(req.origen).toBe('inferido');
  expect(req.requiere_confirmacion).toBe(false);
});

test('no da por acordado un umbral ausente ni elimina una pregunta abierta', () => {
  expect(normalize('Se requiere buena disponibilidad.').requiere_confirmacion).toBe(true);
  const req = normalize('El tiempo de respuesta debe ser menor a 5 segundos.', {}, { estado: 'pendiente' });
  expect(req.requiere_confirmacion).toBe(true);
});

test('el análisis aprobado no pasa por align ni pierde objetivos parecidos con distinto alcance', async () => {
  const align = jest.spyOn(require('../src/core/services/NeedGranularity'), 'align').mockImplementation(() => { throw new Error('No reclasificar aprobación'); });
  const needs = [
    { id: 'N-04', tipo: 'RF', objetivo_id: 'O-04', estado: 'confirmado', necesidad: 'Comprar planes prepagados con usos', evidencia: 'El cliente puede comprar planes prepagados con usos.' },
    { id: 'N-50', tipo: 'RF', objetivo_id: 'O-50', estado: 'confirmado', necesidad: 'Registrar cobros por los medios admitidos y comprobar usos cuando corresponda', evidencia: 'El cajero registra cobros por los medios admitidos y comprueba usos cuando corresponda.' }
  ];
  const approved = { aprobado: true, inventario: needs };
  const before = structuredClone(approved);
  try {
    const request = jest.fn(async prompt => ({ requerimientos: JSON.parse(prompt.split('CONTEXTO APROBADO DEL LOTE:\n')[1]).objetivos.map(n => ({ tipo: n.tipo, identificador: `RF-${n.id.slice(2)}`, nombre: n.necesidad, descripcion: `El sistema deberá ${n.necesidad}.`, necesidades_origen: [n.id], evidencia: n.evidencias[0].texto, criterios_aceptacion: [{ descripcion: `Comprobar ${n.necesidad}.`, necesidades_origen: [n.id] }] })) }));
    const result = await new Coverage().draftFromAnalysis({ input: needs.map(n => n.evidencia).join(' '), request }, approved);
    expect(result.requerimientos.flatMap(r => r.necesidades_origen)).toEqual(['N-04', 'N-50']);
    expect(result.auditoria_requisitos.inventario).toEqual(expect.arrayContaining(needs.map(n => expect.objectContaining({ id: n.id, tipo: n.tipo, objetivo_id: n.objetivo_id }))));
    expect(align).not.toHaveBeenCalled();
    expect(approved).toEqual(before);
  } finally { align.mockRestore(); }
});

test('un criterio genérico se advierte sin inventar operaciones nuevas', () => {
  const result = new Quality().evaluate([{ identificador: 'RF-01', tipo: 'RF', nombre: 'Gestionar recursos', descripcion: 'Gestionar recursos.', criterios_aceptacion: [{ descripcion: 'El responsable gestiona los recursos exitosamente.' }] }], []);
  expect(result.hallazgos.some(f => f.codigo === 'CRITERIO_NO_OBSERVABLE')).toBe(true);
});

test('el control final detecta omisiones aunque un intermediario devuelva un inventario reducido', () => {
  const need = { id: 'N-50', tipo: 'RF', objetivo_id: 'O-50', estado: 'confirmado', necesidad: 'Registrar cobros', evidencia: 'El cajero registra cobros.' };
  const result = new Models().normalizarResultado({ requerimientos: [], auditoria_requisitos: { version: 2, inventario: [] } }, 'requisitos', null,
    { approvedAnalysis: { inventario: [need] }, insumo: need.evidencia });
  expect(result.auditoria_requisitos.inventario).toEqual([need]);
  expect(result.auditoria_requisitos.control_aprobacion.errores_criticos).toContainEqual(expect.objectContaining({ codigo: 'NECESIDAD_NO_CUBIERTA', necesidad: 'N-50' }));
});
