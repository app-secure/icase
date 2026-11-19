const MockupVisualComposer = require('../src/infrastructure/services/MockupVisualComposer');
const MockupLayoutLinter = require('../src/infrastructure/services/MockupLayoutLinter');
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const pantalla = (slug, nombre, extra = {}) => ({ slug, nombre, shell: 'operaciones-web', plataforma: 'web', ...extra });
const kds = pantalla('kds', 'Pantalla KDS de comandas pendientes', { shell: 'kds-web' });
const manifiestoKds = [kds, pantalla('disp', 'Pantalla de disponibilidad de platos y marcación de agotados', { shell: 'kds-web' })];
const html = (contenido) => `<!DOCTYPE html><html><head></head><body><main>${contenido}</main></body></html>`;
const compuesto = (contenido, screen, manifest) => MockupVisualComposer.compose(html(contenido), { screen, manifest, identity: {}, name: 'Gestión de Restaurante' });

describe('pulido determinista del mockup compuesto', () => {
  test('el menú lateral y el título no repiten «Pantalla de»', () => {
    const resultado = compuesto('<h1 class="text-2xl">Pantalla KDS de comandas pendientes</h1>', kds, manifiestoKds);
    expect(resultado).toContain('>KDS de comandas pendientes</a>');
    expect(resultado).toContain('>Disponibilidad de platos y marcación de agotados</a>');
    expect(resultado).toContain('<h1 class="text-2xl">KDS de comandas pendientes</h1>');
    expect(resultado).not.toMatch(/>Pantalla (?:KDS )?de /);
  });

  test('un dato de solo lectura dentro de un párrafo se muestra como texto, no como campo', () => {
    const resultado = compuesto('<p>Hora creación: <input type="text" name="horaCreacion" value="12:30:15" readonly class="border-none font-medium w-24"></p>', kds, manifiestoKds);
    expect(resultado).toContain('<span class="font-medium">12:30:15</span>');
    expect(resultado).not.toContain('readonly');
  });

  test('los campos de formulario de solo lectura con etiqueta propia se conservan', () => {
    const resultado = compuesto('<div><label>Diferencia</label><input type="text" name="diferencia" value="0.00" readonly></div>', kds, manifiestoKds);
    expect(resultado).toContain('<input type="text" name="diferencia"');
  });

  test('los colores arbitrarios sin corchetes se normalizan para que Tailwind los aplique', () => {
    const resultado = compuesto('<select class="focus:ring-2 focus:ring-0b57d0 focus:border-0b57d0 bg-white p-100000 border-slate-200"></select>', kds, manifiestoKds);
    expect(resultado).toContain('focus:ring-[#0b57d0]');
    expect(resultado).toContain('focus:border-[#0b57d0]');
    expect(resultado).toContain('border-slate-200');
    expect(resultado).not.toContain('ring-0b57d0');
  });

  test('las pestañas móviles muestran el nombre completo en dos líneas, sin «…»', () => {
    const app = (slug, nombre) => ({ slug, nombre, shell: 'cliente-mobile', plataforma: 'mobile' });
    const manifiesto = [app('menu', 'Pantalla de menú digital'), app('reserva', 'Pantalla de reserva de mesa o silla'), app('compra', 'Pantalla de compra de paquetes semanales')];
    const resultado = MockupVisualComposer.compose(html('<h1>Menú</h1>'), { screen: manifiesto[0], manifest: manifiesto, identity: {}, name: 'App' });
    expect(resultado).toContain('>Reserva de mesa o silla</a>');
    expect(resultado).toContain('>Compra de paquetes semanales</a>');
    expect(resultado).not.toContain('…');
  });
});

describe('coherencia entre el texto del botón y su operación', () => {
  const avisos = (boton) => new MockupLayoutLinter().analizar(compuesto(`<h1>x</h1>${boton}`, kds, manifiestoKds), { screen: kds }).filter((item) => item.codigo === 'accion_incoherente');

  test('un botón de escritura que solo consulta se señala', () => {
    expect(avisos('<button data-accion="RF-06.consultar">Marcar lista</button>')).toHaveLength(1);
    expect(avisos('<button data-accion="RF-03.crear">Ver paquetes</button>')).toHaveLength(1);
    expect(avisos('<button data-accion="RF-09.eliminar">Aceptar</button>')).toHaveLength(1);
  });

  test('los textos que corresponden a la operación no generan aviso', () => {
    expect(avisos('<button data-accion="RF-06.consultar">Ver detalle</button>')).toEqual([]);
    expect(avisos('<button data-accion="RF-03.crear">Comprar paquete</button>')).toEqual([]);
    expect(avisos('<button data-accion="RF-09.eliminar">Cancelar reserva</button>')).toEqual([]);
    expect(avisos('<button data-accion="ui">Actualizar</button>')).toEqual([]);
    expect(avisos('<button data-accion="RF-19.consultar">Actualizar lista</button>')).toEqual([]);
  });
});

describe('tipo de estructura según el nombre de la ruta', () => {
  const useCase = new GenerarMockups({});
  test('«Registro de pedido» no es una pantalla de acceso, pero el alta de cuenta sí', () => {
    expect(useCase._inferirShell(['Aplicación Móvil', 'Menú y Pedidos', 'Formulario de Registro de Pedido'])).not.toMatch(/^auth/);
    expect(useCase._inferirShell(['Aplicación Móvil', 'Acceso', 'Vista de Autenticación'])).toMatch(/^auth/);
    expect(useCase._inferirShell(['Aplicación Móvil', 'Formulario de registro de usuario'])).toMatch(/^auth/);
    expect(useCase._inferirShell(['Aplicación Web', 'Inicio de sesión'])).toMatch(/^auth/);
  });
});

describe('campos ocultos que completa el sistema', () => {
  test('se quitan los de sesión, estado, total, fechas e identificadores generados, y se conservan los demás', () => {
    const formulario = '<form data-accion="RF-17.crear"><select name="mesa_id"></select><input type="hidden" name="cliente_id" value="cli-204"><input type="hidden" name="usuario_id" value="cli-204"><input type="hidden" name="estado" value="pendiente"><input type="hidden" name="total" value="0"><input type="hidden" name="fechaHora" value=""><input type="hidden" name="comanda_id" value=""><input type="hidden" name="cobro_id" value=""><input type="hidden" name="origen" value="mesero"><button type="submit" data-accion="RF-17.crear">Registrar</button></form>';
    const resultado = compuesto(formulario, kds, manifiestoKds);
    for (const campo of ['cliente_id', 'usuario_id', 'estado', 'total', 'fechaHora', 'comanda_id', 'cobro_id']) expect(resultado).not.toContain(`name="${campo}"`);
    expect(resultado).toContain('name="mesa_id"');
    expect(resultado).toContain('type="hidden" name="origen"');
  });
});

describe('reglas contra identificadores internos, `name` suelto y fechas duplicadas', () => {
  const tabla = (cabeceras, filas) => `<table><thead><tr>${cabeceras.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${filas.map((fila) => `<tr>${fila.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  test('se quita la columna de identificadores internos y se conservan las demás', () => {
    const resultado = compuesto(tabla(['Número', 'Zona', 'Estado', 'Mesero Asignado ID', 'Acciones'], [['Mesa 01', 'Principal', 'Libre', 'usr-101', 'Ver'], ['Mesa 02', 'Terraza', 'Ocupada', 'usr-101', 'Ver']]), kds, manifiestoKds);
    expect(resultado).not.toContain('usr-101');
    expect(resultado).not.toContain('Mesero Asignado ID');
    expect(resultado).toContain('<th>Zona</th>');
    expect(resultado).toContain('<td>Terraza</td>');
    expect(resultado).toContain('<td>Ver</td>');
  });

  test('una tabla pequeña no pierde columnas aunque una se llame ID', () => {
    const resultado = compuesto(tabla(['ID', 'Nombre'], [['a-1', 'Mesa']]), kds, manifiestoKds);
    expect(resultado).toContain('<th>ID</th>');
  });

  test('`name` solo se conserva en elementos de formulario', () => {
    const resultado = compuesto('<span class="x" name="horaCreacion">13:15</span><input name="zona"><div name="y"></div>', kds, manifiestoKds);
    expect(resultado).toContain('<span class="x">13:15</span>');
    expect(resultado).toContain('<input name="zona">');
    expect(resultado).not.toContain('name="horaCreacion"');
    expect(resultado).not.toContain('<div name');
  });

  test('el linter señala identificadores internos y fechas idénticas, pero no códigos RF ni valores normales', () => {
    const avisos = (cuerpo) => new MockupLayoutLinter().analizar(`<html><body><div data-icase-kind="web">${cuerpo}</div></body></html>`, { screen: kds }).map((item) => item.codigo);
    expect(avisos('<table><tr><td>usr-101</td></tr></table>')).toContain('id_interno');
    expect(avisos('<table><tr><th>Cliente ID</th></tr></table>')).toContain('id_interno');
    expect(avisos('<p>RF-01</p><p>Mesa 04</p><p>Pedido #104</p>')).not.toContain('id_interno');
    expect(avisos('<input type="datetime-local" name="a" value="2026-11-18T19:30"><input type="datetime-local" name="b" value="2026-11-18T19:30">')).toContain('fechas_duplicadas');
    expect(avisos('<input type="datetime-local" name="a" value="2026-11-18T19:30"><input type="datetime-local" name="b" value="2026-11-18T21:00">')).not.toContain('fechas_duplicadas');
  });
});

describe('acceso y códigos mostrables', () => {
  test('los controles de una pantalla de acceso quedan como acciones de interfaz', () => {
    const login = { slug: 'login', nombre: 'Pantalla de inicio de sesión', shell: 'auth-web', plataforma: 'web' };
    const resultado = MockupVisualComposer.compose(html('<form data-accion="RF-10.crear"><button data-accion="RF-10.crear">Iniciar sesión</button></form>'), { screen: login, manifest: [login], identity: {}, name: 'App' });
    expect(resultado).not.toContain('RF-10');
    expect(resultado).toContain('data-accion="ui"');
  });

  test('un código de reserva largo se puede mostrar; un identificador corto no', () => {
    const avisos = (cuerpo) => new MockupLayoutLinter().analizar(`<html><body><div data-icase-kind="web">${cuerpo}</div></body></html>`, { screen: kds }).map((item) => item.codigo);
    expect(avisos('<p>RES-849202</p>')).not.toContain('id_interno');
    expect(avisos('<p>usr-101</p>')).toContain('id_interno');
  });
});
