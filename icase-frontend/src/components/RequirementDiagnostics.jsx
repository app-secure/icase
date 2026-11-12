import React from 'react';

const repairLabels = {
  sin_respuesta_utilizable: 'Sin respuesta utilizable; se conservó el borrador',
  parche_rechazado: 'Cambio rechazado por introducir errores',
  pendiente: 'Corrección parcial; quedan incidencias',
  estructura_validada: 'Cambio validado estructuralmente; no acredita exhaustividad'
};

export default function RequirementDiagnostics({ audit }) {
  if (!audit) return null;
  const control = audit.control_aprobacion;
  const quality = control?.calidad;
  const generation = audit.diagnostico_generacion;
  const refinement = audit.diagnostico_refinamiento;
  const warnings = quality?.hallazgos?.filter(f => f.severidad !== 'error') || [];
  const pending = audit.preguntas_pendientes || [];
  return <section aria-label="Resumen de validación de requisitos" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <h3 className="font-semibold">Estado de las comprobaciones</h3>
    <p className="mt-2">Estructura: {!control ? 'sin comprobación registrada' : control.bloqueado ? 'con errores que impiden aprobar' : 'sin bloqueos detectados'}.</p>
    <p>Revisión semántica: {audit.revision_semantica?.estado === 'completada' ? 'ejecutada; revisa sus hallazgos' : audit.revision_semantica?.estado === 'parcial' ? 'parcial; faltan categorías por contrastar o respuestas válidas' : 'no completada o no registrada'}.</p>
    {!!audit.revision_semantica?.contraste_categorias?.pendientes?.length && <p className="mt-1">Categorías por revisar: {audit.revision_semantica.contraste_categorias.pendientes.join(', ')}.</p>}
    <p className="mt-1 text-xs text-slate-500">Aprobar es una decisión humana; no certifica exhaustividad ni implementación. Las advertencias no equivalen a errores bloqueantes.</p>
    {audit.revision_inventario && <details className="mt-3"><summary className="cursor-pointer font-semibold">Revisión de objetivos del inventario · {audit.revision_inventario.estado}</summary>
      <p className="mt-1">Candidatos: {(audit.revision_inventario.candidatos || []).join(', ') || 'ninguno'}. Las señales léxicas no prueban que un objetivo esté mal agrupado.</p>
      {(audit.revision_inventario.causas || []).map((item, index) => <p key={index}>{item.id}: {(item.errores || []).join(', ')}</p>)}
      {audit.revision_inventario.estado === 'pendiente' && <p>La revisión no se completó; conserva el inventario anterior y revisa los candidatos.</p>}
    </details>}
    {generation && <details className="mt-3">
      <summary className="cursor-pointer font-semibold">Cobertura de generación · {generation.necesidades_pendientes?.length || 0} necesidades sin referencia</summary>
      <p className="mt-1 text-xs">Una referencia no demuestra que el contenido implemente completamente la necesidad.</p>
      {(generation.lotes || []).map(batch => <p key={batch.lote} className="mt-1">Lote {batch.lote}: {batch.requisitos_recibidos} requisitos recibidos. {batch.necesidades_sin_referencia?.length ? `Sin referencia en la primera respuesta: ${batch.necesidades_sin_referencia.join(', ')}.` : 'Todas las necesidades del lote fueron referenciadas.'}</p>)}
      {!!generation.necesidades_pendientes?.length && <p className="mt-2">Pendientes al finalizar: {generation.necesidades_pendientes.join(', ')}.</p>}
    </details>}
    {quality && <details className="mt-3" open={warnings.length > 0}>
      <summary className="cursor-pointer font-semibold">Advertencias de calidad · {warnings.length}</summary>
      {!warnings.length && <p>No se detectaron advertencias en estos controles; no garantiza ausencia de omisiones.</p>}
      {warnings.map((finding, i) => <div key={`${finding.codigo}-${i}`} className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">
        <p className="font-semibold">{finding.requisito || finding.necesidad || 'Análisis'} · {finding.codigo}</p>
        <p>{finding.mensaje}</p><p className="mt-1">Qué revisar: {finding.accion_propuesta}</p>
      </div>)}
    </details>}
    <details className="mt-3">
      <summary className="cursor-pointer font-semibold">Decisiones pendientes · {pending.length}</summary>
      {pending.length ? pending.map((item, i) => <p key={item.id || i} className="mt-1">{item.id}: {item.necesidad}</p>) : <p>No se registraron preguntas pendientes; comprueba los detalles que requieren confirmación.</p>}
    </details>
    {!!quality?.vinculos?.length && <details className="mt-3">
      <summary className="cursor-pointer font-semibold">Vínculos declarados a reglas y restricciones</summary>
      <p className="text-xs">Solo se muestran asociaciones declaradas; no se deducen por palabras similares.</p>
      {quality.vinculos.map((link, i) => <p key={link.requisito || i} className="mt-1">{link.requisito}: {link.elementos_relacionados.length ? link.elementos_relacionados.map(n => `${n.id} (${n.tipo}, ${n.estado || 'sin estado'})`).join('; ') : 'sin elementos auxiliares vinculados'}</p>)}
    </details>}
    {refinement && <div role="status" className="mt-3 border-t pt-3">
      <p className="font-semibold">Última corrección: {repairLabels[refinement.estado] || 'estado no reconocido; revisar diagnóstico'}.</p>
      {!!refinement.problemas_introducidos?.length && <ul className="list-disc pl-5">{refinement.problemas_introducidos.map((text, i) => <li key={i}>{text}</li>)}</ul>}
      {!!refinement.problemas_pendientes?.length && <details><summary>Problemas que siguen pendientes</summary><ul className="list-disc pl-5">{refinement.problemas_pendientes.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    </div>}
  </section>;
}
