const { ruleApplies, canonicalGoals } = require('../src/core/services/NeedGranularity');

const stock = { necesidad: 'No permitir vender un producto sin stock suficiente ni un producto desactivado.' };
const precios = { necesidad: 'Un vendedor no puede cambiar precios ni anular ventas.' };

describe('reglas ligadas solo a las necesidades que afectan', () => {
  test('la regla de stock aplica a registrar una venta y no a productos, clientes ni usuarios', () => {
    expect(ruleApplies(stock, { necesidad: 'Registrar una venta seleccionando un cliente y agregando productos con cantidad.' })).toBe(true);
    for (const necesidad of [
      'Crear productos con código, nombre, categoría, precio de venta en soles y stock inicial.',
      'Consultar productos disponibles mostrando código, nombre, precio de venta en soles y stock disponible.',
      'Los vendedores pueden editar datos de clientes registrados.',
      'Gestionar usuarios: crear, editar y asignar roles (administrador o vendedor).',
      'Generar reporte de ventas por rango de fechas mostrando total vendido.'
    ]) expect(ruleApplies(stock, { necesidad })).toBe(false);
  });

  test('«un vendedor no puede cambiar precios ni anular ventas» aplica a editar productos y anular, no a clientes ni reportes', () => {
    expect(ruleApplies(precios, { necesidad: 'Editar productos: modificar nombre, categoría, precio de venta y stock.' })).toBe(true);
    expect(ruleApplies(precios, { necesidad: 'La administradora puede anular una venta indicando el motivo.' })).toBe(true);
    expect(ruleApplies(precios, { necesidad: 'Los vendedores pueden editar datos de clientes registrados.' })).toBe(false);
    expect(ruleApplies(precios, { necesidad: 'Generar reporte de ventas por rango de fechas.' })).toBe(false);
  });
});

describe('un solo formato de objetivo', () => {
  test('«O001» pasa a «O-01» y no choca con un «O-01» ya existente', () => {
    const out = canonicalGoals([
      { id: 'N001', tipo: 'RF', objetivo_id: 'O001' },
      { id: 'N010', tipo: 'RF', objetivo_id: 'O-01' },
      { id: 'N012', tipo: 'RF', objetivo_id: 'O-02' },
      { id: 'N039', tipo: 'RF', objetivo_id: 'O001' },
      { id: 'N002', tipo: 'regla_negocio', objetivos_relacionados: ['O001', 'O-02'] }
    ]);
    const goal = id => out.find(item => item.id === id).objetivo_id;
    expect(goal('N010')).toBe('O-01');
    expect(goal('N001')).toMatch(/^O-\d+$/);
    expect(goal('N001')).not.toBe('O-01');
    expect(goal('N001')).not.toBe('O-02');
    expect(goal('N039')).toBe(goal('N001'));
    expect(out.find(item => item.id === 'N002').objetivos_relacionados).toEqual([goal('N001'), 'O-02']);
  });

  test('si el número está libre se conserva: «O003» → «O-03»', () => {
    expect(canonicalGoals([{ id: 'N006', tipo: 'RF', objetivo_id: 'O003' }])[0].objetivo_id).toBe('O-03');
  });
});

describe('redacciones reales del análisis', () => {
  const sinStock = { necesidad: 'No permitir venta de producto sin stock suficiente.' };
  test('«No permitir venta de producto…» aplica a registrar la venta y no a productos, facturas ni anulaciones', () => {
    expect(ruleApplies(sinStock, { necesidad: 'Registrar una venta seleccionando cliente y agregando productos con cantidad.' })).toBe(true);
    for (const necesidad of [
      'Crear producto con código, nombre, categoría, precio de venta en soles y stock disponible (solo administrador).',
      'Consultar catálogo de productos con código, nombre, categoría, precio y stock disponible.',
      'Emitir factura interna con detalle de productos, vinculada a una venta única.',
      'Anular venta registrando motivo y revirtiendo el stock de todos los productos.'
    ]) expect(ruleApplies(sinStock, { necesidad })).toBe(false);
  });
  test('«actualizar» cuenta como cambiar: el vendedor no actualiza precios', () => {
    expect(ruleApplies({ necesidad: 'Vendedor no puede cambiar precios de productos.' }, { necesidad: 'Editar producto: actualizar nombre, categoría, precio de venta y stock.' })).toBe(true);
  });
});

describe('IDs nuevos con el estilo de los existentes', () => {
  const ids = require('../src/core/services/AnalysisIdentifiers');
  test('si la IA usa «N001», el siguiente es «N006»; si usa «N-01», «N-02»', () => {
    expect(ids([{ id: 'N001' }, { id: 'N005' }]).next('N')).toBe('N006');
    expect(ids([{ id: 'N-01' }]).next('N')).toBe('N-02');
  });
});

describe('insumo simple de Ventas', () => {
  const { refine } = require('../src/core/services/NeedGranularity');
  const ids = require('../src/core/services/AnalysisIdentifiers');
  test('«Gestionar X permitiendo crear, consultar, actualizar y eliminar» sigue siendo un solo RF completo', () => {
    const necesidad = 'Gestionar catálogo de productos permitiendo crear, consultar, actualizar y eliminar registros con código, nombre, precio de venta en soles y stock.';
    const out = refine([{ id: 'N005', tipo: 'RF', objetivo_id: 'O-05', necesidad, estado: 'confirmado', evidencia: 'Los productos tienen código, nombre, precio de venta en soles y stock.' }], 'Los productos tienen código, nombre, precio de venta en soles y stock.', ids([]), []);
    expect(out.map(item => item.necesidad)).toEqual([necesidad]);
  });
  test('«el vendedor solo consulta sus ventas» se liga a esa consulta y no a registrar, reportes ni autenticación', () => {
    const regla = { necesidad: 'Un vendedor solo puede consultar sus propias ventas; no tiene acceso a las ventas registradas por otros vendedores.' };
    expect(ruleApplies(regla, { necesidad: 'Permitir que el vendedor consulte sus propias ventas registradas sin acceso a las ventas de otros vendedores.' })).toBe(true);
    for (const necesidad of ['Registrar una venta seleccionando un cliente y agregando productos con cantidades.', 'Gestionar catálogo de productos con código, nombre y precio de venta en soles.', 'Generar reporte de ventas por rango de fechas mostrando el total vendido.', 'Autenticar el acceso según el rol.']) {
      expect(ruleApplies(regla, { necesidad })).toBe(false);
    }
  });
});
