const fs = require('node:fs');
const path = require('node:path');
const NavigationTreeReview = require('../src/core/services/NavigationTreeReview');
const PlatformPolicy = require('../src/core/services/PlatformPolicy');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const arbolAnterior = `@startwbs
* Sistema de Gestión de Restaurante
** Acceso al sistema (Aplicación Web Interna y Aplicación Móvil)
*** Pantalla de inicio de sesión
** Flujo de Cliente (Aplicación Móvil)
*** Pantalla de menú digital con precios y disponibilidad
*** Pantalla de canje de puntos por recompensas
** Flujo de Mesero (Aplicación Web Interna)
*** Pantalla de mesas asignadas y estado de disponibilidad
** Flujo de Cocinero (Pantalla KDS de Cocina)
*** Pantalla KDS de comandas y platos pendientes
*** Pantalla de actualización de disponibilidad de platos
@endwbs`;

const arbolPorAplicacion = `@startwbs
* Sistema de Gestión de Restaurante
** Aplicación Móvil de Clientes
*** Acceso
**** Pantalla de inicio de sesión
*** Menú y pedidos
**** Pantalla de menú digital con precios y disponibilidad
**** Detalle de plato
*** Puntos
**** Pantalla de canje de puntos por recompensas
** Aplicación Web Interna
*** Acceso
**** Pantalla de inicio de sesión
*** Módulo de Mesero
**** Pantalla de mesas asignadas y estado de disponibilidad
*** Módulo de Cocina (KDS)
**** Pantalla KDS de comandas y platos pendientes
@endwbs`;

describe('lectura de la plataforma en el árbol', () => {
  test('reconoce móvil, web y los textos que nombran ambas', () => {
    expect(PlatformPolicy.marked('Aplicación Móvil de Clientes')).toBe('móvil');
    expect(PlatformPolicy.marked('Aplicación Web Interna')).toBe('web');
    expect(PlatformPolicy.marked('Acceso (Aplicación Web Interna y Aplicación Móvil)')).toBe('ambas');
    expect(PlatformPolicy.marked('Módulo de Mesero')).toBeNull();
    expect(PlatformPolicy.marked('Gestión de mobiliario')).toBeNull();
  });
});

describe('revisión de la estructura del árbol', () => {
  test('el árbol con plataformas entre paréntesis avisa de lo ambiguo', () => {
    const { advertencias, metricas } = NavigationTreeReview.review(arbolAnterior);
    const texto = advertencias.join(' | ');
    expect(texto).toMatch(/«Acceso al sistema \(Aplicación Web Interna y Aplicación Móvil\)» nombra dos plataformas/);
    expect(texto).toMatch(/pantalla\(s\) no indican su aplicación.*Pantalla KDS de comandas/);
    expect(texto).toContain('El nivel 2 del árbol debe ser la aplicación');
    expect(metricas.pantallas_sin_aplicacion).toBeGreaterThan(0);
  });

  test('un árbol con una aplicación por plataforma y su acceso no tiene avisos', () => {
    const { advertencias, metricas } = NavigationTreeReview.review(arbolPorAplicacion);
    expect(advertencias).toEqual([]);
    expect(metricas).toEqual({ aplicaciones: 2, pantallas_sin_aplicacion: 0 });
  });

  test('avisa si una aplicación no tiene su propio acceso', () => {
    const sinAccesoWeb = arbolPorAplicacion.replace('*** Acceso\n**** Pantalla de inicio de sesión\n*** Módulo de Mesero', '*** Módulo de Mesero');
    expect(NavigationTreeReview.review(sinAccesoWeb).advertencias.join(' ')).toContain('«Aplicación Web Interna» no tiene pantalla de acceso');
  });

  test('un proyecto de una sola plataforma sin marcas no recibe avisos', () => {
    const sinMarcas = '@startwbs\n* Sistema\n** Ventas\n*** Pedidos\n*** Informe\n@endwbs';
    expect(NavigationTreeReview.review(sinMarcas)).toEqual({ advertencias: [], metricas: { aplicaciones: 0, pantallas_sin_aplicacion: 0 } });
  });

  test('el validador del diagrama incluye los avisos de plataforma', () => {
    const resultado = new PlantUMLValidatorService().validar(arbolAnterior, 'arbol_navegacion', {});
    expect(resultado.advertencias.join(' ')).toContain('nombra dos plataformas');
    expect(new PlantUMLValidatorService().validar(arbolPorAplicacion, 'arbol_navegacion', {}).advertencias.join(' ')).not.toContain('plataforma');
  });
});

describe('pantallas extraídas del árbol por aplicación', () => {
  const useCase = new GenerarMockups({});
  const pantallas = useCase._extraerPantallasDelArbol(arbolPorAplicacion);
  const por = (nombre, plataforma) => pantallas.filter((item) => item.nombre === nombre && (!plataforma || item.plataforma === plataforma));

  test('cada aplicación conserva su propio inicio de sesión, con identificador distinto', () => {
    const accesos = por('Pantalla de inicio de sesión');
    expect(accesos.map((item) => item.plataforma).sort()).toEqual(['mobile', 'web']);
    expect(new Set(accesos.map((item) => item.pantalla_id)).size).toBe(2);
    expect(accesos.find((item) => item.plataforma === 'web').pantalla_id).toBe('pantalla-de-inicio-de-sesion-web');
  });

  test('la plataforma sale de la aplicación a la que pertenece la pantalla', () => {
    expect(por('Pantalla de menú digital con precios y disponibilidad')[0].plataforma).toBe('mobile');
    expect(por('Detalle de plato')[0].plataforma).toBe('mobile');
    // El módulo del mesero está en la aplicación web: no se convierte en tableta por su nombre.
    expect(por('Pantalla de mesas asignadas y estado de disponibilidad')[0].plataforma).toBe('web');
    expect(por('Pantalla KDS de comandas y platos pendientes')[0].plataforma).toBe('web');
  });

  test('los accesos de la misma aplicación sí se fusionan', () => {
    const doble = arbolPorAplicacion.replace('*** Menú y pedidos', '*** Recuperación\n**** Inicio de sesión alternativo\n*** Menú y pedidos');
    const accesosMoviles = useCase._extraerPantallasDelArbol(doble).filter((item) => item.es_acceso_compartido && item.plataforma === 'mobile');
    expect(accesosMoviles).toHaveLength(1);
  });

  test('el árbol sin plataformas conserva el comportamiento anterior (un acceso compartido)', () => {
    const antiguo = '@startwbs\n* App\n** Cliente\n*** Inicio de sesión\n** Mesero\n*** Inicio de sesión\n@endwbs';
    expect(useCase._extraerPantallasDelArbol(antiguo).filter((item) => item.es_acceso_compartido)).toHaveLength(1);
  });
});

describe('instrucciones para generar el árbol', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../src/infrastructure/prompts/disenador_arquitectura.md'), 'utf8');

  test('el nivel 2 es la aplicación y cada aplicación tiene su acceso', () => {
    expect(prompt).toContain('Nivel 2 (`**`): LA APLICACIÓN');
    expect(prompt).toContain('PROHIBIDO nombrar dos plataformas en un mismo nodo');
    expect(prompt).toContain('Cada aplicación tiene su PROPIO acceso');
    expect(prompt).not.toContain('Flujo de <Rol> (<Plataforma>)');
    expect(prompt).not.toContain('Las pantallas compartidas de acceso se declaran una sola vez');
  });
});

describe('nodos de resultado en el árbol de navegación', () => {
  const { review } = require('../src/core/services/NavigationTreeReview');
  const tree = (...leaves) => `@startwbs\n* Sistema\n** Aplicación Web Interna\n*** Módulo de Caja\n${leaves.map((leaf) => `**** ${leaf}`).join('\n')}\n@endwbs`;

  test('avisa de los nodos «Confirmación…» y «Resultado…» y los cuenta', () => {
    const result = review(tree('Registro de Cobros', 'Confirmación de Cobro Registrado', 'Resultado de Validación', 'Cierre de Caja'));
    expect(result.advertencias.some((warning) => /2 nodo\(s\) describen un mensaje de resultado/.test(warning) && warning.includes('«Confirmación de Cobro Registrado»'))).toBe(true);
  });

  test('un árbol sin esos nodos no recibe ese aviso', () => {
    const result = review(tree('Registro de Cobros', 'Cierre de Caja'));
    expect(result.advertencias.some((warning) => /mensaje de resultado/.test(warning))).toBe(false);
  });
});
