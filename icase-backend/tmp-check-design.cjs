const fs = require('fs');
const Completion = require('./src/infrastructure/services/DesignDiagramCompletion');
const Validator = require('./src/infrastructure/services/PlantUMLValidatorService');
const domain = fs.readFileSync('tmp-clases_dominio.puml', 'utf8');
const design = fs.readFileSync('tmp-clases_diseno.puml', 'utf8');
const result = new Completion().complete(design, domain);
const checked = new Validator().validar(result, {
  tipo: 'clases_diseno',
  diagramasDependencia: [
    { tipo: 'clases_dominio', codigo_plantuml: domain, aprobado: true, version: 1 }
  ]
});
const warnings = (checked.advertencias || []).filter((item) => /entidad aprobada|relación aprobada|no declara dependencias|Diagrama extenso|no se reconocen/.test(item));
console.log('changed', result !== design);
console.log('warnings', warnings.length);
for (const item of warnings) console.log('-', item.slice(0, 180));
fs.writeFileSync('tmp-completed.puml', result);
