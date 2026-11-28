// Caso Restaurante: editar a mano un diagrama de 23 casos fallaba («entre 2 y 14 casos para este alcance (0 RF)») porque la
// edición manual no entregaba los requisitos al validador. Además «contraseñaCifrada» no se reconocía como contraseña.
const ActualizarDiagramaManual = require('../src/core/use-cases/ActualizarDiagramaManual');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const { isSensitiveField } = require('../src/infrastructure/services/IdentityRequirements');

test('la edición manual juzga los casos de uso contra los requisitos del proyecto', async () => {
  const codigo = ['@startuml', 'actor Administrador', 'rectangle Sistema {', ...Array.from({ length: 23 }, (_, i) => `usecase "Gestionar elemento ${i}" as UC${i}`), '}',
    ...Array.from({ length: 23 }, (_, i) => `Administrador --> UC${i}`), '@enduml'].join('\n');
  const existente = { id: 'd1', proyecto_id: 'p1', tipo: 'casos_de_uso', codigo_plantuml: '', version: 1 };
  const useCase = new ActualizarDiagramaManual({
    diagramaRepository: { obtenerPorId: async () => existente, actualizar: async (id, cambios) => ({ ...existente, ...cambios }), listarPorProyecto: async () => [] },
    plantumlValidatorService: new Validator(),
    requerimientoRepository: { listarPorProyecto: async () => Array.from({ length: 23 }, (_, i) => ({ tipo: 'RF', identificador: `RF-${i}`, aprobado: true })) }
  });
  await expect(useCase.ejecutar({ id: 'd1', datos: { codigo_plantuml: codigo } })).resolves.toMatchObject({ version: 2 });
});

test.each(['contraseñaCifrada', 'contrasenaEncriptada', 'passwordHashed', 'passwordHash', 'clave'])('«%s» es un campo de contraseña', (nombre) => {
  expect(isSensitiveField(nombre)).toBe(true);
});
test('«claveProducto» no es una contraseña', () => expect(isSensitiveField('claveProducto')).toBe(false));
