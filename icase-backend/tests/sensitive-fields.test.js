const crypto = require('node:crypto');
const path = require('node:path');
const support = require('../src/infrastructure/templates/data-layer/store-support');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');

const table = {
  columns: [
    { name: 'correo', column: 'correo', type: 'string' },
    { name: 'passwordHash', column: 'passwordhash', type: 'string', sensitive: true },
    { name: 'rol', column: 'rol', type: 'string' }
  ]
};

const verify = (password, stored) => {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), 32, { N: Number(N), r: Number(r), p: Number(p) });
  return scheme === 'scrypt' && actual.toString('base64') === hash;
};

describe('campos de secreto en la capa de datos generada', () => {
  test('split guarda el secreto como hash scrypt verificable y deja los demás campos intactos', () => {
    const { values } = support.split(table, { correo: 'a@b.co', passwordHash: 'clave-secreta', rol: 'cliente' });
    expect(values.correo).toBe('a@b.co');
    expect(values.rol).toBe('cliente');
    expect(values.passwordhash).not.toBe('clave-secreta');
    expect(values.passwordhash.startsWith('scrypt$')).toBe(true);
    expect(verify('clave-secreta', values.passwordhash)).toBe(true);
  });

  test('dos guardados del mismo secreto producen hashes distintos', () => {
    const first = support.split(table, { passwordHash: 'igual' }).values.passwordhash;
    const second = support.split(table, { passwordHash: 'igual' }).values.passwordhash;
    expect(first).not.toBe(second);
  });

  test('toRecord no devuelve el secreto, salvo para uso interno', () => {
    const row = { id: 1, correo: 'a@b.co', passwordhash: 'scrypt$x', rol: 'cliente', created_at: 'c', updated_at: 'u' };
    expect(support.toRecord(table, 'rf-13', row).data).toEqual({ correo: 'a@b.co', rol: 'cliente' });
    expect(support.toRecord(table, 'rf-13', row, { includeSensitive: true }).data.passwordHash).toBe('scrypt$x');
  });

  test('comportamiento previo: una columna normal se guarda y se devuelve igual', () => {
    const plain = { columns: [{ name: 'nombre', column: 'nombre', type: 'string' }] };
    expect(support.split(plain, { nombre: 'Ana' }).values.nombre).toBe('Ana');
    expect(support.toRecord(plain, 'rf-01', { id: 2, nombre: 'Ana' }).data).toEqual({ nombre: 'Ana' });
  });

  test('un secreto null o vacío no se convierte en hash', () => {
    expect(support.split(table, { passwordHash: null }).values.passwordhash).toBeNull();
    expect(support.split(table, { passwordHash: '' }).values.passwordhash).toBe('');
  });
});

describe('el modelo generado marca los secretos', () => {
  const plantuml = '@startuml\nclass Usuario {\n+String id\n+String correo\n+String passwordHash\n+String rol\n}\n@enduml';

  test('el extractor declara x-sensitive y writeOnly en el campo de contraseña', () => {
    const model = new DomainModelExtractor().extract(plantuml);
    const properties = model.entities[0].schema.properties;
    expect(properties.passwordHash).toMatchObject({ 'x-sensitive': true, writeOnly: true });
    expect(properties.correo['x-sensitive']).toBeUndefined();
  });

  test('el modelo de datos del backend generado lleva la columna como sensible', async () => {
    const generated = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: {
        decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' } },
        requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar usuarios' }],
        diagramaDominio: { codigo_plantuml: plantuml }
      },
      versionesOrigen: {}
    });
    const modelFile = generated.archivos.find((file) => file.ruta === path.posix.join('backend/src/data/model.js'));
    expect(modelFile.contenido).toMatch(/"name":\s*"passwordHash"[^}]*"sensitive":\s*true/);
    expect(modelFile.contenido).not.toMatch(/"name":\s*"correo"[^}]*"sensitive"/);
  });
});

describe('las pruebas generadas esperan secretos ocultos', () => {
  test('el runtime de pruebas no compara el secreto enviado y exige que no se devuelva', () => {
    const source = require('../src/infrastructure/services/SamplePayload').runtimeSource();
    expect(source).toContain("['x-sensitive']");
    expect(source).toContain('es un secreto y no debe devolverse');
  });
});
