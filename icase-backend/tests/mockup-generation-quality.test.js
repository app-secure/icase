const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const requisitos = [
  { identificador: 'RF-02', tipo: 'RF', aprobado: true, nombre: 'Reserva de mesa o silla', descripcion: 'El cliente reserva una mesa.', actores: ['Cliente'] },
  { identificador: 'RF-05', tipo: 'RF', aprobado: true, nombre: 'Validación de reserva mediante QR', descripcion: 'El mesero utiliza la interfaz web para escanear el QR.', actores: ['Mesero'] },
  { identificador: 'RF-08', tipo: 'RF', aprobado: true, nombre: 'Cierre de sesión de caja', descripcion: 'El cajero cierra la caja.', actores: ['Cajero'] },
  { identificador: 'RF-10', tipo: 'RF', aprobado: true, nombre: 'Autenticación de usuarios', descripcion: 'Autentica a los usuarios.', actores: ['Cliente', 'Mesero', 'Cajero'] }
];
const arbol = '@startwbs\n* GourmetFlow\n** Aplicación Móvil de Clientes\n*** Vista de Autenticación\n*** Formulario de Reserva de Mesa o Silla\n@endwbs';

const montar = (generarMockups) => {
  let guardado = null;
  const repository = {
    obtenerPorProyecto: jest.fn(async () => null),
    guardarOActualizar: jest.fn(async (_id, datos) => { guardado = datos; return datos; })
  };
  const useCase = new GenerarMockups({
    proyectoRepository: { obtenerPorId: async () => ({ nombre: 'GourmetFlow', estado_fase: 'diagramas_aprobados' }) },
    requerimientoRepository: { listarPorProyecto: async () => requisitos },
    diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: arbol, aprobado: true, estado: 'aprobado' }] },
    disenoRepository: repository,
    mockupIaService: { generarMockups }
  });
  return { useCase, guardado: () => guardado };
};

const respuesta = (slug, html) => ({ mockups: [{ nombre_pantalla: slug, preview_code: html }], proveedorUsado: 'prueba', advertencias: [] });

describe('generación de mockups: calidad de lo que se entrega', () => {
  test('al generar el acceso, el contexto de la IA no incluye requisitos de otros roles ni el de caja', async () => {
    const generarMockups = jest.fn(async () => respuesta('vista-de-autenticacion', '<!DOCTYPE html><html><body><main><h1>Iniciar sesión</h1><form><input name="correo"><input type="password" name="clave"><button data-accion="ui">Ingresar</button></form></main></body></html>'));
    const { useCase } = montar(generarMockups);
    await useCase.ejecutar({ proyectoId: 'p1', pantallas: ['vista-de-autenticacion'] });
    const contexto = JSON.stringify(generarMockups.mock.calls[0][0]);
    expect(contexto).toContain('RF-10');
    expect(contexto).not.toContain('Cierre de sesión de caja');
    expect(contexto).not.toContain('Validación de reserva mediante QR');
  });

  test('el acceso generado no queda ligado al cierre de caja ni lleva advertencias de trazabilidad', async () => {
    const html = '<!DOCTYPE html><html><body><main><div><h1>GourmetFlow</h1><p>Aplicación Móvil de Clientes</p></div><form><input name="correo"><input type="password" name="clave"><button data-accion="ui">Ingresar</button></form></main></body></html>';
    const { useCase, guardado } = montar(jest.fn(async () => respuesta('vista-de-autenticacion', html)));
    await useCase.ejecutar({ proyectoId: 'p1', pantallas: ['vista-de-autenticacion'] });
    const mockup = guardado().mockups.find((item) => item.nombre_pantalla === 'vista-de-autenticacion');
    expect(mockup.rf_trazabilidad).toEqual(['RF-10']);
    expect(mockup.advertencias_validacion.join(' ')).not.toMatch(/No se pudo asociar|RF-08/);
    expect(mockup.preview_code).not.toContain('Aplicación Móvil de Clientes</p>');
    expect(mockup.preview_code).toContain('data-icase-kind="auth"');
  });

  test('un botón de otro actor en la reserva del cliente se avisa con el motivo', async () => {
    const html = '<!DOCTYPE html><html><body><main><h1>Reserva</h1><form><select name="mesa_id"></select><button data-accion="RF-02.crear">Confirmar Reserva</button></form><button data-accion="RF-05.consultar">Escanear QR</button></main></body></html>';
    const { useCase, guardado } = montar(jest.fn(async () => respuesta('formulario-de-reserva-de-mesa-o-silla', html)));
    await useCase.ejecutar({ proyectoId: 'p1', pantallas: ['formulario-de-reserva-de-mesa-o-silla'] });
    const mockup = guardado().mockups.find((item) => item.nombre_pantalla === 'formulario-de-reserva-de-mesa-o-silla');
    const avisos = mockup.advertencias_validacion.join(' | ');
    expect(avisos).toMatch(/el control "Escanear QR" ejecuta RF-05, que no corresponde a esta pantalla \(lo ejecuta mesero/);
    expect(avisos).not.toMatch(/Confirmar Reserva/);
  });
});
