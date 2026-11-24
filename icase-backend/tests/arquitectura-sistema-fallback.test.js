const mod = require('../src/infrastructure/services/ArquitecturaSistemaGeneratorService.js');
const Servicio = mod.ArquitecturaSistemaGeneratorService || mod;

test('el diagrama de sistema no inventa móvil ni observabilidad', () => {
  const reqs = [
    { tipo: 'RNF', nombre: 'Rendimiento', descripcion: 'Registrar una venta en menos de 2 s', metrica_medible: 'sin herramientas de monitoreo' },
    { tipo: 'RNF', nombre: 'Plataforma', descripcion: 'Aplicación web con React, Express y PostgreSQL. No habrá aplicación móvil. Usuarios del mostrador.' }
  ];
  const codigo = new Servicio().generar({ nombreProyecto: 'Ventas', requerimientos: reqs }).codigo_plantuml;
  expect(codigo).not.toMatch(/Móvil|Observabilidad/);
  expect(codigo).toMatch(/React/);
  expect(codigo).toMatch(/PostgreSQL/);
});
