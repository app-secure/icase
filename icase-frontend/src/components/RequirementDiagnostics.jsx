import React from 'react';

const repairLabels = {
  sin_respuesta_utilizable: 'Sin respuesta utilizable; se conservó el borrador',
  parche_rechazado: 'Cambio rechazado por introducir errores',
  pendiente: 'Corrección parcial; quedan incidencias',
  estructura_validada: 'Cambio validado estructuralmente; no acredita exhaustividad'
};

function WarningCards({ findings, empty, onCorrect }) {
  if (!findings.length) return <p className="mt-1">{empty}</p>;
  return findings.map((finding, i) => <div key={`${finding.codigo}-${finding.requisito || finding.necesidad || i}`} className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <p className="font-semibold">{finding.requisito || finding.necesidad || 'Análisis'} · {finding.codigo}</p>
      {finding.requisito && onCorrect && <button type="button" onClick={() => onCorrect(finding.requisito)} className="rounded-full bg-amber-800 px-3 py-1 text-xs font-semibold text-white">Corregir {finding.requisito}</button>}
    </div>
    <p>{finding.mensaje}</p><p className="mt-1">Qué revisar: {finding.accion_propuesta}</p>
  </div>);
}

export default function RequirementDiagnostics({ audit, onCorrect = null }) {
  if (!audit) return null;
  const control = audit.control_aprobacion;
  const quality = control?.calidad;
  const generation = audit.diagnostico_generacion;
  const refinement = audit.diagnostico_refinamiento;
  const warnings = quality?.hallazgos?.filter(f => f.severidad !== 'error') || [];
  const metrics = warnings.filter(finding => finding.codigo === 'METRICA_PENDIENTE');
  const otherWarnings = warnings.filter(finding => finding.codigo !== 'METRICA_PENDIENTE');
  const pending = audit.preguntas_pendientes || [];
  const semantic = audit.revision_semantica;
  return <section aria-label="Resumen de validación de requisitos" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <h3 className="font-semibold">Pendiente de acuerdo</h3>
    <details className="mt-3" open={metrics.length > 0}>
      <summary className="cursor-pointer font-semibold">Advertencias de métrica · {metrics.length}</summary>
      <WarningCards findings={metrics} empty="No hay métricas pendientes de acuerdo." onCorrect={onCorrect} />
    </details>
    <details className="mt-3" open={otherWarnings.length > 0}>
      <summary className="cursor-pointer font-semibold">Advertencias de calidad · {otherWarnings.length}</summary>
      <WarningCards findings={otherWarnings} empty="No se detectaron otras advertencias en estos controles." onCorrect={onCorrect} />
    </details>
    <details className="mt-3" open={pending.length > 0}>
      <summary className="cursor-pointer font-semibold">Decisiones pendientes · {pending.length}</summary>
      {pending.length ? pending.map((item, i) => <p key={item.id || i} className="mt-1">{item.id}: {item.necesidad}</p>) : <p className="mt-1">No se registraron preguntas pendientes.</p>}
    </details>
    <details className="mt-3">
      <summary className="cursor-pointer font-semibold">Detalle de la generación</summary>
      <p className="mt-2">Estructura: {!control ? 'sin comprobación registrada' : control.bloqueado ? 'con errores que impiden aprobar' : 'sin bloqueos detectados'}.</p>
      <p>Revisión semántica: {semantic?.estado === 'completada' ? 'ejecutada; revisa sus hallazgos' : semantic?.estado === 'parcial' ? 'parcial; faltan categorías por contrastar o respuestas válidas' : 'no completada o no registrada'}.</p>
      {!!semantic?.contraste_categorias?.pendientes?.length && <p className="mt-1">Categorías por revisar: {semantic.contraste_categorias.pendientes.join(', ')}.</p>}
      <p className="mt-1 text-xs text-slate-500">Aprobar es una decisión humana; no certifica exhaustividad ni implementación. Las advertencias no equivalen a errores bloqueantes.</p>
      {audit.metricas_ejecucion && <p className="mt-2 text-xs text-slate-500">Generación: {(audit.metricas_ejecucion.duracion_ms / 1000).toFixed(1)} s · {audit.metricas_ejecucion.intentos_http} solicitudes al proveedor · {audit.metricas_ejecucion.presupuesto_agotado ? 'presupuesto agotado; revisar cobertura' : 'dentro del presupuesto'}</p>}
      {audit.revision_inventario && <div className="mt-3">
        <p className="font-semibold">Revisión de objetivos del inventario · {audit.revision_inventario.estado}</p>
        <p className="mt-1">Candidatos: {(audit.revision_inventario.candidatos || []).join(', ') || 'ninguno'}. Las señales léxicas no prueban que un objetivo esté mal agrupado.</p>
        {(audit.revision_inventario.causas || []).map((item, index) => <p key={index}>{item.id}: {(item.errores || []).join(', ')}</p>)}
      </div>}
      {generation && <div className="mt-3">
        <p className="font-semibold">Cobertura de generación · {generation.necesidades_pendientes?.length || 0} necesidades sin referencia</p>
        <p className="mt-1 text-xs">Una referencia no demuestra que el contenido implemente completamente la necesidad.</p>
        {(generation.lotes || []).map(batch => <p key={batch.lote} className="mt-1">Lote {batch.lote}: {batch.requisitos_recibidos} requisitos recibidos. {batch.necesidades_sin_referencia?.length ? `Sin referencia en la primera respuesta: ${batch.necesidades_sin_referencia.join(', ')}.` : 'Todas las necesidades del lote fueron referenciadas.'}</p>)}
        {!!generation.necesidades_pendientes?.length && <p className="mt-2">Pendientes al finalizar: {generation.necesidades_pendientes.join(', ')}.</p>}
      </div>}
      {!!quality?.vinculos?.length && <div className="mt-3">
        <p className="font-semibold">Vínculos declarados a reglas y restricciones</p>
        <p className="text-xs">Solo se muestran asociaciones declaradas; no se deducen por palabras similares.</p>
        {quality.vinculos.map((link, i) => <p key={link.requisito || i} className="mt-1">{link.requisito}: {link.elementos_relacionados.length ? link.elementos_relacionados.map(n => `${n.id} (${n.tipo}, ${n.estado || 'sin estado'})`).join('; ') : 'sin elementos auxiliares vinculados'}</p>)}
      </div>}
      {semantic && <div className="mt-3">
        <p className="font-semibold">Revisión semántica del insumo</p>
        <p className="mt-1">{semantic.estado === 'completada' ? 'Revisión ejecutada' : semantic.estado === 'parcial' ? 'Revisión parcial: faltan contrastes válidos de categorías' : 'No se pudo completar la revisión'} · {(semantic.hallazgos || []).length} hallazgos.</p>
        <p className="text-xs text-slate-500">Las citas fueron comprobadas; su interpretación sigue siendo una evaluación de IA, no una garantía de exhaustividad.</p>
        {(semantic.hallazgos || []).map(item => <p key={item.id} className="mt-2">{item.id} · {item.tipo} · {item.estado}: {item.descripcion}</p>)}
      </div>}
      {refinement && <div role="status" className="mt-3 border-t pt-3">
        <p className="font-semibold">Última corrección: {repairLabels[refinement.estado] || 'estado no reconocido; revisar diagnóstico'}.</p>
        {!!refinement.problemas_introducidos?.length && <ul className="list-disc pl-5">{refinement.problemas_introducidos.map((text, i) => <li key={i}>{text}</li>)}</ul>}
        {!!refinement.problemas_pendientes?.length && <div><p>Problemas que siguen pendientes</p><ul className="list-disc pl-5">{refinement.problemas_pendientes.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      </div>}
      {audit.diagnostico_inventario?.errores_pendientes?.length > 0 && <div className="mt-3">
        <p className="font-semibold">Evidencias rechazadas</p>
        {audit.diagnostico_inventario.errores_pendientes.map((item, index) => <div key={index} className="mt-2 border-t border-slate-200 pt-2">
          <p>{item.id || `Posición ${item.indice}`} · {item.errores.join(', ')}</p>
          <p className="whitespace-pre-wrap break-words">Cita que devolvió la IA: {item.elemento?.evidencia ? `“${item.elemento.evidencia}”` : '(sin cita)'}</p>
        </div>)}
      </div>}
    </details>
  </section>;
}
