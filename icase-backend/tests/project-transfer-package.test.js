const P = require('../src/infrastructure/services/ProjectTransferPackage');
const projectId = '100000000000000000000001';
const sourceId = '100000000000000000000002';
const make = () => P.create({ ...Object.fromEntries(P.GROUPS.map(g => [g, []])),
  proyecto: [{ _id: projectId, nombre: 'Proyecto', usuario_id: '200000000000000000000001' }],
  fuentes: [{ _id: sourceId, proyecto_id: projectId, nombre_archivo: 'nota.txt', ruta_archivo: `files/${sourceId}`, texto_transcrito: 'Contenido original' }]
}, [{ id: sourceId, base64: Buffer.from('Contenido original').toString('base64') }], 'schema-test');
test('verifica recuentos y SHA de datos y originales, con informe Markdown', () => {
  const result = P.verify(JSON.stringify(make()), 'schema-test');
  expect(result.manifest.counts.fuentes).toBe(1);
  expect(result.report_markdown).toContain('# Verificación');
  expect(result.report_markdown).toContain('no es firma');
});
test('una edición o un original incompleto no se importan silenciosamente', () => {
  const data = make(); data.data.fuentes[0].texto_transcrito = 'Alterado';
  expect(() => P.verify(data, 'schema-test')).toThrow('integridad');
  const original = make(); original.files[0].base64 = Buffer.from('Otra cosa').toString('base64');
  expect(() => P.verify(original, 'schema-test')).toThrow('integridad');
});
test('rechaza versiones/esquemas incompatibles y secciones adicionales', () => {
  expect(() => P.verify(make(), 'otro-schema')).toThrow('esquemas');
  const data = make(); data.manifest.version = 99;
  expect(() => P.verify(data, 'schema-test')).toThrow('versión');
  const extra = make(); extra.data.usuarios = [];
  expect(() => P.verify(extra, 'schema-test')).toThrow('secciones');
});
test('no acepta referencias ajenas, duplicadas, rutas arbitrarias ni análisis ausentes', () => {
  for (const mutation of [
    b => { b.data.fuentes[0].proyecto_id = '900000000000000000000001'; },
    b => { b.data.fuentes[0]._id = projectId; },
    b => { b.data.fuentes[0].ruta_archivo = '../../.env'; },
    b => { b.data.proyecto[0].analisis_inicial_aprobado_id = sourceId; }
  ]) {
    const b = make(); mutation(b); b.manifest.data_sha256 = P.hash(b.data);
    expect(() => P.verify(b, 'schema-test')).toThrow();
  }
});
test('informe manipulado no determina integridad y no permite contaminación de prototipo', () => {
  const b = make(); b.report_markdown = 'TODO PERFECTO';
  expect(P.verify(b, 'schema-test').report_markdown).not.toContain('TODO PERFECTO');
  expect(() => P.verify(JSON.stringify(b).replace('"nombre":"Proyecto"', '"__proto__":{"admin":true},"nombre":"Proyecto"'), 'schema-test')).toThrow('claves');
  expect({}.admin).toBeUndefined();
});
