const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Package = require('./ProjectTransferPackage');
const Lease = require('./ProjectMutationLease');
const schemaFiles = { proyecto: 'Proyecto', fuentes: 'Fuente', analisis: 'AnalisisInicial', requisitos: 'Requerimiento', diagramas: 'Diagrama', casos_uso: 'CasoDeUso', disenos: 'Diseno', plan_codigo: 'PlanCodificacion', artefactos_codigo: 'ArtefactoGenerado' };
const plain = value => JSON.parse(JSON.stringify(value));
const id = () => new mongoose.Types.ObjectId().toString();
function rewrite(value, mapping) {
  if (typeof value === 'string') return mapping.get(value) || value;
  if (Array.isArray(value)) return value.map(v => rewrite(v, mapping));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, mapping)]));
  return value;
}
class ProjectTransferService {
  constructor({ models, uploadsRoot, lease } = {}) {
    this.models = models || Object.fromEntries(Object.entries(schemaFiles).map(([key, file]) => [key, require(`../database/schemas/${file}Schema`)]));
    this.uploadsRoot = path.resolve(uploadsRoot || path.join(__dirname, '../../../uploads'));
    this.lease = lease || new Lease();
    this.journal = require('../database/schemas/ImportacionProyectoSchema');
    this.schema = Package.hash(Object.fromEntries(Object.entries(this.models).map(([key, model]) => [key,
      Object.entries(model.schema.paths).map(([p, s]) => [p, s.instance, s.enumValues || [], Boolean(s.isRequired)]).sort((a, b) => a[0].localeCompare(b[0]))])));
  }
  async owned(projectId, userId) {
    if (!mongoose.isValidObjectId(projectId)) throw Package.fail('Proyecto no encontrado.', 404);
    const row = await this.models.proyecto.findOne({ _id: projectId, usuario_id: userId }).lean();
    if (!row) throw Package.fail('Proyecto no encontrado.', 404);
    return row;
  }
  async snapshot(projectId, userId) {
    const project = await this.owned(projectId, userId);
    const data = { proyecto: [plain(project)] };
    for (const key of Package.GROUPS.filter(k => k !== 'proyecto')) data[key] = plain(await this.models[key].find({ proyecto_id: projectId }).sort({ createdAt: -1 }).lean());
    return data;
  }
  async export(projectId, userId) {
    await this.owned(projectId, userId);
    const lock = await this.lease.acquire(projectId);
    try {
      const jobs = require('../database/schemas/TrabajoGeneracionSchema');
      if (await jobs.exists({ proyecto_id: projectId, estado: { $in: ['encolado', 'procesando'] } })) throw Package.fail('Espera a que termine o cancela el procesamiento antes de exportar.', 409);
      const data = await this.snapshot(projectId, userId);
      const originalHash = Package.hash(data);
      const files = [];
      let totalFileBytes = 0;
      for (const source of data.fuentes) {
        if (!source.ruta_archivo) continue;
        const candidate = path.resolve(source.ruta_archivo);
        let absolute;
        try { absolute = await fs.realpath(candidate); } catch { throw Package.fail(`Falta el original de la fuente ${source.nombre_archivo}. No se exportó un paquete incompleto.`, 409); }
        const root = await fs.realpath(this.uploadsRoot);
        const relative = path.relative(root, absolute);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Package.fail('Una fuente apunta fuera del directorio de insumos. No se exportó.', 409);
        const stat = await fs.stat(absolute);
        totalFileBytes += stat.size;
        if (!stat.isFile() || totalFileBytes > 45 * 1024 * 1024) throw Package.fail('Los originales superan el máximo conjunto de 45 MB o una fuente no es un archivo.', 413);
        files.push({ id: source._id, base64: (await fs.readFile(absolute)).toString('base64') });
        source.ruta_archivo = `files/${source._id}`;
      }
      lock.assert();
      if (originalHash !== Package.hash(await this.snapshot(projectId, userId))) throw Package.fail('El proyecto cambió durante la exportación. Reintenta para obtener una copia consistente.', 409);
      const bundle = Package.create(data, files, this.schema);
      Package.verify(Buffer.from(JSON.stringify(bundle)), this.schema);
      return bundle;
    } finally { await lock.release(); }
  }
  verify(input) { return Package.verify(input, this.schema); }
  async import(input, userId, name, operationId = crypto.randomUUID()) {
    const bundle = this.verify(input);
    if (!mongoose.isValidObjectId(userId)) throw Package.fail('Sesión no válida.', 401);
    if (!/^[a-f\d-]{36}$/i.test(operationId)) throw Package.fail('Identificador de importación no válido.');
    const operation = Package.hash({ userId: String(userId), operationId });
    const packageHash = Package.hash(bundle.data);
    const previous = await this.journal.findById(operation).lean();
    if (previous) {
      if (previous.paquete_hash !== packageHash) throw Package.fail('La operación pertenece a otro paquete.', 409);
      if (previous.estado === 'completado') return previous.resultado;
      throw Package.fail('La importación ya está en curso o quedó interrumpida. Espera la recuperación o verifica el paquete para crear una nueva copia.', 409);
    }
    const mapping = new Map();
    for (const key of Package.GROUPS) for (const row of bundle.data[key]) mapping.set(row._id, id());
    const oldOwner = bundle.data.proyecto[0].usuario_id;
    if (oldOwner) mapping.set(oldOwner, String(userId));
    const data = rewrite(bundle.data, mapping);
    const newId = data.proyecto[0]._id;
    const directory = path.join(this.uploadsRoot, `import-${newId}`);
    const expectedPrefix = path.join(this.uploadsRoot, 'import-');
    if (!directory.startsWith(expectedPrefix) || path.dirname(directory) !== this.uploadsRoot) throw Package.fail('Directorio de importación no válido.');
    const project = data.proyecto[0];
    project.usuario_id = String(userId);
    project.nombre = String(name || `${project.nombre} (importado)`).trim().slice(0, 200);
    if (!project.nombre) throw Package.fail('Indica un nombre para la copia.');
    // No se reutilizan recibos de trabajos, verificaciones ejecutadas ni credenciales operativas.
    if (project.auditoria_requisitos) delete project.auditoria_requisitos.registro_generacion;
    for (const analysis of data.analisis) {
      analysis.usuario_id = String(userId);
      const old = bundle.data.analisis.find(a => mapping.get(a._id) === analysis._id);
      const newHash = require('./RequirementExecutionContext').hash(analysis.contenido);
      if (old.contenido_hash) mapping.set(old.contenido_hash, newHash);
      analysis.contenido_hash = newHash;
    }
    const remapped = rewrite(data, mapping);
    // source hashes depend on original text/file names, not storage paths or owner IDs.
    for (const source of remapped.fuentes) source.ruta_archivo = source.ruta_archivo ? path.join(directory, `${source._id}.bin`) : '';
    for (const plan of remapped.plan_codigo) plan.modo_un_clic = null;
    for (const artifact of remapped.artefactos_codigo) artifact.verificacion = null;
    const docs = {};
    for (const key of Package.GROUPS) docs[key] = remapped[key].map(row => {
      const doc = new this.models[key](row, null, { strict: 'throw' });
      const error = doc.validateSync();
      if (error) throw Package.fail(`Los datos de ${key} no son compatibles con esta versión de I-CASE.`, 409);
      return doc.toObject({ transform: false, depopulate: true, flattenMaps: true });
    });
    // Referencias explícitas del análisis se verifican antes de escribir.
    const initial = remapped.proyecto[0].auditoria_requisitos?.referencia_analisis_inicial;
    if (initial?.id && !remapped.analisis.some(a => a._id === initial.id)) throw Package.fail('La auditoría referencia un análisis que no está en el paquete.');
    const orderedHash = rows => Package.hash(rows.map(plain).sort((a, b) => String(a._id).localeCompare(String(b._id))));
    const result = { proyecto_id: newId, nombre: project.nombre, counts: bundle.manifest.counts,
      report_markdown: Package.report(bundle.manifest, `## Resultado de importación\n\nCopia creada: ${newId}\n\nRecuentos y lectura posterior de registros y originales: correctos.\n\nSe reasignaron IDs y propietario; se conservaron versiones y aprobaciones. No se iniciaron llamadas IA.\nSe omitieron recibos de trabajos y verificaciones de ejecución de código, que deben repetirse localmente.`) };
    const worker = crypto.randomUUID();
    try {
      await this.journal.create({ _id: operation, usuario_id: userId, proyecto_id: newId, paquete_hash: packageHash,
        estado: 'escribiendo', owner: worker, until: new Date(Date.now() + 120000),
        hashes: Object.fromEntries(Package.GROUPS.map(k => [k, orderedHash(docs[k])])),
        archivos: bundle.files.map(f => ({ nombre: `${mapping.get(f.id)}.bin`, sha256: bundle.manifest.files.find(m => m.id === f.id).sha256 })), resultado: result });
    } catch (e) { if (e.code === 11000) throw Package.fail('La misma importación ya está en curso. No se creó otra copia.', 409); throw e; }
    let lost = false;
    const heartbeat = setInterval(() => this.journal.updateOne({ _id: operation, owner: worker }, { $set: { until: new Date(Date.now() + 120000) } }).then(r => { if (!r.matchedCount) lost = true; }).catch(() => { lost = true; }), 20000);
    heartbeat.unref?.();
    const assertLease = async () => { if (lost || !await this.journal.exists({ _id: operation, owner: worker, estado: 'escribiendo' })) throw new Error('Se perdió la exclusión de la importación.'); };
    const written = [];
    let directoryCreated = false;
    try {
      await fs.mkdir(this.uploadsRoot, { recursive: true });
      await fs.mkdir(directory); directoryCreated = true;
      for (const file of bundle.files) {
        const newSourceId = mapping.get(file.id);
        const destination = path.join(directory, `${newSourceId}.bin`);
        await fs.writeFile(destination, Buffer.from(file.base64, 'base64'), { flag: 'wx' });
        if (Package.hash(await fs.readFile(destination)) !== bundle.manifest.files.find(f => f.id === file.id).sha256) throw new Error('La verificación del archivo escrito falló.');
      }
      // La copia no es visible hasta insertar el proyecto al final. No necesita replica set.
      for (const key of Package.GROUPS.filter(k => k !== 'proyecto')) {
        await assertLease();
        if (!docs[key].length) continue;
        written.push(key);
        await this.models[key].collection.insertMany(docs[key], { ordered: true });
        const readback = await this.models[key].find({ proyecto_id: newId }).sort({ _id: 1 }).lean();
        const expected = docs[key].map(plain).sort((a, b) => String(a._id).localeCompare(String(b._id)));
        if (Package.hash(plain(readback)) !== Package.hash(expected)) throw new Error(`No coinciden los datos escritos y leídos de ${key}.`);
      }
      written.push('proyecto');
      await assertLease();
      await this.models.proyecto.collection.insertOne(docs.proyecto[0]);
      const readProject = await this.models.proyecto.findOne({ _id: newId }).lean();
      if (Package.hash(plain(readProject)) !== Package.hash(plain(docs.proyecto[0]))) throw new Error('No coincide el proyecto importado.');
      await this.journal.updateOne({ _id: operation, owner: worker }, { $set: { estado: 'completado', until: null } });
      return result;
    } catch (error) {
      const claim = await this.journal.updateOne({ _id: operation, owner: worker }, { $set: { estado: 'limpiando' } });
      if (!claim.matchedCount) throw Package.fail('La recuperación de la importación está en curso. Recarga Mis proyectos después de unos minutos.', 409);
      let rollbackFailed = false;
      for (const key of written.reverse()) {
        try { await this.models[key].deleteMany(key === 'proyecto' ? { _id: newId } : { proyecto_id: newId }); } catch { rollbackFailed = true; }
      }
      if (directoryCreated) { try { await fs.rm(directory, { recursive: true, force: true }); } catch { rollbackFailed = true; } }
      console.error(`[Transferencia] Falló la copia ${newId}; rollback incompleto: ${rollbackFailed}`);
      await this.journal.updateOne({ _id: operation, owner: worker }, { $set: { estado: rollbackFailed ? 'limpiando' : 'fallido', until: rollbackFailed ? new Date(0) : null } });
      const failure = Package.fail(rollbackFailed ? 'La importación falló y la limpieza quedó pendiente. Contacta al administrador con el ID de copia: ' + newId : 'La importación falló. Se retiró la copia parcial; los proyectos existentes no se modificaron.', 500);
      failure.cause = error;
      throw failure;
    } finally { clearInterval(heartbeat); }
  }
  async recover() {
    const stale = await this.journal.find({ estado: { $in: ['escribiendo', 'limpiando'] }, until: { $lt: new Date() } }).limit(20).lean();
    for (const row of stale) {
      const worker = crypto.randomUUID();
      const claimed = await this.journal.findOneAndUpdate({ _id: row._id, owner: row.owner, until: { $lt: new Date() } }, { $set: { owner: worker, until: new Date(Date.now() + 120000) } }, { new: true }).lean();
      if (!claimed) continue;
      const projectId = String(row.proyecto_id);
      if (!/^[a-f\d]{24}$/i.test(projectId)) continue;
      const directory = path.join(this.uploadsRoot, `import-${projectId}`);
      let complete = row.estado === 'escribiendo';
      for (const key of Package.GROUPS) {
        const rows = await this.models[key].find(key === 'proyecto' ? { _id: projectId } : { proyecto_id: projectId }).sort({ _id: 1 }).lean();
        if (Package.hash(plain(rows)) !== row.hashes?.[key]) complete = false;
      }
      for (const f of row.archivos || []) {
        if (!/^[a-f\d]{24}\.bin$/i.test(f.nombre)) { complete = false; continue; }
        try { if (Package.hash(await fs.readFile(path.join(directory, f.nombre))) !== f.sha256) complete = false; } catch { complete = false; }
      }
      if (!complete) {
        for (const key of Package.GROUPS) await this.models[key].deleteMany(key === 'proyecto' ? { _id: projectId } : { proyecto_id: projectId });
        await fs.rm(directory, { recursive: true, force: true });
      }
      await this.journal.updateOne({ _id: row._id, owner: worker }, { $set: { estado: complete ? 'completado' : 'fallido', until: null } });
    }
  }
}
module.exports = ProjectTransferService;
