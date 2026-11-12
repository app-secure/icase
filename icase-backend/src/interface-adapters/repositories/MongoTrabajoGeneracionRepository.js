const TrabajoGeneracionModel = require('../../infrastructure/database/schemas/TrabajoGeneracionSchema');
const { randomUUID } = require('crypto');

class MongoTrabajoGeneracionRepository {
  async requirementsRecover() {
    await TrabajoGeneracionModel.updateMany({ tipo: 'requisitos', estado: { $in: ['encolado', 'procesando'] }, lease_expires_at: { $lte: new Date() } },
      { $set: { estado: 'interrumpido', lease_expires_at: null, mensaje: 'Trabajo interrumpido. Reanuda para continuar sin repetir etapas válidas.' } });
  }
  async requirementsGet(id) {
    const row = await TrabajoGeneracionModel.findOne({ _id: id, tipo: 'requisitos' }).lean();
    return row ? { ...row, id: String(row._id), proyecto_id: String(row.proyecto_id), usuario_id: String(row.usuario_id) } : null;
  }
  async requirementsLatest(projectId, operation = null) {
    const row = await TrabajoGeneracionModel.findOne({ proyecto_id: projectId, tipo: 'requisitos', ...(operation ? { operacion_requisitos: operation } : {}) }).sort({ createdAt: -1 }).lean();
    return row ? this.requirementsGet(row._id) : null;
  }
  async requirementsStart(data) {
    await this.requirementsRecover();
    const key = `requisitos:${data.proyecto_id}`;
    const existing = await TrabajoGeneracionModel.findOne({ clave_activa: key }).lean();
    if (existing) {
      if (existing.entrada_hash === data.entrada_hash) return { job: await this.requirementsGet(existing._id), created: false };
      if (['encolado', 'procesando'].includes(existing.estado)) throw Object.assign(new Error('Ya existe una generación activa.'), { status: 409 });
      await TrabajoGeneracionModel.updateOne({ _id: existing._id, estado: existing.estado }, { $unset: { clave_activa: 1 }, $set: { estado: 'fallido', mensaje: 'La entrada cambió; inicia una nueva generación.' } });
    }
    try {
      // El hash del prompt de cada etapa decide la reutilización. Nunca importar
      // checkpoints de otro usuario/proyecto ni respuestas sin validar.
      const previous = await TrabajoGeneracionModel.findOne({ proyecto_id: data.proyecto_id, usuario_id: data.usuario_id, tipo: 'requisitos' }).sort({ createdAt: -1 }).lean();
      const reusable = Object.fromEntries(Object.entries(previous?.checkpoints_requisitos || {}).filter(([, entry]) => entry.validated));
      const doc = await TrabajoGeneracionModel.create({ ...data, checkpoints_requisitos: reusable, tipo: 'requisitos', estado: 'encolado', clave_activa: key, ejecutor_id: this.ejecutorId, lease_expires_at: this.leaseUntil() });
      return { job: await this.requirementsGet(doc._id), created: true };
    } catch (err) {
      if (err.code !== 11000) throw err;
      const other = await TrabajoGeneracionModel.findOne({ clave_activa: key }).lean();
      return { job: await this.requirementsGet(other._id), created: false };
    }
  }
  async requirementsClaim(id) {
    const row = await TrabajoGeneracionModel.findOneAndUpdate({ _id: id, tipo: 'requisitos', estado: { $in: ['encolado', 'interrumpido', 'esperando_proveedor'] } },
      { $set: { estado: 'procesando', ejecutor_id: this.ejecutorId, lease_expires_at: this.leaseUntil(), error: null } }, { new: true }).lean();
    return row ? this.requirementsGet(row._id) : null;
  }
  async requirementsSave(id, changes, finish = false) {
    const update = { $set: { ...changes, lease_expires_at: finish ? null : this.leaseUntil() } };
    if (changes.estado === 'completado' || changes.estado === 'fallido') update.$unset = { clave_activa: 1 };
    const res = await TrabajoGeneracionModel.updateOne({ _id: id, tipo: 'requisitos', ejecutor_id: this.ejecutorId, estado: 'procesando', lease_expires_at: { $gt: new Date() } }, update);
    if (!res.matchedCount) throw Object.assign(new Error('El trabajo perdió su lease.'), { code: 'REQUIREMENTS_LEASE_LOST' });
  }
  constructor() {
    this.ejecutorId = randomUUID();
    this.leaseMs = Number(process.env.GENERATION_JOB_LEASE_MS || 120000);
  }

  leaseUntil() {
    return new Date(Date.now() + this.leaseMs);
  }

  async crearORecuperarActivo({ proyectoId, pantallas, insumoAdicional, requerimientosLocales, soloReparar = false }) {
    const claveActiva = `mockups:${proyectoId}`;
    let existente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
    if (existente && existente.ejecutor_id === this.ejecutorId) {
      return { trabajo: existente.toJSON(), creado: false };
    }
    if (existente) {
      await TrabajoGeneracionModel.findByIdAndUpdate(existente._id, {
        $set: {
          estado: 'fallido',
          progreso: 100,
          mensaje: 'Trabajo interrumpido por reinicio del servidor',
          error: 'La generación fue interrumpida. Inicia un nuevo intento.'
        },
        $unset: { clave_activa: 1 }
      });
      existente = null;
    }

    try {
      const creado = await TrabajoGeneracionModel.create({
        proyecto_id: proyectoId,
        tipo: 'mockups',
        pantallas,
        solo_reparar: soloReparar,
        insumo_adicional: insumoAdicional,
        requerimientos_locales: requerimientosLocales,
        ejecutor_id: this.ejecutorId,
        clave_activa: claveActiva
      });
      return { trabajo: creado.toJSON(), creado: true };
    } catch (error) {
      if (error?.code === 11000) {
        const concurrente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
        if (concurrente) return { trabajo: concurrente.toJSON(), creado: false };
      }
      throw error;
    }
  }

  async crearORecuperarActivoDiagrama({ proyectoId, tipoDiagrama, insumoBruto = '', insumoAdicional = '', provider = 'auto', specificModel = null, regenerar = false }) {
    const claveActiva = `diagrama:${proyectoId}:${tipoDiagrama}`;
    const existente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
    if (existente && existente.lease_expires_at && existente.lease_expires_at > new Date()) {
      return { trabajo: existente.toJSON(), creado: false, reanudado: false };
    }
    if (existente) {
      const reclamado = await TrabajoGeneracionModel.findOneAndUpdate(
        { _id: existente._id, clave_activa: claveActiva },
        { $set: {
          estado: 'encolado', progreso: 0, mensaje: 'Reanudando generación de diagrama', error: null,
          ejecutor_id: this.ejecutorId, lease_expires_at: this.leaseUntil(),
          insumo_bruto: insumoBruto, insumo_adicional: insumoAdicional,
          provider, specific_model: specificModel, regenerar: regenerar === true, objetivo: 'diagramas', tipo_diagrama: tipoDiagrama
        } },
        { new: true }
      );
      return { trabajo: reclamado.toJSON(), creado: true, reanudado: true };
    }
    try {
      const creado = await TrabajoGeneracionModel.create({
        proyecto_id: proyectoId,
        tipo: 'diagrama',
        tipo_diagrama: tipoDiagrama,
        insumo_bruto: insumoBruto,
        insumo_adicional: insumoAdicional,
        provider,
        specific_model: specificModel,
        regenerar: regenerar === true,
        objetivo: 'diagramas',
        ejecutor_id: this.ejecutorId,
        lease_expires_at: this.leaseUntil(),
        clave_activa: claveActiva
      });
      return { trabajo: creado.toJSON(), creado: true, reanudado: false };
    } catch (error) {
      if (error?.code === 11000) {
        const concurrente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
        if (concurrente) return { trabajo: concurrente.toJSON(), creado: false, reanudado: false };
      }
      throw error;
    }
  }

  async obtenerPorId(id) {
    const trabajo = await TrabajoGeneracionModel.findById(id);
    return trabajo ? trabajo.toJSON() : null;
  }

  async obtenerUltimoPorProyecto(proyectoId) {
    const trabajo = await TrabajoGeneracionModel
      .findOne({ proyecto_id: proyectoId, tipo: 'mockups' })
      .sort({ createdAt: -1 });
    return trabajo ? trabajo.toJSON() : null;
  }

  async obtenerPayloadDiagrama(id) {
    const trabajo = await TrabajoGeneracionModel.findById(id).lean();
    if (!trabajo || trabajo.tipo !== 'diagrama') return null;
    return {
      proyectoId: String(trabajo.proyecto_id),
      tipoDiagrama: trabajo.tipo_diagrama,
      insumoBruto: trabajo.insumo_bruto || '',
      insumoAdicional: trabajo.insumo_adicional || '',
      provider: trabajo.provider || 'auto',
      specificModel: trabajo.specific_model || null,
      regenerar: trabajo.regenerar === true
    };
  }

  async obtenerUltimoDiagramaPorProyecto(proyectoId, tipoDiagrama = null) {
    const filtro = { proyecto_id: proyectoId, tipo: 'diagrama' };
    if (tipoDiagrama) filtro.tipo_diagrama = tipoDiagrama;
    const trabajo = await TrabajoGeneracionModel.findOne(filtro).sort({ createdAt: -1 });
    return trabajo ? trabajo.toJSON() : null;
  }

  async reclamarDiagramasExpirados() {
    const candidatos = await TrabajoGeneracionModel.find({
      tipo: 'diagrama',
      estado: { $in: ['encolado', 'procesando'] },
      $or: [{ lease_expires_at: null }, { lease_expires_at: { $lte: new Date() } }]
    }).limit(10);
    const reclamados = [];
    for (const candidato of candidatos) {
      const trabajo = await TrabajoGeneracionModel.findOneAndUpdate(
        { _id: candidato._id, estado: { $in: ['encolado', 'procesando'] }, lease_expires_at: candidato.lease_expires_at },
        { $set: {
          estado: 'encolado', progreso: 0, mensaje: 'Reanudando después de una interrupción',
          ejecutor_id: this.ejecutorId, lease_expires_at: this.leaseUntil(), error: null
        } },
        { new: true }
      );
      if (trabajo) reclamados.push(trabajo.toJSON());
    }
    return reclamados;
  }

  async crearORecuperarActivoVerificacion({ proyectoId, artefactoId }) {
    const claveActiva = `verificacion:${proyectoId}:${artefactoId}`;
    let existente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
    if (existente && existente.lease_expires_at && existente.lease_expires_at > new Date()) {
      return { trabajo: existente.toJSON(), creado: false };
    }
    if (existente) {
      await TrabajoGeneracionModel.findByIdAndUpdate(existente._id, {
        $set: {
          estado: 'fallido',
          progreso: 100,
          mensaje: 'Verificación interrumpida',
          error: 'La verificación fue interrumpida. Inicia un nuevo intento.'
        },
        $unset: { clave_activa: 1 }
      });
      existente = null;
    }

    try {
      const creado = await TrabajoGeneracionModel.create({
        proyecto_id: proyectoId,
        tipo: 'verificacion',
        artefacto_id: artefactoId,
        ejecutor_id: this.ejecutorId,
        clave_activa: claveActiva,
        lease_expires_at: this.leaseUntil(),
        estado: 'encolado',
        progreso: 5,
        mensaje: 'Verificación en cola'
      });
      return { trabajo: creado.toJSON(), creado: true };
    } catch (error) {
      if (error?.code === 11000) {
        const concurrente = await TrabajoGeneracionModel.findOne({ clave_activa: claveActiva });
        if (concurrente) return { trabajo: concurrente.toJSON(), creado: false };
      }
      throw error;
    }
  }

  async obtenerUltimaVerificacionPorArtefacto(proyectoId, artefactoId) {
    const trabajo = await TrabajoGeneracionModel
      .findOne({ proyecto_id: proyectoId, tipo: 'verificacion', artefacto_id: artefactoId })
      .sort({ createdAt: -1 });
    return trabajo ? trabajo.toJSON() : null;
  }

  async finalizarVerificacionesExpiradas() {
    const now = new Date();
    return TrabajoGeneracionModel.updateMany({
      tipo: 'verificacion', estado: { $in: ['encolado', 'procesando'] },
      $or: [{ lease_expires_at: { $lte: now } }, { lease_expires_at: null, updatedAt: { $lte: new Date(Date.now() - this.leaseMs) } }]
    }, {
      $set: { estado: 'fallido', progreso: 100, mensaje: 'Verificación interrumpida', error: 'La verificación perdió su proceso ejecutor. Inicia un nuevo intento; los archivos se conservaron.' },
      $unset: { clave_activa: 1 }
    });
  }

  async renovarLeaseVerificacion(id) {
    const result = await TrabajoGeneracionModel.updateOne({ _id: id, tipo: 'verificacion', ejecutor_id: this.ejecutorId,
      estado: { $in: ['encolado', 'procesando'] }, lease_expires_at: { $gt: new Date() } }, { $set: { lease_expires_at: this.leaseUntil() } });
    return result.matchedCount === 1;
  }

  async actualizar(id, cambios, finalizar = false) {
    const update = { $set: { ...cambios, ...(finalizar ? {} : { lease_expires_at: this.leaseUntil() }) } };
    if (finalizar) update.$unset = { clave_activa: 1 };
    const trabajo = await TrabajoGeneracionModel.findByIdAndUpdate(id, update, { new: true });
    return trabajo ? trabajo.toJSON() : null;
  }
}

module.exports = MongoTrabajoGeneracionRepository;
