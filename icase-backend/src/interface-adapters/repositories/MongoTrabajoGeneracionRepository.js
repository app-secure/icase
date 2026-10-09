const TrabajoGeneracionModel = require('../../infrastructure/database/schemas/TrabajoGeneracionSchema');
const { randomUUID } = require('crypto');

class MongoTrabajoGeneracionRepository {
  constructor() {
    this.ejecutorId = randomUUID();
    this.leaseMs = Number(process.env.GENERATION_JOB_LEASE_MS || 120000);
  }

  leaseUntil() {
    return new Date(Date.now() + this.leaseMs);
  }

  async crearORecuperarActivo({ proyectoId, pantallas, insumoAdicional, requerimientosLocales }) {
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

  async crearORecuperarActivoDiagrama({ proyectoId, tipoDiagrama, insumoBruto = '', insumoAdicional = '', provider = 'auto', specificModel = null }) {
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
          provider, specific_model: specificModel, objetivo: 'diagramas', tipo_diagrama: tipoDiagrama
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
      specificModel: trabajo.specific_model || null
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

  async actualizar(id, cambios, finalizar = false) {
    const update = { $set: { ...cambios, ...(finalizar ? {} : { lease_expires_at: this.leaseUntil() }) } };
    if (finalizar) update.$unset = { clave_activa: 1 };
    const trabajo = await TrabajoGeneracionModel.findByIdAndUpdate(id, update, { new: true });
    return trabajo ? trabajo.toJSON() : null;
  }
}

module.exports = MongoTrabajoGeneracionRepository;
