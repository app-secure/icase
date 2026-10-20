const { CAPABILITIES, GENERAL_LIMITS } = require('../constants/GenerationCapabilities');

const LEVELS = Object.freeze({
  completo: 'Completo',
  solo_datos: 'Solo datos',
  no_soportado: 'No soportado'
});

const clean = (value) => String(value || '').trim();

/**
 * Informe de qué se generó de cada requisito.
 *
 * - completo: tiene entidad del modelo de dominio y no se detectó nada que el generador no produzca; se generan
 *   alta, consulta, edición y baja con validación de tipos, reglas confirmadas y permisos.
 * - solo_datos: solo se genera el almacén de datos (esquema genérico sin entidad, o la entidad sin la capacidad pedida).
 * - no_soportado: el requisito pide algo que el generador no produce y no hay entidad que lo sostenga.
 *
 * Es determinista y no usa IA. La detección de capacidades es por palabras clave: puede dejar pasar un RF que pide algo
 * con otras palabras, por eso el informe lo dice.
 */
class GenerationReportService {
  /**
   * @param {{ proyecto?: object, requisitos: Array (aprobados, los mismos con los que se construyó el contrato), contrato: object, stack?: object, plataformas?: string[] }} entrada
   *   `contrato` es el contrato de aplicación del backend (operaciones y entidades).
   */
  build({ proyecto = {}, requisitos = [], contrato = {}, stack = {}, plataformas = [] }) {
    const rf = requisitos.filter((item) => item.tipo === 'RF');
    const rnf = requisitos.filter((item) => item.tipo === 'RNF');
    const operations = new Map((contrato.operations || []).map((item) => [item.id, item]));
    const entities = new Map((contrato.entities || []).map((item) => [item.key, item]));
    const hayModelo = (contrato.entities || []).length > 0;

    const items = rf.map((requirement, index) => {
      const operation = operations.get(requirement.identificador) || [...operations.values()][index];
      const entity = operation?.entity ? entities.get(operation.entity) : null;
      const capabilities = this._capabilities(requirement);
      const reasons = [];
      let level;
      if (!capabilities.length && entity) level = 'completo';
      else if (capabilities.length && !entity) level = 'no_soportado';
      else level = 'solo_datos';

      if (entity) reasons.push(`Se gestionan los datos de «${entity.name}» (alta, consulta, edición y baja).`);
      else reasons.push(hayModelo
        ? 'No se asoció a ninguna entidad del modelo de dominio: guarda registros con campos libres, sin validación de tipos.'
        : 'No hay un diagrama de clases de dominio aprobado: guarda registros con campos libres, sin validación de tipos.');
      for (const capability of capabilities) reasons.push(`No se genera: ${capability.etiqueta.toLowerCase()}. ${capability.alternativa}`);

      return {
        id: requirement.identificador || operation?.id || `RF-${index + 1}`,
        nombre: clean(requirement.nombre),
        nivel: level,
        entidad: entity?.name || null,
        reglas: operation?.rules?.length || 0,
        motivos: reasons,
        capacidades: capabilities
      };
    });

    const pending = new Map();
    for (const item of items) {
      for (const capability of item.capacidades) {
        const group = pending.get(capability.id) || { id: capability.id, etiqueta: capability.etiqueta, alternativa: capability.alternativa, requisitos: [], stack: null };
        group.requisitos.push(item.id);
        pending.set(capability.id, group);
      }
    }
    const realtime = clean(stack.tiempo_real);
    if (realtime) {
      const base = CAPABILITIES.find((item) => item.id === 'tiempo_real');
      const group = pending.get('tiempo_real') || { id: base.id, etiqueta: base.etiqueta, alternativa: base.alternativa, requisitos: [], stack: null };
      group.stack = realtime;
      pending.set('tiempo_real', group);
    }

    const notes = [];
    if (plataformas.includes('móvil')) notes.push('La app móvil es un paquete Expo (React Native) sin firmar: no es un APK ni un IPA instalable y solo se verificó su empaquetado para Android.');
    if (rnf.length) notes.push(`${rnf.length} ${rnf.length === 1 ? 'requisito no funcional' : 'requisitos no funcionales'}: no se convierten en código ni se miden (rendimiento, disponibilidad, seguridad); como mucho influyen en la infraestructura propuesta.`);

    const mapped = new Set((contrato.operations || []).map((item) => item.entity).filter(Boolean));
    const count = (level) => items.filter((item) => item.nivel === level).length;
    return {
      version: 1,
      proyecto: clean(proyecto.nombre) || 'Proyecto',
      deteccion: 'Las capacidades no soportadas se detectan por palabras clave en el nombre, la descripción y la métrica de cada RF. Un RF «completo» puede pedir algo con otras palabras: revísalo.',
      resumen: { total: items.length, completo: count('completo'), solo_datos: count('solo_datos'), no_soportado: count('no_soportado') },
      requisitos: items,
      capacidades_no_generadas: [...pending.values()],
      entidades_sin_requisito: (contrato.entities || []).filter((item) => !mapped.has(item.key)).map((item) => item.name),
      notas: notes,
      limites_generales: [...GENERAL_LIMITS]
    };
  }

  _capabilities(requirement) {
    const fields = [['nombre', requirement.nombre], ['descripción', requirement.descripcion], ['métrica', requirement.metrica_medible]];
    const found = [];
    for (const capability of CAPABILITIES) {
      for (const [field, value] of fields) {
        const match = clean(value).match(capability.patron);
        if (!match) continue;
        found.push({ id: capability.id, etiqueta: capability.etiqueta, evidencia: `${field}: «${match[0].trim()}»`, alternativa: capability.alternativa });
        break;
      }
    }
    return found;
  }

  toMarkdown(report) {
    const label = (level) => LEVELS[level] || level;
    const rows = report.requisitos.map((item) => `| ${item.id} | ${item.nombre.replace(/\|/g, '/')} | ${label(item.nivel)} | ${item.entidad || '—'} | ${item.reglas} |`);
    const lines = [
      `# Informe de generación — ${report.proyecto}`,
      '',
      `Requisitos funcionales: ${report.resumen.total}. Completos: ${report.resumen.completo}. Solo datos: ${report.resumen.solo_datos}. No soportados: ${report.resumen.no_soportado}.`,
      '',
      '- **Completo**: alta, consulta, edición y baja con validación de tipos, reglas confirmadas y permisos.',
      '- **Solo datos**: solo se guardan y consultan registros; parte de lo pedido no se genera.',
      '- **No soportado**: el requisito pide algo que el generador no produce y no hay entidad que lo sostenga.',
      '',
      '| RF | Nombre | Nivel | Entidad | Reglas |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      ''
    ];
    const detail = report.requisitos.filter((item) => item.nivel !== 'completo');
    if (detail.length) {
      lines.push('## Qué falta en cada requisito', '');
      for (const item of detail) {
        lines.push(`### ${item.id} · ${item.nombre} (${label(item.nivel)})`);
        for (const reason of item.motivos) lines.push(`- ${reason}`);
        for (const capability of item.capacidades) lines.push(`- Detectado en ${capability.evidencia}.`);
        lines.push('');
      }
    }
    if (report.capacidades_no_generadas.length) {
      lines.push('## Capacidades pedidas que no se generan', '');
      for (const item of report.capacidades_no_generadas) {
        const where = [item.requisitos.length ? `en ${item.requisitos.join(', ')}` : '', item.stack ? `en el stack (${item.stack})` : ''].filter(Boolean).join(' y ');
        lines.push(`- **${item.etiqueta}** — ${where}. ${item.alternativa}`);
      }
      lines.push('');
    }
    if (report.entidades_sin_requisito.length) {
      lines.push('## Entidades sin requisito', '', `Estas entidades del modelo tienen tabla pero ningún RF las usa, así que no tienen API ni pantalla: ${report.entidades_sin_requisito.join(', ')}.`, '');
    }
    if (report.notas.length) lines.push('## Notas', '', ...report.notas.map((item) => `- ${item}`), '');
    lines.push('## Límites de toda la aplicación generada', '', ...report.limites_generales.map((item) => `- ${item}`), '', `_${report.deteccion}_`, '');
    return lines.join('\n');
  }
}

GenerationReportService.LEVELS = LEVELS;
module.exports = GenerationReportService;
