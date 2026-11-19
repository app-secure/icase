// Genera backend y frontend de un proyecto real SIN guardar nada: escribe los archivos en una carpeta.
// La especificación se normaliza al generar (como en la aplicación); aquí solo se activa en memoria la opción de móviles en web.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const repo = (name) => require(`../src/interface-adapters/repositories/${name}`);

const readOnly = (cls, patch = {}) => new Proxy(new cls(), { get(target, key) {
  if (patch[key]) return patch[key](target);
  const value = target[key];
  if (typeof value !== 'function') return value;
  if (/^(crear|actualizar|guardar|reemplazar|eliminar|upsert|marcar)/.test(String(key))) return async (...args) => ({ id: 'dry', ...(typeof args[0] === 'object' ? args[0] : {}), ...(typeof args[1] === 'object' ? args[1] : {}) });
  return value.bind(target);
} });

// DRY_CONFIRM_DERIVED=1: como si la persona confirmara en la revisión las operaciones derivadas pendientes.
if (process.env.DRY_CONFIRM_DERIVED) {
  const original = ApplicationSpecService.prototype._completarRelacionadas;
  ApplicationSpecService.prototype._completarRelacionadas = function (...args) { return original.apply(this, args).map((op) => ({ ...op, estado_decision: 'confirmado' })); };
}

(async () => {
  const [projectId, out] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI);
  const [requerimientos, diagramas, diseno] = await Promise.all([
    new (repo('MongoRequerimientoRepository'))().listarPorProyecto(projectId),
    new (repo('MongoDiagramaRepository'))().listarPorProyecto(projectId),
    new (repo('MongoDisenoRepository'))().obtenerPorProyecto(projectId)
  ]);
  const modelo = new DomainModelExtractor().fromDiagrams(diagramas);
  const rf = requerimientos.filter((item) => item.aprobado === true && String(item.tipo).toUpperCase() === 'RF');
  const pantallas = Array.isArray(diseno?.manifiesto_navegacion) ? diseno.manifiesto_navegacion : [];
  const service = new ApplicationSpecService({});

  const planPatch = {
    obtenerPorProyecto: (target) => async (id) => {
      const plan = await target.obtenerPorProyecto(id);
      if (!plan) return plan;
      const etapas = plan.etapas.map((etapa) => {
        if (etapa.etapa === 'alcance_plataforma' && process.env.DRY_MOBILE_IN_WEB) return { ...etapa, propuesta: { ...etapa.propuesta, moviles_en_web: true } };
        return etapa;
      });
      return { ...plan, etapas };
    }
  };
  const dry = {};
  const { gestionarArtefactosCodigo } = createApp({ repositories: {
    artefactoGenerado: readOnly(repo('MongoArtefactoGeneradoRepository'), {
      obtenerUltimoAprobado: (target) => async (id, tipo) => dry[tipo] || target.obtenerUltimoAprobado(id, tipo)
    }),
    planCodificacion: readOnly(repo('MongoPlanCodificacionRepository'), planPatch)
  } });
  const results = {};
  const kinds = [['generarBackend', 'codigo_backend'], ['generarFrontend', 'codigo_frontend'], ...(process.env.DRY_TESTS ? [['generarPruebas', 'pruebas']] : [])];
  for (const [kind, tipo] of kinds) {
    try {
      results[kind] = await gestionarArtefactosCodigo[kind](projectId);
      dry[tipo] = { ...(results[kind].artefacto || results[kind]), aprobado: true, estado: 'aprobado', verificacion: { estado: 'apta' } };
    } catch (error) { console.error(kind, 'FALLÓ:', error.message); }
  }
  for (const [kind, result] of Object.entries(results)) {
    const artefacto = result.artefacto || result;
    for (const file of artefacto.archivos || []) {
      const target = path.join(out, file.ruta);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.contenido);
    }
    console.log(kind, 'archivos:', (artefacto.archivos || []).length);
  }
  process.exit(0);
})();
