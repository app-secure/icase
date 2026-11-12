const { randomUUID } = require('node:crypto');
const Model = require('../database/schemas/ProjectMutationLeaseSchema');

class ProjectMutationLease {
  async acquire(projectId, { waitMs = 10000, retryMs = 200 } = {}) {
    const owner = randomUUID();
    const projectKey = String(projectId);
    const deadline = Date.now() + Math.max(0, waitMs);
    let acquired = false;

    while (!acquired) {
      const now = new Date();
      try {
        // No usar upsert con un filtro que excluye leases activos: Mongo intentaria
        // insertar el mismo _id y convertiria una carrera normal en un falso bloqueo.
        const row = await Model.findOneAndUpdate({
          _id: projectKey,
          $or: [{ until: { $lte: now } }, { until: null }, { until: { $exists: false } }]
        }, { $set: { owner, until: new Date(Date.now() + 60000) } }, { new: true }).lean();

        if (row?.owner === owner) {
          acquired = true;
          break;
        }

        // Crear solo si no habia lease. Si otra peticion se adelanta, la clave
        // duplicada se trata como contencion y no como error del almacenamiento.
        try {
          await Model.create({ _id: projectKey, owner, until: new Date(Date.now() + 60000) });
          acquired = true;
        } catch (error) {
          if (error?.code !== 11000) throw error;
        }
      } catch (error) {
        throw Object.assign(new Error('No se pudo comprobar el bloqueo de escritura. Intenta nuevamente.'), {
          status: 503,
          expose: true,
          cause: error
        });
      }

      if (!acquired && Date.now() >= deadline) {
        throw Object.assign(new Error('El proyecto sigue ocupado por otra operacion. Espera a que termine y reintenta.'), {
          status: 409,
          expose: true
        });
      }
      if (!acquired) await new Promise(resolve => setTimeout(resolve, retryMs));
    }

    let lost = false;
    let released = false;
    const timer = setInterval(() => {
      Model.updateOne({ _id: projectKey, owner }, { $set: { until: new Date(Date.now() + 60000) } })
        .then(result => { if (!result.matchedCount) lost = true; })
        .catch(() => { lost = true; });
    }, 15000);
    timer.unref?.();

    return {
      assert: () => { if (lost) throw new Error('Lease de escritura perdido.'); },
      release: async () => {
        if (released) return;
        released = true;
        clearInterval(timer);
        await Model.deleteOne({ _id: projectKey, owner });
      }
    };
  }
}

module.exports = ProjectMutationLease;
