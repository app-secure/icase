const crypto = require('crypto');
const GenerationCapabilityService = require('./GenerationCapabilityService');

class GenerationCoverageService {
  constructor() { this.capabilities = new GenerationCapabilityService(); }

  huellaRequisito(requirement) {
    return crypto.createHash('sha256').update(JSON.stringify([
      requirement.identificador || '', requirement.nombre || '', requirement.descripcion || '',
      requirement.actores || [], requirement.precondiciones || '', requirement.poscondiciones || '',
      requirement.metrica_medible || ''
    ])).digest('hex');
  }

  validar(value = {}) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La cobertura debe ser un objeto.');
    const mode = value.modo_entrega || 'parcial';
    if (!['parcial', 'completa'].includes(mode)) errors.push('Modo de entrega inválido.');
    if (value.requisitos !== undefined && !Array.isArray(value.requisitos)) errors.push('La cobertura requiere una lista de requisitos.');
    const seen = new Set();
    const known = new Set(this.capabilities.catalogo().map((item) => item.id));
    const requisitos = (Array.isArray(value.requisitos) ? value.requisitos : []).map((item) => {
      if (!item || typeof item !== 'object') { errors.push('Declaración de cobertura inválida.'); return {}; }
      const id = String(item.requisito || '').trim();
      if (!id || seen.has(id)) errors.push('Requisito ausente o repetido en cobertura.');
      seen.add(id);
      if (!['crud', 'personalizado'].includes(item.tipo)) errors.push(`Define CRUD o personalizado para ${id}.`);
      if (!Array.isArray(item.capacidades) || item.capacidades.some((capability) => !known.has(capability))) errors.push(`Capacidad desconocida en ${id}.`);
      if (typeof item.confirmado !== 'boolean') errors.push(`La confirmación de ${id} debe ser explícita.`);
      if (item.confirmado && !/^[a-f0-9]{64}$/.test(item.huella_requisito || '')) errors.push(`Falta la huella del requisito ${id}.`);
      return { requisito: id, tipo: item.tipo, capacidades: [...new Set(Array.isArray(item.capacidades) ? item.capacidades : [])].sort(),
        confirmado: item.confirmado === true, justificacion: String(item.justificacion || '').trim(),
        huella_requisito: String(item.huella_requisito || '') };
    });
    if (errors.length) throw new Error(errors.join(' '));
    return { modo_entrega: mode, aceptar_pendientes: value.aceptar_pendientes === true, requisitos };
  }

  evaluar({ requisitos = [], contrato = {}, declaracion = {}, stack = {} }) {
    const value = this.validar(declaracion);
    const rf = requisitos.filter((item) => item.tipo === 'RF' && item.aprobado !== false);
    const operations = new Map((contrato.operations || []).map((item) => [item.id, item]));
    const entities = new Set((contrato.entities || []).map((item) => item.key));
    const knownRequirements = new Set(rf.map((item) => item.identificador));
    const blockers = [];
    const operationIds = (contrato.operations || []).map((item) => item.id);
    if (new Set(operationIds).size !== operationIds.length) blockers.push('El contrato tiene identificadores RF repetidos en operaciones.');
    for (const item of value.requisitos) if (!knownRequirements.has(item.requisito)) blockers.push(`La declaración cita un RF inexistente: ${item.requisito}.`);
    const items = rf.map((requirement) => {
      const id = requirement.identificador;
      const operation = operations.get(id);
      const declaration = value.requisitos.find((item) => item.requisito === id);
      const suggestions = this.capabilities.sugerir(requirement);
      const confirmed = declaration?.confirmado && declaration.huella_requisito === this.huellaRequisito(requirement);
      const reasons = [];
      if (!confirmed) reasons.push('Falta confirmar el alcance de la versión actual del RF.');
      const omitted = suggestions.filter((item) => !(declaration?.capacidades || []).includes(item.id));
      if (confirmed && omitted.length && declaration.justificacion.length < 10) reasons.push('Justifica las sugerencias descartadas con al menos 10 caracteres.');
      const capabilities = confirmed ? declaration.capacidades : suggestions.map((item) => item.id);
      if (!operation || !entities.has(operation.entity)) reasons.push('No hay operación asociada por identificador a una entidad tipada.');
      else if (!(operation.methods || []).includes('GET') || (operation.methods || []).some((method) => !['GET', 'POST', 'PATCH', 'DELETE'].includes(method))) reasons.push('La operación no declara GET y métodos válidos.');
      if (declaration?.tipo === 'personalizado') reasons.push('El comportamiento personalizado necesita implementación y pruebas específicas.');
      if (capabilities.length) reasons.push(`Capacidades sin implementación: ${capabilities.join(', ')}.`);
      blockers.push(...reasons.map((reason) => `${id}: ${reason}`));
      return { requisito: id, operacion: operation?.key || null, entidad: operation?.entity || null,
        tipo: declaration?.tipo || null, confirmado: Boolean(confirmed), capacidades: capabilities,
        sugerencias: suggestions, huella_requisito: this.huellaRequisito(requirement),
        estado: reasons.length ? 'pendiente' : 'alcance_base_cubierto', motivos: reasons };
    });
    if (!rf.length) blockers.push('No hay RF aprobados para evaluar.');
    if ((contrato.relations || []).some((r) => r.cardinalidad === 'muchos_a_muchos')) blockers.push('Relaciones N:M con soporte dependiente del stack y verificación integral pendiente; consulta storage.associations del manifiesto.');
    if (stack.tiempo_real) blockers.push('El stack solicita tiempo real y todavía no existe ese módulo.');
    const pendiente = blockers.length > 0;
    return {
      version: 1, modo_entrega: value.modo_entrega, aceptar_pendientes: value.aceptar_pendientes,
      estado: pendiente ? 'pendiente' : 'alcance_base_cubierto',
      semantica: 'No certificada: se evalúa el alcance de los generadores, no todas las reglas del negocio ni los RNF.',
      ejecucion: 'Requiere verificación técnica independiente para la huella actual de archivos.',
      exportable: value.modo_entrega === 'parcial' ? value.aceptar_pendientes : !pendiente,
      bloqueos: blockers, requisitos: items
    };
  }

  exigirEntrega(artifact) {
    const file = artifact.archivos?.find((item) => item.ruta === 'backend/GENERATION-REPORT.json');
    let report;
    try { report = JSON.parse(file?.contenido || '{}'); } catch { throw new Error('El informe de cobertura no es válido.'); }
    if (!report.fuente_cobertura) throw new Error('Regenera el backend para obtener el contrato de cobertura actualizado.');
    const manifestFile = artifact.archivos?.find((item) => item.ruta === 'backend/icase.manifest.json');
    let manifest;
    try { manifest = JSON.parse(manifestFile?.contenido || 'null'); } catch { throw new Error('El manifiesto no es válido.'); }
    if (!manifest || JSON.stringify(manifest) !== JSON.stringify(report.fuente_cobertura.contrato)) {
      throw new Error('El informe no corresponde al contrato actual; regenera el backend y revisa la cobertura.');
    }
    const assessment = this.evaluar(report.fuente_cobertura);
    if (!assessment.exportable) throw new Error(assessment.modo_entrega === 'parcial'
      ? 'Confirma la entrega parcial y sus limitaciones en la etapa Módulos; regenera el backend.'
      : `La entrega completa tiene alcance pendiente: ${assessment.bloqueos.join(' ')}`);
    return assessment;
  }
}

module.exports = GenerationCoverageService;
