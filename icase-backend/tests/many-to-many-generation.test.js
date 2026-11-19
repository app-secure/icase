const Extractor = require('../src/infrastructure/services/DomainModelExtractor');
const Builder = require('../src/infrastructure/services/ApplicationContractBuilder');
const Data = require('../src/infrastructure/services/BackendDataLayerGenerator');
const Coverage = require('../src/core/services/GenerationCoverageService');
const domain = (extra = '') => new Extractor().extract(`@startuml
class Alumno {
  String nombre
  List<Curso> cursos
}
class Curso {
  String titulo
}
Alumno "0..*" -- "1..*" Curso : inscripciones
${extra}
@enduml`);
function contract(model = domain()) {
  return new Builder().build({ proyecto: { nombre: 'Escuela' }, domainModel: model, requerimientos: [{ identificador: 'RF-01', nombre: 'Gestionar alumnos', aprobado: true, tipo: 'RF' }] });
}
describe('almacenamiento N:M genérico', () => {
  test('no convierte colecciones N:M en FK escalar falsa', () => {
    const model = domain();
    expect(model.relations[0].cardinalidad).toBe('muchos_a_muchos');
    expect(model.entities[0].references).toEqual([]);
    expect(model.entities[0].schema.properties.curso_id).toBeUndefined();
  });
  test('reconoce multiplicidad fija mayor que uno', () => {
    const model = new Extractor().extract('class A\nclass B\nA "2" -- "3" B');
    expect(model.relations[0].cardinalidad).toBe('muchos_a_muchos');
  });
  test.each(['postgres', 'mysql'])('crea tabla intermedia con FKs, NOT NULL y unicidad en %s', (database) => {
    const data = new Data().build({ contract: contract(), database, modules: [] });
    expect(data.model.associations).toHaveLength(1);
    const association = data.model.associations[0];
    const sql = data.migration.statements.join('\n');
    expect(sql).toContain(association.table);
    expect(sql).toMatch(/source_id["`] BIGINT NOT NULL/);
    expect(sql).toMatch(/target_id["`] BIGINT NOT NULL/);
    expect(sql).toContain('CREATE UNIQUE INDEX');
    expect(sql).toContain('REFERENCES');
    expect(data.model.tables[association.table].references).toHaveLength(2);
    expect(association.endpoints_generated).toBe(false);
  });
  test('Mongo genera colección e índice compuesto único sin simular FKs', () => {
    const data = new Data().build({ contract: contract(), database: 'mongodb', modules: [] });
    const table = data.model.associations[0].table;
    expect(data.migration.collections).toContain(table);
    expect(data.migration.indexes).toContainEqual({ collection: table, keys: { source_id: 1, target_id: 1 }, options: { unique: true, name: 'uq_association_pair' } });
    expect(data.model.tables[table].columns.every((c) => !c.enforced)).toBe(true);
  });
  test('deduplica declaración inversa y conserva vínculos con etiquetas distintas', () => {
    const duplicate = new Data().build({ contract: contract(domain('Curso "*" -- "*" Alumno : inscripciones')), database: 'postgres' });
    expect(duplicate.model.associations).toHaveLength(1);
    const distinct = new Data().build({ contract: contract(domain('Curso "*" -- "*" Alumno : favoritos')), database: 'postgres' });
    expect(distinct.model.associations).toHaveLength(2);
    expect(new Set(distinct.model.associations.map((a) => a.table)).size).toBe(2);
  });
  test('autorrelaciones mantienen dos columnas diferenciadas y nombres estables', () => {
    const model = new Extractor().extract('class Persona\nPersona "*" -- "*" Persona : contactos');
    const build = () => new Data().build({ contract: contract(model), database: 'postgres' });
    expect(build().model.associations[0].table).toBe(build().model.associations[0].table);
    expect(build().model.associations[0].fields).toEqual(['source_id', 'target_id']);
  });
  test('no crea datos iniciales de relaciones ni certifica entrega completa', () => {
    const input = contract();
    const data = new Data().build({ contract: input, database: 'postgres', modules: ['datos_iniciales'] });
    const seed = data.migrations.find((m) => m.id.includes('seed')).statements.join('\n');
    expect(seed).not.toContain(data.model.associations[0].table);
    const assessment = new Coverage().evaluar({ contrato: input, declaracion: { modo_entrega: 'completa' } });
    expect(assessment.exportable).toBe(false);
    expect(assessment.bloqueos.join(' ')).toContain('N:M');
  });
});
