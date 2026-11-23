const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const BusinessRuleService = require('../src/core/services/BusinessRuleService');

const model = new DomainModelExtractor().extract(`@startuml
class Venta {
  +String id
  +Decimal total
}
class Factura {
  +String id
  +String numero
  +Decimal subtotal
  +Decimal igv
  +Decimal total
}
Venta "1" -- "0..1" Factura : genera
@enduml`);
const requerimientos = [{ aprobado: true, tipo: 'RF', identificador: 'RF-03', nombre: 'Emitir factura interna', descripcion: 'La factura incluye subtotal, IGV del 18% y total; una venta solo puede tener una factura.' }];
const validar = (reglas) => new BusinessRuleService().validar(reglas, { entidades: model.entities, requerimientos });
const base = { entidad: 'Factura', rf: ['RF-03'], origen: 'explicito', estado_decision: 'confirmado', evidencia: 'IGV del 18%' };

test('una fórmula en texto con porcentaje («subtotal * 18%») se acepta como cálculo', () => {
  const result = validar([{ ...base, id: 'RN-1', tipo: 'calculo', campo: 'igv', expresion: 'subtotal * 18%', mensaje: 'IGV 18 %' }]);
  expect(result.descartadas || result.errores || []).toEqual([]);
  expect(result.reglas[0].expresion).toEqual({ op: '*', izquierda: { campo: 'subtotal' }, derecha: 0.18 });
});

test('«total = subtotal + igv» como texto se acepta', () => {
  const result = validar([{ ...base, id: 'RN-2', tipo: 'calculo', campo: 'total', expresion: 'total = subtotal + igv', mensaje: 'total' }]);
  expect(result.reglas[0].expresion).toEqual({ op: '+', izquierda: { campo: 'subtotal' }, derecha: { campo: 'igv' } });
});

test('una venta solo puede tener una factura: único sobre la referencia', () => {
  const result = validar([{ ...base, entidad: 'Venta', id: 'RN-3', tipo: 'unico', campo: 'factura_id', mensaje: 'Una venta solo puede tener una factura.', evidencia: 'una venta solo puede tener una factura' }]);
  expect(result.reglas.map((rule) => rule.id)).toContain('RN-3');
});

describe('reglas «requerido» que son condicionales', () => {
  const BusinessRuleService = require('../src/core/services/BusinessRuleService');
  const entidades = [{ name: 'Venta', key: 'venta', schema: { properties: { motivo_anulacion: { type: 'string' }, total: { type: 'number' } } } }];
  const requerimientos = [{ tipo: 'RF', identificador: 'RF-03', nombre: 'Anular venta', descripcion: 'Anular una venta indicando motivo', aprobado: true }];
  const regla = (mensaje) => ({ id: 'RN-15', tipo: 'requerido', entidad: 'Venta', campo: 'motivo_anulacion', mensaje, rf: ['RF-03'], evidencia: 'indicando motivo', origen: 'explicito', estado_decision: 'confirmado' });
  test('«obligatorio cuando se anula» no se exige al crear la venta', () => {
    const { reglas } = new BusinessRuleService().validar([regla('El motivo de anulación es obligatorio cuando se anula una venta.')], { entidades, requerimientos });
    expect(reglas[0].estado_decision).toBe('rechazado');
  });
  test('una regla «requerido» sin condición sigue confirmada', () => {
    const { reglas } = new BusinessRuleService().validar([regla('El motivo de anulación es obligatorio.')], { entidades, requerimientos });
    expect(reglas[0].estado_decision).toBe('confirmado');
  });
});
