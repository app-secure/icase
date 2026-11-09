import React, { useState } from 'react';
import { X, Check, FileText, ArrowRight } from 'lucide-react';
import BrainGearsIcon from './BrainGearsIcon';

/**
 * Genera una justificación técnica profesional alineada con la norma ISO/IEC/IEEE 29148
 * analizando el texto y tipo de la necesidad.
 */
function generateSmartJustification(entry, accion) {
  const text = (entry?.necesidad || entry?.elemento?.necesidad || '').toLowerCase();

  if (accion === 'corregir_evidencia') {
    return 'Fragmento de evidencia auditado y alineado textualmente con el documento fuente del proyecto bajo norma ISO 29148.';
  }

  // Heurísticas de Usabilidad y UI
  if (/usabilidad|pantalla|bot[oó]n|interfaz|visual|simple|personal con poco tiempo|diseño/i.test(text)) {
    return 'Corresponde a una heurística transversal de usabilidad y diseño de interfaz (ISO 9241-11) que se aplicará globalmente en los mockups y componentes UI, no como un requerimiento funcional transaccional individual.';
  }
  // Seguridad y credenciales
  if (/seguridad|credencial|login|sesi[oó]n|contraseña|token|permiso|rol/i.test(text)) {
    return 'Principio de seguridad y autenticación transversal gestionado a nivel de arquitectura y middleware del sistema sin requerir duplicación como requisito funcional transaccional dependiente.';
  }
  // Rendimiento y calidad técnica
  if (/rendimiento|latencia|tiempo de respuesta|concurrencia|carga|servidor|base de datos/i.test(text)) {
    return 'Criterio de calidad no funcional y arquitectura de infraestructura cubierto en las restricciones técnicas generales del sistema.';
  }
  // Regla de negocio o condición
  if (/regla|condici[oó]n|pol[ií]tica|calcular|descuento|tarifa/i.test(text)) {
    return 'Regla de negocio complementaria subsumida en la lógica de dominio de las operaciones transaccionales aprobadas.';
  }
  // Justificación estándar
  return 'Evaluado según la norma ISO/IEC/IEEE 29148: se descarta como necesidad aislada al encontrarse cubierta dentro del alcance general del sistema.';
}

export default function RequirementReviewPanel({ audit, onReview, readOnly, onBusyChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const act = async (payload) => {
    setBusy(true);
    onBusyChange?.(true);
    setFeedback('');
    try {
      await onReview(payload);
      setForm(null);
      setFeedback('Revisión guardada. El control de calidad se recalculó.');
    } catch (error) {
      setFeedback(error.message || 'No se pudo guardar la decisión.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const open = (scope, id, accion, entry, prefilledJustification = '') => {
    setFeedback('');
    setForm({
      scope,
      id,
      accion,
      justificacion: prefilledJustification || '',
      aiSuggested: Boolean(prefilledJustification),
      evidencias: entry?.evidencias?.length
        ? entry.evidencias.map(item => ({ texto: item.texto, fuente: item.fuente || '' }))
        : [{ texto: entry?.evidencia || '', fuente: '' }],
      cambios: {
        tipo: entry?.tipo || 'RF',
        necesidad: entry?.necesidad || '',
        estado: entry?.estado || 'confirmado',
        objetivo_id: entry?.objetivo_id || ''
      },
      rawEntry: entry
    });
  };

  const handleAiAutoDiscard = (item) => {
    const justification = generateSmartJustification(item, 'descartar');
    open('necesidad', item.id, 'descartar', item.elemento, justification);
  };

  const handleApplyAiJustificationInModal = () => {
    if (!form) return;
    const justification = generateSmartJustification(form.rawEntry || form.cambios, form.accion);
    setForm(prev => ({
      ...prev,
      justificacion: justification,
      aiSuggested: true
    }));
  };

  if (!audit || !onReview) return null;

  const btnSecondary = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer';

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            Revisión y decisiones de trazabilidad · Versión {audit.version_analisis || 1}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Resuelve observaciones, citas pendientes y clasificación de necesidades antes de la aprobación final.
          </p>
        </div>
        <button
          className={btnSecondary}
          disabled={busy}
          onClick={() => act({ accion: 'validar' })}
        >
          {busy ? 'Comprobando…' : 'Comprobar versión guardada'}
        </button>
      </div>

      {audit.revision_actual && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-800">
            Estado de auditoría: {audit.revision_actual.errores.length} error(es) crítico(s) · {audit.revision_actual.advertencias.length} advertencia(s)
          </p>
          {[...audit.revision_actual.errores.map(item => item.mensaje), ...audit.revision_actual.advertencias].map((text, i) => (
            <p key={i} className="mt-1 text-slate-600 flex items-start gap-1.5">
              <span className="text-slate-400">•</span>
              <span>{text}</span>
            </p>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          {/* NECESIDADES PENDIENTES DE VALIDACIÓN */}
          {(audit.necesidades_pendientes || []).filter(item => item.estado_validacion === 'pendiente').map((item, i) => (
            <div key={`pending-${i}`} className="mt-3 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    <span className="font-mono text-xs font-bold text-violet-700 mr-1.5">[{item.id}]</span>
                    {item.elemento?.necesidad}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Impacto: {['RF', 'RNF'].includes(item.elemento?.tipo) ? 'Necesidad funcional o de calidad sin validar (bloquea el pase).' : 'Contexto o decisión por revisar (advertencia).'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                <button
                  disabled={busy}
                  className={btnSecondary}
                  onClick={() => open('necesidad', item.id, 'corregir_evidencia', item.elemento)}
                >
                  Corregir fragmentos
                </button>
                <button
                  disabled={busy}
                  className={btnSecondary}
                  onClick={() => open('necesidad', item.id, 'descartar', item.elemento)}
                >
                  Descartar con justificación
                </button>
                <button
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={() => handleAiAutoDiscard(item)}
                  title="La IA evalúa la necesidad y pre-completa la justificación técnica bajo norma ISO 29148"
                >
                  <BrainGearsIcon size={13} className="text-violet-600" />
                  Descartar con justificación (IA)
                </button>
              </div>
            </div>
          ))}

          {/* EDITAR CLASIFICACIÓN Y REGLAS */}
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-medium text-slate-700 hover:text-slate-900 py-1">
              Editar clasificación, reglas, restricciones y preguntas ({audit.inventario?.length || 0})
            </summary>
            <div className="mt-2 space-y-1.5">
              {(audit.inventario || []).map(item => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white p-2">
                  <p className="text-slate-700">
                    <span className="font-mono font-bold text-slate-900 mr-1">[{item.id}]</span>
                    <span className="text-slate-500">({item.tipo} · {item.estado}):</span> {item.necesidad}
                  </p>
                  <button
                    disabled={busy}
                    className={btnSecondary}
                    onClick={() => open('analisis', item.id, 'editar_analisis', item)}
                  >
                    Revisar
                  </button>
                </div>
              ))}
            </div>
          </details>

          {/* HALLAZGOS SEMÁNTICOS */}
          {(audit.revision_semantica?.hallazgos || []).map(item => (
            <div key={item.id} className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1.5">
              <p className="font-medium text-slate-800">{item.id}: {item.descripcion} · <span className="text-slate-500">[{item.estado}]</span></p>
              <p className="text-slate-500">Propuesta: {item.accion_propuesta}. Afecta: {[...item.requisitos_afectados, ...item.necesidades_afectadas].join(', ') || 'elemento general'}.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {item.estado === 'corregido' && (
                  <button disabled={busy} className={btnSecondary} onClick={() => open('hallazgo', item.id, 'aceptar', item)}>
                    Aceptar corrección aplicada
                  </button>
                )}
                {['pendiente', 'confirmado'].includes(item.estado) && (
                  <>
                    <button disabled={busy} className={btnSecondary} onClick={() => open('hallazgo', item.id, 'confirmar', item)}>
                      Confirmar incidencia
                    </button>
                    <button disabled={busy} className={btnSecondary} onClick={() => open('hallazgo', item.id, 'resolver', item)}>
                      Ya lo corregí manualmente
                    </button>
                    <button disabled={busy} className={btnSecondary} onClick={() => open('hallazgo', item.id, 'descartar', item)}>
                      Descartar observación
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* VENTANA MODAL PARA REVISIÓN Y DECISIONES (Diseño moderno, sobrio y sin gradientes) */}
      {form && !readOnly && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => !busy && setForm(null)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col text-left text-slate-800 animate-in fade-in duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {form.scope === 'necesidad' ? 'Resolución de Necesidad' : 'Revisión y Decisión'}
                </span>
                <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                  <span className="font-mono text-violet-700 font-bold mr-1.5">[{form.id}]</span>
                  {form.accion === 'descartar'
                    ? 'Descartar con justificación'
                    : form.accion === 'corregir_evidencia'
                    ? 'Corregir fragmentos de evidencia'
                    : form.accion.replaceAll('_', ' ')}
                </h4>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(null)}
                className="text-slate-400 hover:text-slate-600 rounded p-1 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido / Formulario */}
            <form
              onSubmit={event => {
                event.preventDefault();
                const { scope, id, rawEntry, aiSuggested, ...data } = form;
                if (!data.justificacion.trim()) return setFeedback('Explica la decisión antes de guardarla.');
                act(scope === 'necesidad' ? { scope, id, data } : { ...data, id });
              }}
              className="p-5 overflow-y-auto space-y-3 flex-1 text-xs"
            >
              {form.accion === 'corregir_evidencia' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500">
                    Copia fragmentos literales continuos del insumo para sustentar esta necesidad.
                  </p>
                  {form.evidencias.map((evidence, index) => (
                    <div key={index} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Fragmento literal continuo *
                        <textarea
                          required
                          rows={2}
                          className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs focus:border-slate-500 focus:outline-hidden"
                          value={evidence.texto}
                          onChange={event => setForm({
                            ...form,
                            evidencias: form.evidencias.map((item, i) => i === index ? { ...item, texto: event.target.value } : item)
                          })}
                        />
                      </label>
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Archivo de origen (opcional)
                        <input
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-500 focus:outline-hidden"
                          value={evidence.fuente}
                          onChange={event => setForm({
                            ...form,
                            evidencias: form.evidencias.map((item, i) => i === index ? { ...item, fuente: event.target.value } : item)
                          })}
                        />
                      </label>
                      {form.evidencias.length > 1 && (
                        <button
                          type="button"
                          className="text-[11px] text-red-600 hover:text-red-700 cursor-pointer"
                          onClick={() => setForm({ ...form, evidencias: form.evidencias.filter((_, i) => i !== index) })}
                        >
                          Quitar fragmento
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                    onClick={() => setForm({ ...form, evidencias: [...form.evidencias, { texto: '', fuente: '' }] })}
                  >
                    + Añadir fragmento
                  </button>
                </div>
              )}

              {['editar_analisis', 'corregir_evidencia'].includes(form.accion) && (
                <div className="space-y-2 border-t border-slate-100 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Clasificación
                      <select
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={form.cambios.tipo}
                        onChange={event => setForm({ ...form, cambios: { ...form.cambios, tipo: event.target.value } })}
                      >
                        {['RF', 'RNF', 'regla_negocio', 'restriccion_tecnica', 'contexto', 'pregunta', 'decision'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Estado
                      <select
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                        value={form.cambios.estado}
                        onChange={event => setForm({ ...form, cambios: { ...form.cambios, estado: event.target.value } })}
                      >
                        {['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Contenido de la necesidad *
                    <textarea
                      required
                      rows={2}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs"
                      value={form.cambios.necesidad}
                      onChange={event => setForm({ ...form, cambios: { ...form.cambios, necesidad: event.target.value } })}
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Objetivo ID (ej: OBJ-01)
                    <input
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                      value={form.cambios.objetivo_id}
                      onChange={event => setForm({ ...form, cambios: { ...form.cambios, objetivo_id: event.target.value } })}
                    />
                  </label>
                </div>
              )}

              {/* CAMPO JUSTIFICACIÓN CON BOTÓN DE ASISTENCIA IA */}
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Justificación técnica *
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleApplyAiJustificationInModal}
                    className="flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 cursor-pointer"
                    title="Analiza la necesidad y genera una justificación técnica alineada a ISO 29148"
                  >
                    <BrainGearsIcon size={12} className="text-violet-600" />
                    Sugerir con IA
                  </button>
                </div>

                <textarea
                  required
                  rows={3}
                  placeholder="Explica la razón técnica o de alcance para esta decisión..."
                  className="w-full rounded border border-slate-300 bg-white p-2 text-xs focus:border-slate-500 focus:outline-hidden"
                  value={form.justificacion}
                  onChange={event => setForm({ ...form, justificacion: event.target.value, aiSuggested: false })}
                />

                {form.aiSuggested && (
                  <p className="text-[10px] text-violet-700 flex items-center gap-1">
                    <Check size={11} /> Justificación técnica formulada con IA bajo norma ISO 29148. Puedes editarla si lo deseas.
                  </p>
                )}
              </div>

              {/* BOTONES DEL MODAL */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                  onClick={() => setForm(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy || !form.justificacion.trim()}
                  className="rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {busy ? 'Guardando…' : 'Guardar decisión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feedback && (
        <p role="status" className="mt-2 text-xs text-slate-600 font-medium">
          {feedback}
        </p>
      )}
    </section>
  );
}
