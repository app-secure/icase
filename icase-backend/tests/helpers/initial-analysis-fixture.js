const { startPlatform, ids } = require('./platform-fixture');
class MemoryAnalysisVersions {
  constructor() { this.rows = []; }
  async get(id) { return structuredClone(this.rows.find(row => row.id === id) || null); }
  async list(project) { return structuredClone(this.rows.filter(row => row.proyecto_id === project).sort((a, b) => b.version - a.version)); }
  async create(data) { if (this.rows.some(r => r.proyecto_id === data.proyecto_id && r.version === data.version)) throw Object.assign(new Error('Versión concurrente'), { status: 409 }); const row = { ...structuredClone(data), id: (this.rows.length + 1).toString(16).padStart(24, '0') }; this.rows.push(row); return structuredClone(row); }
  async approve(id, user) { const row = this.rows.find(r => r.id === id && r.estado === 'borrador'); if (!row) return null; Object.assign(row, { estado: 'aprobado', aprobado_por: user, aprobado_en: new Date().toISOString() }); return structuredClone(row); }
}
class MemoryAnalysisJobs {
  constructor() { this.rows = []; }
  async obtenerPorId(id) { return this.requirementsGet(id); }
  async obtenerUltimoDiagramaPorProyecto() { return null; }
  async requirementsRecover() {}
  async requirementsGet(id) { return structuredClone(this.rows.find(r => r.id === id) || null); }
  async requirementsLatest(project, operation) { return structuredClone([...this.rows].reverse().find(r => r.proyecto_id === project && (!operation || r.operacion_requisitos === operation)) || null); }
  async requirementsStart(data) {
    const active = this.rows.find(r => r.proyecto_id === data.proyecto_id && !['completado', 'fallido'].includes(r.estado));
    if (active) { if (active.entrada_hash === data.entrada_hash) return { created: false, job: structuredClone(active) }; throw Object.assign(new Error('Trabajo activo.'), { status: 409 }); }
    const row = { ...structuredClone(data), id: `af${this.rows.length + 1}`.padEnd(24, '0'), estado: 'encolado' }; this.rows.push(row); return { created: true, job: structuredClone(row) };
  }
  async requirementsClaim(id) { const row = this.rows.find(r => r.id === id && ['encolado', 'interrumpido', 'esperando_proveedor'].includes(r.estado)); if (!row) return null; row.estado = 'procesando'; return structuredClone(row); }
  async requirementsSave(id, changes) { const row = this.rows.find(r => r.id === id); Object.assign(row, structuredClone(changes)); }
}
async function startInitialPlatform() {
  const versions = new MemoryAnalysisVersions(), jobs = new MemoryAnalysisJobs();
  const platform = await startPlatform({ env: { REQUIREMENTS_RESILIENT_ENABLED: 'false' }, repositoryOverrides: {
    analisisInicial: versions, trabajoGeneracion: jobs, projectMutationLease: { acquire: async () => ({ release: async () => {}, assert() {} }) }
  } });
  const project = platform.data.proyecto[0]; Object.assign(project, { version_flujo_analisis: 2, analisis_inicial_borrador_id: null, analisis_inicial_aprobado_id: null });
  platform.data.requerimiento.splice(0, platform.data.requerimiento.length);
  Object.assign(platform.data.fuente[0], { texto_transcrito: 'El operador consulta expedientes.' });
  platform.repositories.proyecto.obtenerPorId = async id => structuredClone(platform.data.proyecto.find(p => p.id === id) || null);
  return { ...platform, versions, jobs };
}
const analysis = () => ({ tipo: 'analisis_inicial', sintesis: { problema: 'Consultar información', contexto: 'Proyecto de prueba', objetivos: ['Consultar expedientes'], alcance: 'Consulta' },
  inventario: [{ id: 'N-01', tipo: 'RF', objetivo_id: 'O-01', necesidad: 'Consultar expedientes', estado: 'confirmado', evidencias: [{ texto: 'El operador consulta expedientes.', fuente: 'a.txt' }] }],
  actores: [{ id: 'ACT-01', nombre: 'Operador', descripcion: 'Consulta', tipo: 'persona', origen: 'explicito', estado: 'confirmado', evidencias: [{ texto: 'El operador consulta expedientes.', fuente: 'a.txt' }] }], preguntas_pendientes: [], necesidades_pendientes: [] });
module.exports = { startInitialPlatform, analysis, MemoryAnalysisVersions, MemoryAnalysisJobs };
