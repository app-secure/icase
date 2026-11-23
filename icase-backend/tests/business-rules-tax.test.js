const BusinessRuleInferenceService = require('../src/infrastructure/services/BusinessRuleInferenceService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

// Regeneración de Ventas: la IA propuso «total = subtotal + igv» pero ninguna regla calculaba el IGV; la factura salía sin IGV ni total.
const modelo = new DomainModelExtractor().extract('@startuml\nclass Factura {\n+String id\n+Decimal subtotal\n+Decimal igv\n+Decimal total\n}\n@enduml');
const rf = [{ identificador: 'RF-02', tipo: 'RF', aprobado: true, nombre: 'Emitir factura interna con cálculo de IGV', descripcion: 'El sistema deberá calcular automáticamente el subtotal, aplicar IGV del 18% y calcular el total.' }];
const total = { tipo: 'calculo', entidad: 'Factura', campo: 'total', expresion: { op: '+', izquierda: { campo: 'subtotal' }, derecha: { campo: 'igv' } }, mensaje: 'El total es subtotal más IGV.', origen: 'inferido', rf: ['RF-02'] };

test('si el requisito dice «IGV del 18%», el IGV es el 18 % del subtotal, con evidencia literal', () => {
  const { reglas } = new BusinessRuleInferenceService({}).depurar([total], { modelo, rf });
  const igv = reglas.find((regla) => regla.campo === 'igv');
  expect(igv).toMatchObject({ tipo: 'calculo', entidad: 'Factura', expresion: { op: '*', izquierda: { campo: 'subtotal' }, derecha: 0.18 }, origen: 'explicito', estado_decision: 'confirmado' });
  expect(igv.evidencia).toContain('IGV del 18%');
  expect(reglas.find((regla) => regla.campo === 'total').expresion).toEqual({ op: '+', izquierda: { campo: 'subtotal' }, derecha: { op: '*', izquierda: { campo: 'subtotal' }, derecha: 0.18 } });
});

test('sin porcentaje en los requisitos no inventa la tasa', () => {
  const { reglas } = new BusinessRuleInferenceService({}).depurar([total], { modelo, rf: [{ ...rf[0], descripcion: 'Aplica el IGV que corresponda.' }] });
  expect(reglas.some((regla) => regla.campo === 'igv')).toBe(false);
});
