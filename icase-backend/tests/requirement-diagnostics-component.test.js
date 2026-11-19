const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const file = path.resolve(__dirname, '../../icase-frontend/src/components/RequirementDiagnostics.jsx');
const sandbox = { module: { exports: {} }, require };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs' }).code, sandbox);
const Component = sandbox.module.exports.default;
const render = audit => renderToStaticMarkup(React.createElement(Component, { audit }));

test('auditoría antigua no se presenta como satisfactoria sin controles registrados', () => {
  expect(render(null)).toBe('');
  const html = render({});
  expect(html).toContain('sin comprobación registrada');
  expect(html).toContain('no completada o no registrada');
});

test('revisión parcial muestra categorías pendientes aunque no haya hallazgos', () => {
  const html = render({ revision_semantica: { estado: 'parcial', hallazgos: [], contraste_categorias: { pendientes: ['N-02'] } } });
  expect(html).toContain('parcial; faltan categorías');
  expect(html).toContain('Categorías por revisar: N-02');
});

test('revisión semántica ejecutada no oculta errores estructurales', () => {
  const html = render({ control_aprobacion: { bloqueado: true }, revision_semantica: { estado: 'completada', hallazgos: [] } });
  expect(html).toContain('con errores que impiden aprobar');
  expect(html).toContain('ejecutada; revisa sus hallazgos');
  expect(html).toContain('no certifica exhaustividad');
});

test('expone advertencias con causa y acción separadas de decisiones pendientes', () => {
  const html = render({ control_aprobacion: { bloqueado: false, calidad: { hallazgos: [
    { requisito: 'RF-01', codigo: 'ACTOR_GENERICO', severidad: 'advertencia', mensaje: 'Falta actor', accion_propuesta: 'Identifica el actor' }
  ] } }, preguntas_pendientes: [{ id: 'N-09', necesidad: 'Acordar frecuencia de respaldos' }] });
  expect(html).toContain('Falta actor');
  expect(html).toContain('Qué revisar: Identifica el actor');
  expect(html).toContain('Acordar frecuencia de respaldos');
  const dom = new JSDOM(html);
  expect(dom.window.document.querySelector('details[open] summary').textContent).toContain('Advertencias');
  dom.window.close();
});

test('distingue omisión inicial recuperada de pendientes al finalizar', () => {
  const html = render({ diagnostico_generacion: { lotes: [{ lote: 1, requisitos_recibidos: 1, necesidades_sin_referencia: ['N-02'] }], necesidades_pendientes: [] } });
  expect(html).toContain('0 necesidades sin referencia');
  expect(html).toContain('Sin referencia en la primera respuesta: N-02');
  expect(html).not.toContain('Pendientes al finalizar:');
});

test('muestra motivo de rechazo de corrección sin afirmar éxito', () => {
  const html = render({ diagnostico_refinamiento: { estado: 'parche_rechazado', problemas_introducidos: ['RF-02: cita inválida'], problemas_pendientes: ['Falta N-03'] } });
  expect(html).toContain('Cambio rechazado por introducir errores');
  expect(html).toContain('cita inválida');
  expect(html).toContain('Falta N-03');
});
