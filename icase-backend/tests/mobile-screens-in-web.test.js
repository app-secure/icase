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
