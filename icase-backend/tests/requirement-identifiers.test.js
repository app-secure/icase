const normalize = require('../src/core/services/RequirementIdentifiers');
test('normaliza nuevas generaciones y referencias sin modificar citas ni necesidades', () => {
  const result = normalize({ requerimientos: [{ identificador: 'RF-N-01', tipo: 'RF', evidencias: [{ texto: 'RF-N-01' }], necesidades_origen: ['N-01'] }, { identificador: 'RNF-19', tipo: 'RNF' }],
    auditoria_requisitos: { revision_semantica: { hallazgos: [{ requisitos_afectados: ['RF-N-01', 'RNF-19'] }] } } });
  expect(result.requerimientos.map(r => r.identificador)).toEqual(['RF-01', 'RNF-01']);
  expect(result.requerimientos[0].evidencias[0].texto).toBe('RF-N-01');
  expect(result.requerimientos[0].necesidades_origen).toEqual(['N-01']);
  expect(result.auditoria_requisitos.revision_semantica.hallazgos[0].requisitos_afectados).toEqual(['RF-01', 'RNF-01']);
});
test('no disimula identificadores duplicados', () => {
  const result = { requerimientos: [{ identificador: 'RF-1', tipo: 'RF' }, { identificador: 'RF-1', tipo: 'RF' }] };
  expect(normalize(result)).toBe(result);
});
test('la generación defectuosa advierte agrupación sin bloquear por palabras', () => {
  const Quality = require('../src/core/services/RequirementQualityService');
  const req = { identificador: 'RF-07', tipo: 'RF', nombre: 'Cobrar en efectivo o transferencia, cerrar caja y comprobar saldo', descripcion: 'Cobrar y cerrar caja', actores: ['Cajero'] };
  expect(new Quality().evaluate([req]).hallazgos).toContainEqual(expect.objectContaining({ codigo: 'OBJETIVOS_POSIBLEMENTE_AGRUPADOS', severidad: 'advertencia' }));
  const consultation = { ...req, nombre: 'Consultar registros con filtros y estados' };
  expect(new Quality().evaluate([consultation]).hallazgos.some(h => h.codigo === 'OBJETIVOS_POSIBLEMENTE_AGRUPADOS')).toBe(false);
});
