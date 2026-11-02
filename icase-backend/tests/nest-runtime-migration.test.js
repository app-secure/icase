const Policy = require('../src/core/services/NestRuntimePolicy');
const Stack = require('../src/core/services/StackCatalog');
const Generator = require('../src/infrastructure/services/GenericBackendGenerator');
const Proposal = require('../src/core/services/CodePlanningProposalService');

describe('base NestJS 12 autorizada', () => {
  test('genera los tres paquetes Nest con la misma versión exacta, tipos Express 5 y motor compatible', () => {
    const files = new Generator().generate({ proyecto: { nombre: 'Prueba' }, requirements: [], stack: { backend: 'NestJS' } });
    const read = (name) => files.find((file) => file.ruta === 'backend/' + name).contenido;
    const pkg = JSON.parse(read('package.json'));
    for (const dependency of ['@nestjs/common', '@nestjs/core', '@nestjs/platform-express']) expect(pkg.dependencies[dependency]).toBe('12.3.2');
    expect(pkg.devDependencies['@types/express']).toBe('^5.0.0');
    expect(pkg.engines.node).toBe(Policy.node);
    expect(JSON.parse(read('icase.manifest.json')).stack.version_framework).toBe('12.3.2');
    expect(JSON.parse(read('tsconfig.json')).compilerOptions.module).toBe('commonjs');
  });
  test.each(['NestJS', 'Node.js + NestJS', 'NestJS 12', 'NestJS 12.3', 'NestJS@12.3.2', Policy.label])('acepta el stack compatible %s', (backend) => {
    expect(Stack.resolve({ backend }).backend).toBe('nest');
  });
  test.each(['NestJS 10', 'NestJS (11.1.18)', 'NestJS@10.4.20', 'NestJS 12.0.0', 'NestJS 12.4', 'NestJS 13', 'NestJS 12.3.2-rc.1'])('no sustituye silenciosamente una versión explícita: %s', (backend) => {
    expect(() => Stack.resolve({ backend })).toThrow('Revisa y aprueba');
    expect(() => Stack.resolveBackend(backend)).toThrow('Revisa y aprueba');
  });
  test('respeta la versión_backend aprobada por separado', () => {
    expect(() => Stack.resolve({ backend: 'NestJS', version_backend: '10.4.20' })).toThrow('Revisa y aprueba');
    expect(Stack.resolve({ backend: 'NestJS', version_backend: '12.3.2' }).backend).toBe('nest');
  });
  test.each(['Node.js 18 + NestJS', 'Node.js 22.0 + NestJS', 'Node.js 23 + NestJS'])('rechaza un Node incompatible: %s', (backend) => {
    expect(() => Stack.resolve({ backend })).toThrow('22.12+');
  });
  test('la propuesta muestra la versión nueva y advierte si el insumo fija una antigua', () => {
    const proposal = new Proposal()._stack_tecnologico({ texto: 'Usar NestJS 10 con PostgreSQL y React' });
    expect(proposal.valor.backend).toBe(Policy.label);
    expect(proposal.valor.version_backend).toBe('12.3.2');
    expect(proposal.advertencias.join(' ')).toContain('no se migra silenciosamente');
  });
  test('no modifica las dependencias de Express', () => {
    const files = new Generator().generate({ proyecto: {}, requirements: [], stack: { backend: 'Express' } });
    const pkg = JSON.parse(files.find((file) => file.ruta === 'backend/package.json').contenido);
    expect(pkg.dependencies.express).toBe('^4.21.2');
    expect(pkg.dependencies['@nestjs/core']).toBeUndefined();
  });
});
