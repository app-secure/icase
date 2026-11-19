const Compatibility = require('../src/core/services/RequirementScreenCompatibility');
const MockupTraceabilityService = require('../src/infrastructure/services/MockupTraceabilityService');
const select = require('../src/infrastructure/services/MockupRequirementSelector');
const { compose } = require('../src/infrastructure/services/MockupVisualComposer');
const { systemManaged } = require('../src/infrastructure/services/MockupFieldPolicy');
const MockupBindingValidator = require('../src/infrastructure/services/MockupBindingValidator');

// Requisitos del proyecto de pruebas (restaurante).
const rf = (id, nombre, actores, descripcion = '') => ({ aprobado: true, tipo: 'RF', identificador: id, nombre, descripcion, actores: actores.split(',') });
const requisitos = [
  rf('RF-01', 'Visualización del menú digital', 'Cliente', 'Cuando el cliente acceda a la aplicación móvil, el sistema mostrará el menú.'),
  rf('RF-02', 'Reserva de mesa o silla', 'Cliente'),
  rf('RF-04', 'Consulta de mesas asignadas', 'Mesero'),
  rf('RF-05', 'Validación de reserva mediante QR', 'Mesero', 'Cuando el mesero utilice la interfaz web para escanear el código QR del cliente.'),
  rf('RF-08', 'Cierre de sesión de caja', 'Cajero'),
  rf('RF-10', 'Autenticación de usuarios', 'Cliente,Mesero,Cocinero,Cajero,Administrador'),
  rf('RF-13', 'Reasignación de mesas', 'Administrador'),
  rf('RF-06', 'Visualización de comandas en KDS', 'Cocinero')
];
const login = { pantalla_id: 'vista-de-autenticacion', nombre: 'Vista de Autenticación', modulo: 'Aplicación Móvil de Clientes', plataforma: 'mobile', roles: ['Cliente'] };
const reserva = { pantalla_id: 'formulario-de-reserva', nombre: 'Formulario de Reserva de Mesa o Silla', plataforma: 'mobile', roles: ['Cliente'] };
const servicio = new MockupTraceabilityService();

describe('un requisito solo se asocia a una pantalla donde su actor puede estar', () => {
  test('el cierre de sesión de caja no es autenticación; el login solo se asocia a RF-10', () => {
    const html = '<main><h1>Iniciar sesión</h1><form><input name="correo"><input type="password" name="clave"></form></main>';
    expect(servicio.enrichMockup({ nombre_pantalla: 'vista-de-autenticacion', preview_code: html }, login, requisitos)).toEqual(['RF-10']);
    // El resultado no depende de que el modelo dibuje un botón de caja.
    const conBoton = html.replace('</main>', '<button>Cierre de sesión de caja (demo)</button></main>');
    expect(servicio.enrichMockup({ nombre_pantalla: 'x', preview_code: conBoton }, login, requisitos)).toEqual(['RF-10']);
  });

  test('un formulario de contraseña evidencia la autenticación aunque no diga «sesión»', () => {
    const html = '<main><h1>GourmetFlow</h1><form><input name="correo"><input type="password" name="passwordHash"><button>Ingresar</button></form></main>';
    expect(servicio.enrichMockup({ nombre_pantalla: 'x', preview_code: html }, login, requisitos)).toEqual(['RF-10']);
  });

  test('la reserva del cliente no recibe requisitos del mesero ni del administrador por compartir «mesa» o «reserva»', () => {
    expect(servicio.buildManifest([reserva], requisitos)[0].rf_trazabilidad).toEqual(['RF-02']);
  });

  test('la plataforma que pide el requisito debe coincidir con la de la pantalla', () => {
    expect(Compatibility.check(requisitos[3], { roles: ['Mesero'], plataforma: 'mobile' })).toMatchObject({ compatible: false, motivo: expect.stringContaining('web') });
    expect(Compatibility.compatible(requisitos[3], { roles: ['Mesero'], plataforma: 'web' })).toBe(true);
    expect(Compatibility.compatible(requisitos[0], { roles: ['Cliente'], plataforma: 'mobile' })).toBe(true);
  });

  test('«Personal de Cocina» y «Cocinero» son el mismo rol; «Usuario» no restringe', () => {
    expect(Compatibility.compatible(requisitos[7], { roles: ['Personal de Cocina'] })).toBe(true);
    expect(Compatibility.compatible(requisitos[7], { roles: ['Mesero'] })).toBe(false);
    expect(Compatibility.compatible(requisitos[7], { roles: ['Usuario'] })).toBe(true);
    expect(Compatibility.compatible(requisitos[7], {})).toBe(true);
  });

  test('el selector del contexto de la IA no entrega todos los RF del rol ni los de otros roles', () => {
    expect(select(requisitos, [login]).map((item) => item.identificador)).toEqual(['RF-10']);
    expect(select(requisitos, [reserva]).map((item) => item.identificador)).toEqual(['RF-02']);
  });

  test('los avisos dicen por qué se quitó una referencia', () => {
    const resultado = servicio.validate({ manifest: [{ pantalla_id: 'reserva', nombre: 'Reserva', roles: ['Cliente'], plataforma: 'mobile' }], requirements: [requisitos[3]],
      mockups: [{ pantalla_id: 'reserva', nombre_pantalla: 'reserva', roles: ['Cliente'], plataforma: 'mobile', rf_trazabilidad: ['RF-05'], preview_code: '<main><h1>Reserva</h1><button>Escanear QR</button></main>' }] });
    expect(resultado.advertencias.join(' ')).toMatch(/RF-05 \(no corresponde a esta pantalla: lo ejecuta mesero/);
  });
});

describe('estructura de las pantallas móviles', () => {
  const nombres = ['Vista de Autenticación', 'Vista de Menú Digital con Precios y Disponibilidad', 'Vista de Detalle de Plato', 'Formulario de Registro de Pedido', 'Vista de Detalle y Estado del Pedido', 'Vista de Distribución de Mesas y Sillas Disponibles', 'Formulario de Reserva de Mesa o Silla', 'Vista de Paquetes Semanales y Compra', 'Vista de Puntos Acumulados'];
  const manifest = nombres.map((nombre, index) => ({ slug: `s${index}`, nombre, shell: nombre.includes('Autent') ? 'auth-mobile' : 'cliente-mobile', plataforma: 'mobile' }));
  const tabbar = (html) => html.match(/<nav class="icase-tabbar"[\s\S]*?<\/nav>/)[0];

  test('la barra inferior lista solo destinos de primer nivel, con etiquetas cortas', () => {
    const html = compose('<main><h1>Detalle</h1></main>', { screen: manifest[4], manifest, name: 'GourmetFlow' });
    const tabs = [...tabbar(html).matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]);
    expect(tabs).toEqual(['Menú Digital', 'Distribución de Mesas', 'Paquetes Semanales', 'Puntos Acumulados']);
  });

  test('una pantalla de detalle o formulario trae botón «volver» al destino anterior del flujo', () => {
    const detalle = compose('<main><h1>Detalle</h1></main>', { screen: manifest[2], manifest, name: 'GourmetFlow' });
    expect(detalle).toContain('class="icase-back" href="#s1"');
    const formulario = compose('<main><h1>Reserva</h1></main>', { screen: manifest[6], manifest, name: 'GourmetFlow' });
    expect(formulario).toContain('class="icase-back" href="#s5"');
    const principal = compose('<main><h1>Menú</h1></main>', { screen: manifest[1], manifest, name: 'GourmetFlow' });
    expect(principal).not.toContain('icase-back" href');
  });

  test('en el acceso se quitan el nombre de la aplicación y el subtítulo del módulo que repite el contenido', () => {
    const contenido = '<main><div class="w-full max-w-sm"><div class="text-center mb-6"><h1>GourmetFlow</h1><p>Aplicación Móvil de Clientes</p></div><form><h2>Iniciar sesión</h2><input name="correo"><button>Ingresar</button></form></div></main>';
    const html = compose(contenido, { screen: { ...manifest[0], modulo: 'Aplicación Móvil de Clientes' }, manifest, name: 'GourmetFlow' });
    const main = html.match(/<main class="icase-content">[\s\S]*<\/main>/)[0];
    expect(main).not.toContain('GourmetFlow');
    expect(main).not.toContain('Aplicación Móvil de Clientes');
    expect(main).not.toContain('text-center mb-6'); // el contenedor vacío tampoco queda
    expect(main).toContain('Iniciar sesión');
    expect(main).toContain('name="correo"');
    expect(html.match(/<strong>GourmetFlow<\/strong>/g)).toHaveLength(1); // la marca queda solo en la cabecera
  });

  test('el texto de un indicador de estado sale del círculo de tamaño fijo y queda a su lado', () => {
    const contenido = '<main><div class="flex items-center space-x-2"><div class="w-3 h-3 rounded-full bg-emerald-600"><span>Pedido Recibido</span></div></div><div class="w-12 h-12 rounded-full"><span>Avatar</span></div></main>';
    const html = compose(contenido, { screen: manifest[4], manifest, name: 'X' });
    expect(html).toContain('<div class="w-3 h-3 rounded-full bg-emerald-600"></div><span>Pedido Recibido</span>');
    expect(html).toContain('<div class="w-12 h-12 rounded-full"><span>Avatar</span></div>'); // un avatar grande conserva su contenido
  });
});

describe('advertencias de formularios útiles', () => {
  test('los campos que completa el sistema no se consideran faltantes', () => {
    for (const nombre of ['cliente_id', 'usuario_id', 'estado', 'codigoQr', 'fechaAdquisicion', 'inicioVigencia', 'finVigencia', 'usosTotales', 'usosRestantes', 'fechaCierre', 'efectivoEsperado', 'diferencia', 'totalEfectivo']) {
      expect([nombre, systemManaged(nombre, { type: 'string' })]).toEqual([nombre, expect.any(String)]);
    }
    for (const nombre of ['fondoInicial', 'efectivoContado', 'observaciones', 'mesa_id', 'comensales', 'nombre']) expect(systemManaged(nombre, { type: 'string' })).toBeNull();
  });

  const contrato = (properties) => ({ operations: [{ id: 'RF-08', methods: ['GET', 'POST'], schema: { properties } }] });
  const html = '<main><form><input name="fondoInicial"><button data-accion="RF-08.crear">Cerrar caja</button></form></main>';

  test('solo avisa de lo que la persona debería poder escribir', () => {
    const propiedades = Object.fromEntries(['fondoInicial', 'efectivoContado', 'observaciones', 'fechaCierre', 'efectivoEsperado', 'diferencia', 'usuario_id'].map((nombre) => [nombre, { type: 'string' }]));
    const resultado = new MockupBindingValidator().validar({ html, requerimientos: [{ identificador: 'RF-08', tipo: 'RF', aprobado: true }], contrato: contrato(propiedades) });
    expect(resultado.advertencias).toEqual(['el formulario de "Cerrar caja" no tiene control para: efectivoContado, observaciones (RF-08 los guarda y el backend puede exigirlos)']);
  });

  test('sin campos de usuario pendientes no hay ninguna advertencia', () => {
    const propiedades = Object.fromEntries(['fondoInicial', 'fechaCierre', 'diferencia', 'cliente_id'].map((nombre) => [nombre, { type: 'string' }]));
    const resultado = new MockupBindingValidator().validar({ html, requerimientos: [{ identificador: 'RF-08', tipo: 'RF', aprobado: true }], contrato: contrato(propiedades) });
    expect(resultado.advertencias).toEqual([]);
  });
});
