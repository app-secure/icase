const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');

describe('generación persistente del frontend', () => {
  test('genera rutas y pantallas desde el manifiesto y mockups aprobados', async () => {
    const result = await new FrontendScaffoldGenerator().generar({
      proyecto: { nombre: 'Gourmet Flow' },
      insumos: {
        decisiones: { stack_tecnologico: { frontend: 'React + Vite' } },
        diseno: {
          manifiesto_navegacion: [{ pantalla_id: 'screen-1', nombre: 'Inicio de sesión', slug: 'login', ruta: '/login', roles: ['cliente'], rf_trazabilidad: ['RF-01'] }],
          mockups: [{ pantalla_id: 'screen-1', nombre_pantalla: 'login', version: 2, preview_code: '<!doctype html><html><body><button class="bg-blue-600" onclick="evil()">Entrar</button><script>alert(1)</script></body></html>' }],
          sistema_diseno: { colores: { primario: '#123456' } }
        }
      },
      versionesOrigen: { 'mockup:login': 2 }
    });
    const app = result.archivos.find((item) => item.ruta === 'frontend/src/App.jsx');
    const page = result.archivos.find((item) => item.ruta === 'frontend/src/pages/login.jsx');
    expect(app.contenido).toContain('path="/login"');
    expect(page.contenido).toContain('Entrar');
    expect(page.contenido).not.toContain('onclick');
    expect(page.contenido).not.toContain('alert(1)');
    expect(result.trazabilidad_rf).toEqual(['RF-01']);
    expect(result.archivos.every((item) => item.huella.length === 64)).toBe(true);
  });

  test('advierte pantallas del árbol que no tienen mockup', async () => {
    const result = await new FrontendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' }, versionesOrigen: {},
      insumos: { decisiones: {}, diseno: { manifiesto_navegacion: [{ pantalla_id: 'x', nombre: 'Reporte', slug: 'reporte' }], mockups: [] } }
    });
    expect(result.advertencias[0]).toContain('Reporte');
  });
});
