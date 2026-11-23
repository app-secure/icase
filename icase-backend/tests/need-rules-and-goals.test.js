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

describe('reglas del análisis simple de Ventas', () => {
  const needs = {
    registrar: 'Registrar una venta seleccionando cliente, agregando múltiples productos con cantidades, validando stock disponible para cada producto, calculando automáticamente subtotal e IGV al 18%, y guardando la venta con estado registrada.',
    stock: 'Decrementar automáticamente el stock de cada producto al registrar la venta según la cantidad vendida.',
    factura: 'Emitir factura después de registrar una venta con número correlativo automático, detalle de productos vendidos, subtotal, IGV calculado al 18% y total.',
    anular: 'Permitir que la administradora anule una venta registrada indicando el motivo, revirtiendo el stock y marcando la factura asociada como anulada.',
    propias: 'Permitir que un vendedor consulte el historial de sus propias ventas registradas sin acceso a ventas de otros vendedores.',
    alerta: 'Mostrar alerta a la administradora identificando productos con stock inferior a 5 unidades para facilitar decisiones de reposición.',
    reporteVentas: 'Generar reporte de ventas totales por rango de fechas seleccionado, visible solo para la administradora, mostrando monto total vendido en el período.',
    login: 'Autenticar usuarios mediante nombre de usuario y contraseña antes de acceder al sistema.'
  };
  const aplica = texto => Object.entries(needs).filter(([, necesidad]) => ruleApplies({ necesidad: texto }, { necesidad })).map(([clave]) => clave);
  test('stock insuficiente: solo al registrar la venta', () => {
    expect(aplica('No permitir la venta de un producto si la cantidad solicitada excede el stock disponible.')).toEqual(['registrar']);
  });
  test('una venta, una factura: a emitir y anular, no a registrar ni a consultar', () => {
    expect(aplica('Una venta solo puede tener una factura asociada.')).toEqual(['factura', 'anular']);
  });
  test('solo la administradora anula / ve el stock bajo / ve el reporte de ventas', () => {
    expect(aplica('Solo la administradora puede anular ventas; los vendedores no tienen permiso para esta operación.')).toEqual(['anular']);
    expect(aplica('Solo la administradora puede ver productos con stock bajo (menos de 5 unidades); los vendedores no tienen acceso a esta información.')).toEqual(['alerta']);
    const reporte = aplica('Solo la administradora puede acceder al reporte de ventas por rango de fechas; los vendedores no tienen acceso.');
    expect(reporte).toContain('reporteVentas');
    for (const clave of ['registrar', 'stock', 'factura', 'propias', 'login']) expect(reporte).not.toContain(clave);
  });
});

describe('referencias a objetivos', () => {
  test('«O2» en una regla apunta al objetivo «O-02» que ya existe, no a uno nuevo', () => {
    const out = canonicalGoals([
      { id: 'N2', tipo: 'RF', objetivo_id: 'O-02' },
      { id: 'N23', tipo: 'regla_negocio', objetivos_relacionados: ['O2'] }
    ]);
    expect(out[1].objetivos_relacionados).toEqual(['O-02']);
  });
  test('si el objetivo está en formato de la IA, la referencia sigue al convertido', () => {
    const out = canonicalGoals([
      { id: 'N2', tipo: 'RF', objetivo_id: 'O2' },
      { id: 'N23', tipo: 'regla_negocio', objetivos_relacionados: ['O2', 'O002'] }
    ]);
    expect(out[0].objetivo_id).toBe('O-02');
    expect(out[1].objetivos_relacionados).toEqual(['O-02']);
  });
});

describe('actor de un RF sin sujeto', () => {
  const { linkActors } = require('../src/core/services/NeedGranularity');
  const actors = [{ id: 'ACT1', nombre: 'Administrador', alias: ['Dueña', 'Administradora'] }, { id: 'ACT2', nombre: 'Vendedor', alias: ['Vendedora'] }];
  test('toma al actor que la cita nombra antes del verbo del RF', () => {
    const out = linkActors([
      { id: 'N2', tipo: 'RF', necesidad: 'Emitir una factura después de registrar una venta', evidencia: 'Después de registrar la venta, el vendedor emite la factura.' },
      { id: 'N3', tipo: 'RF', necesidad: 'Gestionar productos', evidencia: 'el administrador gestiona los productos y el vendedor los consulta' }
    ], actors);
    expect(out[0].actor_id).toBe('ACT2');
    expect(out[1].actor_id).toBe('ACT1'); // «el administrador gestiona los productos»: el vendedor solo los consulta
  });
});

describe('inicio de sesión', () => {
  const { refine } = require('../src/core/services/NeedGranularity');
  const ids = require('../src/core/services/AnalysisIdentifiers');
  const input = 'La autenticación será con JWT y el acceso por roles. Las contraseñas se guardarán cifradas.';
  const stack = { id: 'N20', tipo: 'restriccion_tecnica', necesidad: 'Usar JWT para la autenticación.', estado: 'confirmado', evidencia: 'La autenticación será con JWT y el acceso por roles.' };
  const venta = { id: 'N1', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Registrar una venta con varios productos', estado: 'confirmado', evidencia: 'Registrar una venta con varios productos' };
  test('si solo hay mención técnica, se añade el RF de autenticación con esa evidencia', () => {
    const out = refine([venta, stack], input, ids([[venta, stack]]), []);
    const auth = out.filter(item => item.tipo === 'RF' && /Autenticar/.test(item.necesidad));
    expect(auth).toHaveLength(1);
    expect(auth[0].evidencia).toBe(stack.evidencia);
    expect(auth[0].objetivo_id).toMatch(/^O-\d+$/);
  });
  test('si ya existe un RF de acceso, no añade otro', () => {
    const login = { id: 'N2', tipo: 'RF', objetivo_id: 'O-02', necesidad: 'Autenticar usuarios con credenciales', estado: 'confirmado', evidencia: 'x' };
    const out = refine([venta, stack, login], input, ids([[venta, stack, login]]), []);
    expect(out.filter(item => item.tipo === 'RF' && /utentic/.test(item.necesidad))).toHaveLength(1);
  });
  test('sin ninguna mención de acceso, no inventa el RF', () => {
    const out = refine([venta], 'Registrar una venta con varios productos', ids([[venta]]), []);
    expect(out.filter(item => /utentic/.test(item.necesidad))).toHaveLength(0);
  });
});

test('«vendedor autenticado» no cuenta como función de inicio de sesión', () => {
  const { refine } = require('../src/core/services/NeedGranularity');
  const ids = require('../src/core/services/AnalysisIdentifiers');
  const propias = { id: 'N6', tipo: 'RF', objetivo_id: 'O-04', necesidad: 'Consultar las ventas registradas por el vendedor autenticado, sin acceso a ventas de otros vendedores.', estado: 'confirmado', evidencia: 'Solo ve las ventas que él mismo registró.' };
  const jwt = { id: 'N20', tipo: 'restriccion_tecnica', necesidad: 'Usar JWT.', estado: 'confirmado', evidencia: 'La autenticación será con JWT.' };
  const out = refine([propias, jwt], 'La autenticación será con JWT.', ids([[propias, jwt]]), []);
  expect(out.filter(item => item.tipo === 'RF' && /^Autenticar/.test(item.necesidad))).toHaveLength(1);
});

describe('actores que el insumo declara ajenos al sistema', () => {
  const { normalizeActors } = require('../src/core/services/RequirementActors');
  test('«los clientes no usan el sistema» descarta al actor Cliente y conserva al resto', () => {
    const input = 'Yo y dos vendedores. Nadie más; los clientes no usan el sistema, solo los atendemos.';
    const nombres = normalizeActors([
      { nombre: 'Cliente', descripcion: 'x', evidencias: [{ texto: 'los clientes no usan el sistema', fuente: 'insumo_directo' }] },
      { nombre: 'Vendedor', evidencias: [{ texto: 'dos vendedores', fuente: 'insumo_directo' }] }
    ], input).map((actor) => actor.nombre);
    expect(nombres).toEqual(['Vendedor']);
  });
  test('el enlace por cita no toma al actor que solo aparece como dato («los clientes tienen nombre…»)', () => {
    const { linkActors } = require('../src/core/services/NeedGranularity');
    const actors = [{ id: 'A1', nombre: 'Vendedor' }, { id: 'A2', nombre: 'Cliente' }];
    const out = linkActors([{ id: 'N9', tipo: 'RF', necesidad: 'Gestionar clientes', evidencia: 'Los clientes tienen nombre y número de documento.' }], actors);
    expect(out[0].actor_id).toBeUndefined();
  });
});

describe('actor nombrado en la propia necesidad', () => {
  const { linkActors } = require('../src/core/services/NeedGranularity');
  const actors = [{ id: 'A1', nombre: 'Administradora', alias: ['Administrador'] }, { id: 'A2', nombre: 'Vendedor' }];
  test('«Permitir a la administradora…» y «…a cada vendedor…» enlazan a su actor', () => {
    const out = linkActors([
      { id: 'N3', tipo: 'RF', necesidad: 'Permitir a la administradora anular una venta', evidencia: 'x' },
      { id: 'N7', tipo: 'RF', necesidad: 'Permitir a cada vendedor consultar sus ventas', evidencia: 'x' }
    ], actors);
    expect(out.map((item) => item.actor_id)).toEqual(['A1', 'A2']);
  });
});
