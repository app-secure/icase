jest.mock('../src/infrastructure/database/schemas/EstandarSchema', () => ({ bulkWrite: jest.fn().mockResolvedValue({}) }));
const fs = require('fs');
const path = require('path');
const Model = require('../src/infrastructure/database/schemas/EstandarSchema');
const { seedEstandares, estandaresBase } = require('../src/infrastructure/database/seeds/seedEstandares');
const Compiler = require('../src/infrastructure/services/MarkdownCompilerService');
const Requirement = require('../src/core/entities/Requerimiento');
const read = (relative) => fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');

describe('limpieza del estándar de requisitos', () => {
  test('exporta ISO 29148 sin encabezados IEEE 830', () => {
    const markdown = new Compiler().compilar({ proyecto: { nombre: 'Prueba' } });
    expect(markdown).toContain('ISO/IEC/IEEE 29148:2018');
    expect(markdown).not.toMatch(/IEEE\s*830/);
  });
  test('el servicio carga el prompt renombrado y sin cifras ilustrativas', () => {
    const service = read('infrastructure/services/ModelosIaService.js');
    expect(service).toContain("leerPrompt('analista_iso29148.md')");
    expect(service).not.toContain('analista_ieee830.md');
    const prompt = read('infrastructure/prompts/analista_iso29148.md');
    expect(prompt).toContain('Por confirmar con el usuario');
    expect(prompt).not.toContain('1.5 segundos');
  });
  test('actualiza solo las tres reglas del sistema también en una base poblada', async () => {
    await seedEstandares();
    await seedEstandares();
    expect(Model.bulkWrite).toHaveBeenCalledTimes(2);
    const operations = Model.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(3);
    for (const [index, operation] of operations.entries()) {
      expect(operation).toEqual({ updateOne: { filter: { clave: estandaresBase[index].clave }, update: { $set: estandaresBase[index] }, upsert: true } });
    }
    expect(Model.bulkWrite.mock.calls[1][0]).toEqual(operations);
  });
  test('reglas sin métricas prefabricadas, mínimos de procesos ni Mermaid activo', () => {
    const rnf = estandaresBase.find((item) => item.clave === 'REGLAS_MEDIBILIDAD_RNF');
    expect(rnf.regla_medibilidad).toContain('Por confirmar con el usuario');
    expect(estandaresBase.every((item) => item.ejemplos.length === 0)).toBe(true);
    const diagrams = estandaresBase.find((item) => item.categoria === 'Diagramas-Permitidos');
    expect(diagrams.definicion).toContain('PlantUML');
    expect(diagrams.regla_medibilidad).not.toMatch(/mermaid\.render|Mínimo 4/);
  });
  test('un RNF sin umbral admite confirmación pendiente', () => {
    const requirement = new Requirement({ proyecto_id: 'prueba', identificador: 'RNF-01', nombre: 'Rendimiento', tipo: 'RNF', metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true });
    expect(() => requirement.validar()).not.toThrow();
    expect(requirement.requiere_confirmacion).toBe(true);
  });
});
