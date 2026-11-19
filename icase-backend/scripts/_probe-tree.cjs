// Genera SOLO EN MEMORIA el árbol de navegación de un proyecto real con el proveedor indicado y lo revisa. No guarda nada.
// Uso: node scripts/_probe-tree.cjs <proyectoId> [proveedor] [modelo]
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const repo = (name) => require(`../src/interface-adapters/repositories/${name}`);

(async () => {
  const [projectId, provider = 'bedrock', model = process.env.BEDROCK_MODELS] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI);
  const [requerimientos, diagramas] = await Promise.all([
    new (repo('MongoRequerimientoRepository'))().listarPorProyecto(projectId),
    new (repo('MongoDiagramaRepository'))().listarPorProyecto(projectId)
  ]);
  const aprobados = requerimientos.filter((item) => item.aprobado === true);
  const aprobadosDiagramas = diagramas.filter((item) => item.aprobado && item.estado === 'aprobado' && !item.desactualizado);
  const Service = require('../src/infrastructure/services/ModelosIaService');
  const service = new Service();
  const inicio = Date.now();
  const resultado = await service.procesar({
    nombre_proyecto: 'Proyecto', insumo_bruto: '', objetivo: 'diagramas', tipo_diagrama: 'arbol_navegacion', provider, specificModel: model,
    contexto_proyecto: { requerimientos_aprobados: aprobados, requerimientos_actuales: aprobados, diagramas_aprobados: aprobadosDiagramas }
  });
  const diagrama = (resultado.diagramas || []).find((item) => /arbol|nav/i.test(item.tipo));
  const codigo = diagrama?.codigo_plantuml || '';
  console.log(`Tiempo: ${Date.now() - inicio} ms | RF aprobados: ${aprobados.filter((r) => r.tipo === 'RF').length}`);
  console.log(codigo || JSON.stringify(resultado).slice(0, 600));
  if (codigo) console.log('Revisión:', JSON.stringify(require('../src/core/services/NavigationTreeReview').review(codigo)));
  await mongoose.disconnect();
})().catch((error) => { console.error('ERROR:', error.message); process.exit(1); });
