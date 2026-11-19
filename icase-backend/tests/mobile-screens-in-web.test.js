const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
const { transformSync } = require('esbuild');

const generate = (alcance) => new GenericFrontendGenerator().generate({
  proyecto: { nombre: 'Restaurante' },
  screens: [
    { nombre: 'Menú del cliente', slug: 'menu-cliente', plataforma: 'mobile', roles: ['Cliente'], rf_trazabilidad: ['RF-01'] },
    { nombre: 'Inventario interno', slug: 'inventario-interno', plataforma: 'web', roles: ['Administrador'], rf_trazabilidad: ['RF-02'] }
  ],
  decisiones: {
    stack_tecnologico: { plataformas: ['web'] },
    alcance_plataforma: { plataformas: ['web'], detectadas: ['web', 'móvil'], ...alcance },
    control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'cliente', nombre: 'Cliente', incluir: true }, { id: 'administrador', nombre: 'Administrador', incluir: true }] }
  }
});
const app = (files) => files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;

describe('pantallas móviles en una aplicación solo web', () => {
  test('sin la opción, solo se genera la web', () => {
    const files = generate({});
    expect(files.map((file) => file.ruta)).not.toContain('frontend/src/pages/menu-cliente.jsx');
    expect(app(files)).not.toContain('/menu-cliente');
  });

  test('con la opción, el flujo del cliente también está en la web y solo para su rol', () => {
    const files = generate({ moviles_en_web: true });
    expect(files.map((file) => file.ruta)).toContain('frontend/src/pages/menu-cliente.jsx');
    expect(app(files)).toContain('"route":"/menu-cliente"');
    expect(app(files)).toContain('"roles":["cliente"]');
    expect(() => transformSync(app(files), { loader: 'jsx' })).not.toThrow();
    expect(files.some((file) => file.ruta.startsWith('mobile/'))).toBe(false);
  });
});

describe('consola de datos del administrador', () => {
  const generar = () => new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Restaurante' },
    screens: [{ nombre: 'Inventario interno', slug: 'inventario-interno', plataforma: 'web', roles: ['Administrador'], rf_trazabilidad: ['RF-02'] }],
    requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Inventario' }],
    decisiones: {
      stack_tecnologico: { plataformas: ['web'] },
      control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'administrador', nombre: 'Administrador', incluir: true }] }
    }
  });

  test('con sesión, el administrador tiene /datos con el editor genérico de cada operación', () => {
    const files = generar();
    const consola = files.find((file) => file.ruta === 'frontend/src/DataConsole.jsx');
    expect(consola.contenido).toContain('"key":"rf-02"');
    expect(() => transformSync(consola.contenido, { loader: 'jsx' })).not.toThrow();
    const app = files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;
    expect(app).toContain('path="/datos/:key"');
    expect(app).toContain("import DataConsole from './DataConsole'");
    expect(() => transformSync(app, { loader: 'jsx' })).not.toThrow();
  });
});

describe('pantallas de registros por rol', () => {
  const files = new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Restaurante' },
    screens: [{ nombre: 'Registro de cobros', slug: 'registro-cobros', plataforma: 'web', roles: ['Cajero'], rf_trazabilidad: ['RF-16'], mockup: { preview_code: '<main><h1>Cobros</h1><form><input name="importe"><button data-accion="RF-16.crear">Registrar</button></form></main>' } }],
    requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-16', nombre: 'Cobros' }],
    decisiones: {
      stack_tecnologico: { plataformas: ['web'] },
      control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'cajero', nombre: 'Cajero', incluir: true }] }
    }
  });
  const app = files.find((file) => file.ruta === 'frontend/src/App.jsx').contenido;

  test('lo que el rol puede consultar y ninguna de sus pantallas lista se ofrece como tabla de registros', () => {
    expect(app).toContain('const registryOperations = [{"key":"rf-16","label":"Cobros"}]');
    expect(app).toContain('"lista":[]'); // la pantalla de cobros es un formulario: no lista nada
    expect(app).toContain('<Route path="/registros/:key" element={<RegistryScreen />} />');
    expect(app).toContain('user.administrador ? [] : registryOperations.filter((op) => can(op.key, \'GET\') && !listed.has(op.key))');
    expect(() => transformSync(app, { loader: 'jsx' })).not.toThrow();
  });

  test('la pantalla de registros exige poder consultar la operación y usa el editor con alta, modificación y baja según el rol', () => {
    const screen = files.find((file) => file.ruta === 'frontend/src/RegistryScreen.jsx').contenido;
    expect(screen).toContain('"key":"rf-16"');
    expect(screen).toContain("!can(current.key, 'GET')");
    expect(() => transformSync(screen, { loader: 'jsx' })).not.toThrow();
  });
});
