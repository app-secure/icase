const fs = require('fs');
const project = ObjectId('6af76e7892a51d34f954a988');
for (const tipo of ['clases_dominio', 'clases_diseno']) {
  const doc = db.diagramas.find({ proyecto_id: project, tipo }).sort({ _id: -1 }).limit(1).toArray()[0];
  fs.writeFileSync(`tmp-${tipo}.puml`, doc ? doc.codigo_plantuml : '');
  print(tipo, doc ? doc.codigo_plantuml.length : 0);
}
