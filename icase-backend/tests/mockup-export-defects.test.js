const MockupActionRepair = require('../src/infrastructure/services/MockupActionRepair');
const MockupVisualComposer = require('../src/infrastructure/services/MockupVisualComposer');
const MockupBindingService = require('../src/infrastructure/services/MockupBindingService');

const requisitos = [
  { identificador: 'RF-06', tipo: 'RF', nombre: 'Visualizar comandas pendientes en KDS', descripcion: 'La cocina ve las comandas pendientes y las marca como listas.' },
  { identificador: 'RF-07', tipo: 'RF', nombre: 'Marcar platos agotados', descripcion: 'El cocinero marca la disponibilidad de platos y los marca como agotados.' },
  { identificador: 'RF-03', tipo: 'RF', nombre: 'Comprar paquete semanal', descripcion: 'El cliente compra un paquete semanal prepagado.' },
  { identificador: 'RF-11', tipo: 'RF', nombre: 'Canjear puntos', descripcion: 'El cliente canjea puntos por recompensas.' }
];
const pantalla = (cuerpo) => `<html><body><main>${cuerpo}</main></body></html>`;

describe('acciones escritas sin el requisito', () => {
  const reparador = new MockupActionRepair();

  test('con un solo requisito en la pantalla se completa el prefijo', () => {
    const { html, reparadas } = reparador.reparar(pantalla('<button data-accion="crear">Comprar paquete</button>'), { rfs: ['RF-03'], requerimientos: requisitos });
    expect(html).toContain('data-accion="RF-03.crear"');
    expect(reparadas).toHaveLength(1);
  });

  test('con varios requisitos se elige el que coincide con el texto del botón, y el resto se deja', () => {
    const cuerpo = '<li>1x Lomo <button data-accion="editar">Agotar</button></li><div><button data-accion="consultar">Marcar lista</button></div><button data-accion="editar">Aceptar</button>';
    const { html } = reparador.reparar(pantalla(cuerpo), { rfs: ['RF-06', 'RF-07'], requerimientos: requisitos });
    expect(html).toContain('data-accion="RF-07.editar">Agotar');
    expect(html).toContain('data-accion="RF-06.consultar">Marcar lista');
    expect(html).toContain('data-accion="editar">Aceptar');
  });

  test('no toca acciones válidas ni de interfaz, ni requisitos que la pantalla no trata', () => {
    const cuerpo = '<button data-accion="RF-03.crear">Comprar</button><button data-accion="ui">Cancelar</button><button data-accion="editar">Guardar</button>';
    const { html, reparadas } = reparador.reparar(pantalla(cuerpo), { rfs: ['RF-99'], requerimientos: requisitos });
    expect(reparadas).toEqual([]);
    expect(html).toBe(pantalla(cuerpo));
  });
});

describe('defectos de los mockups exportados', () => {
  const screen = { slug: 'paquetes', nombre: 'Pantalla de mis paquetes', shell: 'cliente-mobile', plataforma: 'mobile' };
  const compuesto = (cuerpo) => MockupVisualComposer.compose(pantalla(cuerpo), { screen, manifest: [screen], identity: {}, name: 'App' });

  test('un indicador de tamaño w-1.5 con texto dentro se saca del círculo (causa del desborde en «Mis paquetes»)', () => {
    const resultado = compuesto('<span class="inline-flex"><span class="w-1.5 h-1.5 rounded-full bg-[#059669]">Activo</span></span>');
    expect(resultado).toContain('<span class="w-1.5 h-1.5 rounded-full bg-[#059669]"></span>Activo');
  });

  test('las etiquetas [RF-xx] y los puntos suspensivos finales de los botones no llegan a la pantalla', () => {
    const resultado = compuesto('<p>Historial de acumulación [RF-11]</p><span>Al día [RF-11, RF-03]</span><button data-accion="ui">Guardar…</button><button data-accion="ui">Eliminar...</button>');
    expect(resultado).not.toContain('[RF-');
    expect(resultado).toContain('>Historial de acumulación</p>');
    expect(resultado).toContain('>Guardar</button>');
    expect(resultado).toContain('>Eliminar</button>');
  });

  test('las fechas dd/mm/aaaa se convierten al formato que aceptan los campos date y datetime-local', () => {
    const resultado = compuesto('<input type="date" name="a" value="01/11/2026"><input type="datetime-local" name="b" value="18/11/2026 13:30"><input type="date" name="c" value="2026-11-18"><input type="text" name="d" value="01/11/2026">');
    expect(resultado).toContain('name="a" value="2026-11-01"');
    expect(resultado).toContain('name="b" value="2026-11-18T13:30"');
    expect(resultado).toContain('name="c" value="2026-11-18"');
    expect(resultado).toContain('name="d" value="01/11/2026"');
  });

  test('un select oculto con identificadores de relleno se quita', () => {
    const resultado = compuesto('<form><input type="hidden" name="disponible" value="false"><select name="menudigital_id" class="hidden"><option>menu-01</option></select><button type="submit" data-accion="ui">Guardar</button></form>');
    expect(resultado).not.toContain('menudigital_id');
    expect(resultado).toContain('name="disponible"');
  });
});

describe('contrato que ve el modelo', () => {
  test('separa lo que captura la persona de lo que completa el sistema', () => {
    const contrato = { operations: [{ id: 'RF-16', schema: { properties: { importe: {}, medioPago: {}, usuario_id: {}, fechaHora: { type: 'string' }, ultimaActualizacion: {}, estado: { type: 'string' } } } }] };
    const texto = new MockupBindingService().describirOperaciones({ requerimientos: [{ identificador: 'RF-16', tipo: 'RF' }], contrato });
    expect(texto).toContain('campos que captura la persona: importe, medioPago');
    expect(texto).toMatch(/NO los pongas[^:]*: usuario_id, ultimaActualizacion, estado/);
  });
});

describe('menú por rol y evidencia de los botones enlazados', () => {
  const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
  const web = (slug, nombre, roles, extra = {}) => ({ slug, nombre, shell: 'operaciones-web', plataforma: 'web', roles, ...extra });
  const manifiesto = [web('mesas', 'Pantalla de mesas asignadas', ['Mesero']), web('pedido', 'Pantalla de registro de pedido en mesa', ['Mesero']), web('cobros', 'Pantalla de registro de cobros', ['Cajero']), web('cierre', 'Pantalla de cierre de caja', ['Cajero'])];
  const compuesto = (screen) => MockupVisualComposer.compose('<html><body><main><h1>x</h1></main></body></html>', { screen, manifest: manifiesto, identity: {}, name: 'App' });

  test('el mesero y el cajero no comparten menú aunque estén en la misma estructura', () => {
    const mesero = compuesto(manifiesto[0]);
    expect(mesero).toContain('>Mesas asignadas</a>');
    expect(mesero).toContain('>Registro de pedido en mesa</a>');
    expect(mesero).not.toContain('Cierre de caja');
    const cajero = compuesto(manifiesto[2]);
    expect(cajero).toContain('>Cierre de caja</a>');
    expect(cajero).not.toContain('Mesas asignadas');
  });

  test('«Personal de Cocina» y «Cocinero» son el mismo rol; sin roles conocidos no se restringe', () => {
    const { sameNavigation } = MockupVisualComposer;
    expect(sameNavigation(web('a', 'A', ['Personal de Cocina']), web('b', 'B', ['Cocinero']))).toBe(true);
    expect(sameNavigation(web('a', 'A', []), web('b', 'B', ['Cajero']))).toBe(true);
    expect(sameNavigation(web('a', 'A', ['Mesero']), { ...web('b', 'B', ['Mesero']), shell: 'admin-web' })).toBe(false);
  });

  test('un botón enlazado a un requisito compatible es evidencia aunque la pantalla no repita sus palabras', () => {
    const reqs = [{ identificador: 'RF-06', tipo: 'RF', nombre: 'Visualización de comandas en KDS', descripcion: 'Mostrar comandas nuevas y tiempo transcurrido', actores: ['Cocinero'] }];
    const mockup = { nombre_pantalla: 'kds', preview_code: '<main><h1>Tablero</h1><button>Marcar lista</button></main>', enlaces: [{ rf: 'RF-06', verbo: 'editar', estado: 'valido' }] };
    const pantalla = { slug: 'kds', nombre: 'Pantalla KDS', plataforma: 'web', roles: ['Personal de Cocina'] };
    const servicio = new Traceability();
    expect(servicio.enrichMockup(mockup, pantalla, reqs)).toEqual(['RF-06']);
    expect(servicio.enrichMockup({ ...mockup, enlaces: [{ rf: 'RF-06', verbo: 'editar', estado: 'invalido' }] }, pantalla, reqs)).toEqual([]);
    expect(servicio.enrichMockup(mockup, { ...pantalla, roles: ['Cajero'] }, reqs)).toEqual([]);
  });
});

describe('criterios de acción de un requisito', () => {
  const Cobertura = require('../src/infrastructure/services/MockupFunctionalCoverageService');
  const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
  const cobertura = new Cobertura();

  test('una acción que el requisito deja pendiente de definición no exige un botón', () => {
    const rf12 = { nombre: 'Modificación de precios del menú', descripcion: 'El sistema deberá actualizar los precios. Solo el administrador modifica precios; la posibilidad de eliminar ventas queda pendiente de definición., de modo que se aplican los nuevos precios.' };
    expect(cobertura.expectations(rf12).filter((criterio) => criterio.tipo === 'accion')).toEqual([]);
  });

  test('una acción explícita sí se exige, y la pantalla recibe el aviso en su contexto', () => {
    const rf05 = { identificador: 'RF-05', tipo: 'RF', nombre: 'Validación de reserva mediante QR', descripcion: 'Cuando el mesero utilice la interfaz web para escanear el código QR del cliente, el sistema deberá validar una reserva.' };
    expect(cobertura.expectations(rf05).filter((criterio) => criterio.tipo === 'accion').map((criterio) => criterio.valores[0])).toEqual(['escanear']);
    const casoUso = new GenerarMockups({});
    expect(casoUso._criteriosVisibles({ rf_trazabilidad: ['RF-05'] }, [rf05])).toBe('- Un botón o control con el texto «Escanear» (RF-05)');
    expect(casoUso._criteriosVisibles({ rf_trazabilidad: [] }, [rf05])).toBe('');
  });
});
