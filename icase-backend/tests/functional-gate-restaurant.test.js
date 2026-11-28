// Caso Restaurante: la puerta bloqueaba la entrega por «tiempo real» (generado con los eventos de cambios) y por el cierre de caja, y
// avisaba que las operaciones del cliente no tenían pantalla porque solo miraba la web.
const Report = require('../src/core/services/GenerationReportService');
const Gate = require('../src/core/services/FunctionalGateService');

const rf = (identificador, nombre) => ({ tipo: 'RF', aprobado: true, identificador, nombre });
const contrato = (extra = {}) => ({
  ...extra,
  entities: [{ key: 'pedido', name: 'Pedido' }, { key: 'cierre', name: 'CierreCaja' }],
  operations: [
    { id: 'RF-01', entity: 'pedido', actions: [{ name: 'listar', type: 'consulta' }], rules: [] },
    { id: 'RF-02', entity: 'cierre', actions: [{ name: 'cerrar', type: 'crear' }], rules: [{ tipo: 'solo_insercion' }] }
  ]
});
const requisitos = [rf('RF-01', 'Comandas actualizadas en tiempo real'), rf('RF-02', 'Registro de cierre de caja diaria')];

test('con eventos de cambios y cierres bloqueados no quedan requisitos «solo datos»', () => {
  const report = new Report().build({ requisitos, contrato: contrato({ eventos_cambios: { experimental: true } }) });
  expect(report.requisitos.map((item) => item.nivel)).toEqual(['completo', 'completo']);
});

test('sin eventos de cambios el tiempo real se sigue declarando pendiente', () => {
  const report = new Report().build({ requisitos, contrato: contrato() });
  expect(report.requisitos[0].nivel).toBe('solo_datos');
});

test('las pantallas de la app móvil cuentan como pantallas de sus operaciones', () => {
  const file = (ruta, value) => ({ ruta, contenido: JSON.stringify(value) });
  const result = new Gate().evaluar({ archivos: [
    file('backend/icase.manifest.json', { spec: {}, operations: [{ id: 'RF-01', actions: [{ name: 'crearPedidoCliente' }] }] }),
    file('frontend/icase.manifest.json', { pantallas: [] }),
    file('mobile/icase.manifest.json', { pantallas: [{ id: 'pedido', especificacion: { operaciones: ['crearPedidoCliente'] } }] })
  ] });
  expect(result.hallazgos.filter((item) => item.codigo === 'operacion_sin_pantalla')).toEqual([]);
});
