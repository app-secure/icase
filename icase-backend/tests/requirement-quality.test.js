const Quality = require('../src/core/services/RequirementQualityService');
const Approval = require('../src/core/services/RequirementApprovalService');
const requirement = (overrides = {}) => ({ identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar registros',
  descripcion: 'El sistema permite consultar registros', actores: ['Operador'], necesidades_origen: ['N-01'],
  criterios_aceptacion: [{ descripcion: 'Se muestran los registros solicitados', necesidades_origen: ['N-01'] }], ...overrides });
const inventory = [{ id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Consultar registros', estado: 'confirmado' }];

test('detecta actores y plantillas con recomendaciones concretas sin bloquear', () => {
  const req = requirement({ actores: ['Usuario'], precondiciones: 'Sesión activa o acceso autorizado en el sistema',
    poscondiciones: 'Operación registrada y verificada conforme a la necesidad especificada' });
  const result = new Approval().evaluate([req], { version: 2, inventario: inventory });
  expect(result.bloqueado).toBe(false);
  expect(result.calidad.hallazgos.map(f => f.codigo)).toEqual(expect.arrayContaining(['ACTOR_GENERICO', 'PRECONDICION_GENERICA', 'POSCONDICION_GENERICA']));
  expect(result.calidad.hallazgos.every(f => f.accion_propuesta && f.requisito === 'RF-01')).toBe(true);
});

test('señala sesión previa para login como revisión, no prohíbe reautenticación', () => {
  const findings = new Quality().evaluate([requirement({ nombre: 'Iniciar sesión', precondiciones: 'Sesión activa' })]).hallazgos;
  expect(findings.find(f => f.codigo === 'AUTENTICACION_CIRCULAR').severidad).toBe('advertencia');
});

test('un solo criterio observable es válido; copia exacta produce advertencia', () => {
  expect(new Quality().evaluate([requirement()]).hallazgos).toEqual([]);
  expect(new Quality().evaluate([requirement({ criterios_aceptacion: [{ descripcion: 'Consultar registros' }] })]).hallazgos[0].codigo).toBe('CRITERIOS_REPETITIVOS');
});

test('construye vínculos declarados sin inferirlos por coincidencias de palabras', () => {
  const related = [...inventory,
    { id: 'N-02', tipo: 'regla_negocio', estado: 'confirmado', objetivos_relacionados: ['O-01'] },
    { id: 'N-03', tipo: 'restriccion_tecnica', estado: 'pendiente', objetivos_relacionados: ['O-01'] },
    { id: 'N-04', tipo: 'contexto', necesidad: 'Consultar registros' }];
  const result = new Quality().evaluate([requirement()], related);
  expect(result.vinculos[0].elementos_relacionados.map(n => n.id)).toEqual(['N-02', 'N-03']);
  expect(result.vinculos[0].elementos_relacionados[1].estado).toBe('pendiente');
});

test('referencia explícita a objetivo inexistente bloquea con causa precisa', () => {
  const result = new Approval().evaluate([requirement()], { version: 2, inventario: [...inventory,
    { id: 'N-02', tipo: 'regla_negocio', objetivos_relacionados: ['O-99'] }] });
  expect(result.bloqueado).toBe(true);
  expect(result.errores_criticos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'OBJETIVO_RELACIONADO_INVALIDO', necesidad: 'N-02' })]));
});

test('actor vacío y métrica pendiente advierten sin inventar valores ni modificar datos', () => {
  const reqs = [requirement({ actores: [] }), requirement({ identificador: 'RNF-01', tipo: 'RNF', metrica_medible: 'Por confirmar con el usuario' })];
  const before = JSON.stringify(reqs);
  const result = new Quality().evaluate(reqs);
  expect(result.hallazgos.map(f => f.codigo)).toEqual(expect.arrayContaining(['ACTOR_AUSENTE', 'METRICA_PENDIENTE']));
  expect(JSON.stringify(reqs)).toBe(before);
});
