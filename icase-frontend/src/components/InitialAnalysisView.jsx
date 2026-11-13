import React, { useState } from 'react';
import RequirementActorsPanel from './RequirementActorsPanel';
import AnalysisModal from './AnalysisModal';
import AnswerQuestionModal from './AnswerQuestionModal';
import AnalysisEvidence from './AnalysisEvidence';
import AnalysisSummaryFields from './AnalysisSummaryFields';
import { isTechnologyStack } from './technologyStack';
import { FileSearch, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
const types = ['RF', 'RNF', 'regla_negocio', 'restriccion_tecnica', 'contexto', 'decision', 'pregunta'];
const labels = ['Necesidades funcionales', 'Cualidades esperadas', 'Reglas de negocio', 'Restricciones técnicas', 'Contexto', 'Decisiones y exclusiones', 'Preguntas pendientes'];
export default function InitialAnalysisView({ state, onSave, onApprove, onReopen, onProposal, proposal, onApplyProposal, onBack, onRequirements, busy, provider, onUpdateRequirements, onViewVersion, onExtract, onDirtyChange, onAnalyzeAnswer, onReviewQuality }) {
  const row = state?.borrador || state?.aprobado;
  const content = row?.contenido || state?.heredado || {};
  const inventory = content.inventario || [];
  const pendingValidation = (content.necesidades_pendientes || []).filter(item => !['corregida', 'descartada'].includes(item.estado_validacion));
  const editable = Boolean(state?.borrador && row?.estado === 'borrador');
  const [editing, setEditing] = useState(null), [error, setError] = useState(''), [ack, setAck] = useState(false), [instruction, setInstruction] = useState('');
  const [additional, setAdditional] = useState(''), [reason, setReason] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [targetIds, setTargetIds] = useState('');
  const [historical, setHistorical] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [answering, setAnswering] = useState(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const actorPanelRef = React.useRef(null);
  const reviewActor = id => {
    const panel = actorPanelRef.current;
    const details = panel?.querySelector('details');
    if (details) details.open = true;
    const article = [...(panel?.querySelectorAll('[data-actor-id]') || [])].find(node => node.dataset.actorId === id);
    article?.querySelector('button')?.click();
  };
  const editingBaseline = React.useRef(null);
  React.useEffect(() => { editingBaseline.current = editing ? JSON.stringify(editing) : null; }, [editing?.id, editing?.dividir_de]);
  const closeEditor = () => {
    if (editing && JSON.stringify(editing) !== editingBaseline.current && !window.confirm('¿Descartar los cambios del elemento sin guardar?')) return;
    setToolsOpen(false); setEditing(null); setError('');
  };
  const dirty = Boolean(summary || additional.trim() || editing || summaryDirty);
  React.useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  React.useEffect(() => { setSummary(null); setEditing(null); setAck(false); }, [row?.id]);
  const run = async action => { setError(''); try { await action(); } catch (e) { setError(e.message); } };
  const nextId = (prefix, values) => `${prefix}-${String(Math.max(0, ...values.map(id => Number(String(id || '').match(/(\d+)$/)?.[1]) || 0)) + 1).padStart(2, '0')}`;
  const save = async (next, options = {}) => { const result = await onSave({ accion: 'guardar', version_esperada: row.id, contenido: { ...next, sintesis: options.sintesis || summary || next.sintesis }, insumo_adicional: additional, justificacion: options.justificacion || reason }); if (options.sintesis) setSummary(options.sintesis); setAdditional(''); return result; };
  const acceptCitation = id => run(() => onSave({ accion: 'aceptar_cita', id, version_esperada: row.id, justificacion: `Cita de ${id} confirmada: el fragmento está en la fuente.` }));
  const persist = async () => {
    const extras = (editing.evidencias || []).slice(1).filter(entry => String(entry?.texto || '').trim());
    const item = { ...editing, evidencias: [{ texto: editing.cita, ...(editing.fuente ? { fuente: editing.fuente } : {}) }, ...extras] }; delete item.cita; delete item.fuente;
    if (editing.dividir_de && !String(editing.resultado_original || '').trim()) throw new Error('Describe también el resultado que conservará el elemento original.');
    delete item.dividir_de; delete item.resultado_original;
    const base = editing.dividir_de ? inventory.map(n => n.id === editing.dividir_de ? { ...n, necesidad: editing.resultado_original } : n) : inventory;
    const items = base.some(n => n.id === item.id) ? base.map(n => n.id === item.id ? item : n) : [...base, item];
    await save({ ...content, inventario: items });
  };
  const split = item => {
    const newId = nextId('N', inventory.map(n => n.id)), goal = nextId('O', inventory.map(n => n.objetivo_id));
    setEditing({ ...item, id: newId, objetivo_id: ['RF', 'RNF'].includes(item.tipo) ? goal : undefined, necesidad: '', origenes: [item.id], dividir_de: item.id, resultado_original: '', cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' });
  };
  const control = content.control_aprobacion || {};
  const issues = Array.isArray(control.errores) ? control.errores : [];
  const warnings = Array.isArray(control.advertencias) ? control.advertencias : [];
  const findings = [...(content.revision_inventario?.hallazgos || []), ...(content.revision_inventario?.hallazgos_verificacion || [])];
  const seenFindings = new Set();
  const visibleFindings = findings.filter(f => { const key = JSON.stringify([f.codigo, f.elementos, f.descripcion]); if (seenFindings.has(key)) return false; seenFindings.add(key); return true; });
  const reviewedIds = new Set(findings.flatMap(f => f.elementos || []));
  const signals = (content.revision_inventario?.senales || []).filter(f => !(f.elementos || []).some(id => reviewedIds.has(id)));
  const diagnosticItems = [...visibleFindings, ...signals];
  const diagnosticTarget = message => {
    const id = String(message).match(/\bN-\d+\b/i)?.[0];
    return id ? inventory.find(n => n.id === id) || content.necesidades_pendientes?.find(n => n.id === id)?.elemento : null;
  };
  const openDiagnostic = item => {
    setError('');
    setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' });
  };
  return <div className="initial-analysis flex-1 min-h-0 overflow-y-auto p-4 md:p-8"><div className="initial-analysis__content">
    <header className="initial-analysis__header"><div className="initial-analysis__icon"><FileSearch size={24} /></div><div><p className="text-xs font-bold tracking-wide text-violet-700">FASE 1 · ANÁLISIS INICIAL</p><h1 className="text-2xl font-bold">Comprender el proyecto antes de redactar requisitos</h1><p className="initial-analysis__intro">Revisa la interpretación del proyecto y sus evidencias. Los requisitos se redactarán después de tu aprobación.</p></div></header>
    <div className="initial-analysis__metadata"><span>Versión {row?.version || 'heredada'}</span><span>{row?.estado === 'aprobado' ? 'Aprobado · solo lectura' : row?.estado === 'borrador' ? 'Borrador en revisión' : 'Sin aprobación inicial'}</span><span>Proveedor: {provider === 'auto' ? 'Automático' : provider}</span></div>
    {!state?.vigente && state?.aprobado && <p role="alert" className="my-3 rounded border border-amber-300 p-3">La versión aprobada no corresponde al contenido actual de las fuentes. Revisa un nuevo borrador.</p>}
    {state?.borrador && !state.borrador_vigente && <p role="alert" className="my-3 rounded border border-amber-300 p-3">Las fuentes cambiaron desde este borrador. Contrasta sus citas y guarda la revisión antes de aprobar.</p>}
    {error && <p role="alert" className="my-3 text-red-700">{error}</p>}
    {!!pendingValidation.length && <details className="my-4 rounded border border-amber-200 p-4" open><summary className="font-semibold cursor-pointer">Elementos pendientes de validación ({pendingValidation.length})</summary><p className="mt-2 text-sm">Estos elementos se conservaron, pero aún no forman parte del inventario validado. Revisa la causa antes de aprobar.</p>{pendingValidation.map((pending, index) => { const item = pending.elemento || pending; return <article key={item.id || index} className="my-3 rounded border p-3"><strong>{item.id || pending.id} · {item.necesidad || 'Contenido pendiente'}</strong><AnalysisEvidence item={item} /><p className="text-sm text-amber-800">Causa: {(pending.errores || []).map(code => ({ evidencia_no_localizada: 'la cita no está en el archivo como texto continuo', evidencia_ambigua: 'la cita aparece más de una vez; añade más contexto', evidencia_fuera_del_contenido_original: 'la cita está en los datos del archivo, no en su contenido', evidencia_ausente: 'falta la cita' }[code] || code)).join('. ') || pending.motivo || 'Validación pendiente'}. Marcar confirmado no sustituye esa cita.</p>{editable && <div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} onClick={() => openDiagnostic(item)}>Revisar evidencia y contenido</button><button disabled={busy} onClick={() => acceptCitation(item.id || pending.id)}>Aceptar cita</button></div>}</article>; })}</details>}
    <details className="my-4 rounded border p-4" open><summary className="flex cursor-pointer items-center justify-between gap-3 font-semibold"><span>Contexto, problema, objetivos y alcance</span>{editable && !summaryEditing && <button type="button" className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50" onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); setSummaryEditing(true); }}>Editar</button>}</summary>
      <AnalysisSummaryFields key={summaryEditing ? 'editando-resumen' : 'lectura-resumen'} sintesis={summary || content.sintesis || {}} inventory={inventory} editing={summaryEditing} busy={busy} onDirty={setSummaryDirty} onClose={() => setSummaryEditing(false)} onCommit={async change => { setError(''); try { await save({ ...content, inventario: change.inventario || inventory }, { sintesis: change.sintesis, justificacion: change.justificacion }); } catch (failure) { setError(failure.message); throw failure; } }} />
      {inventory.some(n => n.tipo === 'contexto') && <div className="mt-4"><h3 className="text-sm font-semibold text-slate-700">Información de apoyo de las fuentes</h3>{inventory.filter(n => n.tipo === 'contexto').map(item => <article key={item.id} className="mt-3"><p><strong>{item.id}</strong> · {item.necesidad}</p>{(item.evidencias || (item.evidencia ? [{ texto: item.evidencia }] : [])).map((e, index) => <blockquote key={index}>{e.texto} · {e.fuente || 'insumo directo'}</blockquote>)}{editable && <button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar información de apoyo</button>}</article>)}</div>}
    </details>
    <div ref={actorPanelRef} className="initial-analysis__actor-panel"><RequirementActorsPanel modalForms audit={content} requirements={{}} readOnly={!editable || busy || Boolean(editing)} onReview={async body => { await onSave({ ...body, version_esperada: row.id, sintesis: summary || content.sintesis, insumo_adicional: additional }); setAdditional(''); }} /></div>
    {[...types.slice(0, 3), 'stack', ...types.slice(3)].map(type => type === 'stack' ? (() => { const stack = inventory.filter(isTechnologyStack); return <details key="stack" className="my-3 rounded border p-4"><summary className="cursor-pointer font-semibold">Stack tecnológico <span className="initial-analysis__count">{stack.length}</span></summary><p className="initial-analysis__intro">Tecnologías acordadas para construir el sistema. Cada elemento se guarda una sola vez.</p>{stack.length ? stack.map(item => <article key={item.id} className="mt-4 border-t pt-3"><p><strong>{item.id}</strong> · {item.necesidad}</p><p className="text-xs text-slate-500">{item.estado} · objetivo {item.objetivo_id || 'no aplica'}</p><AnalysisEvidence item={item} />{editable && <div className="flex flex-wrap gap-4 text-violet-700"><button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar o reclasificar</button><button disabled={busy} onClick={() => split(item)}>Separar otro resultado</button></div>}</article>) : <p className="initial-analysis__empty">No se identificaron tecnologías del stack.</p>}</details>; })() : type !== 'contexto' && <details key={type} className="my-3 rounded border p-4"><summary className="cursor-pointer font-semibold">{type === 'pregunta' ? 'Preguntas y aclaraciones' : labels[types.indexOf(type)]} <span className="initial-analysis__count">{inventory.filter(n => n.tipo === type && !isTechnologyStack(n)).length}</span></summary>
      {type === 'pregunta' && <p className="initial-analysis__intro">{inventory.filter(n => n.tipo === 'pregunta' && n.estado === 'pendiente').length} pendientes · {inventory.filter(n => n.tipo === 'pregunta' && n.respuesta).length} respondidas. Puedes avanzar con dudas pendientes; no se asumirán como acuerdos. En Responder pregunta escribe el dato que falta, por ejemplo si las copias serán diarias o cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar.</p>}
      {type === 'restriccion_tecnica' && <p className="initial-analysis__intro">Canales, dispositivos y límites que no forman parte del stack.</p>}
      {!inventory.some(n => n.tipo === type && !isTechnologyStack(n)) && <p className="initial-analysis__empty">No se identificaron elementos en esta categoría.</p>}
      {inventory.filter(n => n.tipo === type && !isTechnologyStack(n)).map(item => <article key={item.id} className="mt-4 border-t pt-3"><p><strong>{item.id}</strong> · {item.necesidad}</p><p className="text-xs text-slate-500">{item.estado} · objetivo {item.objetivo_id || 'no aplica'}</p>
        {(item.actor_id || item.reglas_ids?.length || item.preguntas_ids?.length) && <p className="text-xs text-slate-600">{item.actor_id ? `Actor: ${(content.actores || []).find(actor => actor.id === item.actor_id)?.nombre || item.actor_id}. ` : ''}{item.reglas_ids?.length ? `Reglas: ${item.reglas_ids.map(id => { const rule = inventory.find(entry => entry.id === id); return rule ? `${id} · ${rule.necesidad}` : id; }).join(' · ')}. ` : ''}{item.preguntas_ids?.length ? `Preguntas de umbral: ${item.preguntas_ids.join(', ')}.` : ''}</p>}
        <AnalysisEvidence item={item} />
        {item.respuesta && <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><strong className="text-emerald-800">Respondida</strong><p>{item.respuesta.texto}</p><p className="text-xs text-slate-500">Registrada como insumo adicional · Elemento resultante: {(item.respuesta.elementos_resultantes || [item.respuesta.elemento_resultante]).join(', ')}{item.respuesta.elementos_relacionados?.length ? ` · Relacionados: ${item.respuesta.elementos_relacionados.join(', ')}` : ''}</p></div>}
        {editable && type === 'pregunta' && item.estado === 'pendiente' && <button disabled={busy || dirty} onClick={() => setAnswering(item)}>Responder pregunta</button>}
        {editable && type !== 'pregunta' && <div className="flex flex-wrap gap-4 text-violet-700"><button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar o reclasificar</button><button disabled={busy} onClick={() => split(item)}>Separar otro resultado</button></div>}
      </article>)}
    </details>)}
    {answering && <AnswerQuestionModal key={answering.id} version={row.id} question={answering} inventory={inventory} busy={busy} onAnalyze={onAnalyzeAnswer} onClose={() => setAnswering(null)} onSave={body => onSave({ ...body, version_esperada: row.id })} />}
    {editable && <section className="initial-analysis__actions my-4" aria-labelledby="analysis-actions-title"><h2 id="analysis-actions-title" className="font-semibold">¿Necesitas completar o corregir el análisis?</h2><p className="initial-analysis__intro">Elige una acción. Para modificar un elemento concreto o responder una duda, utiliza el botón de su tarjeta.</p><div className="flex flex-wrap gap-2">
      <button onClick={() => { setError(''); setToolsOpen('information'); }} disabled={busy}>Añadir información</button>
      <button onClick={() => { setError(''); setEditing({ id: nextId('N', inventory.map(n => n.id)), tipo: 'RF', objetivo_id: nextId('O', inventory.map(n => n.objetivo_id)), estado: 'pendiente', necesidad: '', cita: '', fuente: 'insumo_directo' }); }} disabled={busy}>Añadir necesidad</button>
      <button onClick={() => { setError(''); setToolsOpen('ai'); }} disabled={busy || dirty}>Solicitar corrección con IA</button>
      {onReviewQuality && <button disabled={busy || dirty} onClick={() => run(onReviewQuality)}>Revisar calidad del análisis</button>}
    </div>
    {onExtract && <div className="mt-4 border-t border-slate-100 pt-4">
      <button disabled={busy || dirty} onClick={() => setReprocessOpen(true)}>Reprocesar desde cero</button>
      <p className="mt-2 text-xs text-slate-500">Vuelve a analizar las fuentes sin reutilizar la extracción ni la revisión anteriores.</p>
      <AnalysisModal open={reprocessOpen} title="¿Reprocesar el análisis desde cero?" busy={busy || reprocessing} onClose={() => setReprocessOpen(false)}>
        <p>Se realizará una extracción y revisión nuevas con el proveedor seleccionado, como en el primer análisis.</p>
        <ul className="my-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Se usarán las fuentes actuales y la información adicional explícita que guardaste.</li>
          <li>La nueva interpretación no partirá de las ediciones del borrador anterior.</li>
          <li>Se conservarán las versiones anteriores, los requisitos y los diagramas. No se aprobará nada automáticamente.</li>
          <li>Consume nuevas solicitudes de IA. Si falla, conservarás el análisis anterior.</li>
        </ul>
        <div className="flex flex-wrap gap-2"><button className="initial-analysis__primary" disabled={busy || reprocessing} onClick={() => run(async () => { setReprocessing(true); try { await onExtract(row.id); setReprocessOpen(false); } finally { setReprocessing(false); } })}>{reprocessing ? 'Iniciando…' : 'Confirmar y reprocesar desde cero'}</button><button disabled={busy || reprocessing} onClick={() => setReprocessOpen(false)}>Cancelar</button></div>
        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      </AnalysisModal>
    </div>}
    <AnalysisModal open={Boolean(toolsOpen || editing)} title={editing ? editing.dividir_de ? `Separar resultado de ${editing.dividir_de}` : `Editar o reclasificar ${editing.id}` : ({ information: 'Añadir información al proyecto', ai: 'Solicitar corrección con IA' }[toolsOpen])} busy={busy} onClose={closeEditor}><fieldset disabled={busy} className="space-y-3">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!editing && toolsOpen === 'information' && <>
      <p className="initial-analysis__intro">Registra acuerdos o datos que no aparezcan en los archivos. Se guardarán como insumo adicional explícito, no como requisitos automáticos. Después puedes añadir una necesidad o pedir una corrección puntual a la IA.</p>
      <label className="block">Insumo adicional explícito (si deseas añadir obligaciones nuevas)<textarea className="block w-full border p-2" value={additional} onChange={e => setAdditional(e.target.value)} /></label>
      <label className="block">Justificación de los cambios<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={!additional.trim() || !reason.trim()} onClick={() => run(async () => { await save(content); setToolsOpen(false); })}>Guardar información</button>
      {additional && <button onClick={() => { setAdditional(''); setToolsOpen(false); }}>Descartar información sin guardar</button>}
      </>}
      {editing && <div role="region" aria-labelledby="analysis-element-editor-title" className="initial-analysis__editor space-y-2 rounded bg-slate-50 p-3"><h3 id="analysis-element-editor-title" className="font-semibold text-violet-800">{editing.dividir_de ? `Separar resultado de ${editing.dividir_de}` : `Editar o reclasificar ${editing.id}`}</h3><p className="text-xs text-slate-500">{editing.dividir_de ? 'Describe los dos resultados independientes. Se conservarán la evidencia y el vínculo al elemento original.' : 'Ajusta el contenido, la categoría o la evidencia y guarda los cambios para crear una nueva versión.'}</p><label className="block">Contenido<textarea autoFocus aria-label="Contenido" className="block w-full border p-2" value={editing.necesidad} onChange={e => setEditing({ ...editing, necesidad: e.target.value })} /></label>
        {editing.dividir_de && <label className="block">Resultado que conserva {editing.dividir_de}<textarea className="block w-full border p-2" value={editing.resultado_original} onChange={e => setEditing({ ...editing, resultado_original: e.target.value })} /></label>}
        <label>Categoría<select value={editing.tipo} onChange={e => setEditing({ ...editing, tipo: e.target.value, ...(e.target.value === 'restriccion_tecnica' ? {} : { grupo: undefined }) })}>{types.map((type, i) => <option key={type} value={type}>{labels[i]}</option>)}</select></label>
        {editing.tipo === 'restriccion_tecnica' && <label className="block">Se muestra en<select value={editing.grupo || (isTechnologyStack({ ...editing, grupo: undefined }) ? 'stack' : 'restriccion')} onChange={e => setEditing({ ...editing, grupo: e.target.value })}><option value="stack">Stack tecnológico</option><option value="restriccion">Restricciones técnicas</option></select></label>}
        <label className="block">Objetivo (RF/RNF)<input className="border p-2" value={editing.objetivo_id || ''} onChange={e => setEditing({ ...editing, objetivo_id: e.target.value })} /></label>
        <label className="block">Estado<select value={editing.estado} onChange={e => setEditing({ ...editing, estado: e.target.value })}>{['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="block">Cita literal<textarea aria-label="Cita literal" className="block w-full border p-2" value={editing.cita} onChange={e => setEditing({ ...editing, cita: e.target.value })} /></label>
        <p className="text-xs text-slate-500">Pega cada oración tal como está en la fuente. Quita los puntos suspensivos, las palabras añadidas y los fragmentos que no encuentres. El estado confirmado no valida la cita: al guardar, cada fragmento tiene que localizarse en el archivo.</p>
        <label className="block">Archivo de origen<input className="border p-2" value={editing.fuente} onChange={e => setEditing({ ...editing, fuente: e.target.value })} /></label>
        {(editing.evidencias || []).slice(1).map((fragment, index) => <div key={index} className="rounded-lg border border-slate-200 p-3"><label>Fragmento adicional {index + 2}<textarea value={fragment.texto || ''} onChange={e => setEditing({ ...editing, evidencias: editing.evidencias.map((entry, n) => n === index + 1 ? { ...entry, texto: e.target.value } : entry) })} /></label><label>Archivo del fragmento {index + 2}<input value={fragment.fuente || ''} onChange={e => setEditing({ ...editing, evidencias: editing.evidencias.map((entry, n) => n === index + 1 ? { ...entry, fuente: e.target.value } : entry) })} /></label><button onClick={() => setEditing({ ...editing, evidencias: editing.evidencias.filter((_, n) => n !== index + 1) })}>Quitar fragmento {index + 2}</button></div>)}
        <button onClick={() => setEditing({ ...editing, evidencias: [...(editing.evidencias?.length ? editing.evidencias : [{ texto: editing.cita, fuente: editing.fuente }]), { texto: '', fuente: editing.fuente || '' }] })}>Añadir fragmento de evidencia</button>
        {['RF', 'RNF'].includes(editing.tipo) && <label className="block">Actor<select value={editing.actor_id || ''} onChange={e => setEditing({ ...editing, actor_id: e.target.value || undefined })}><option value="">Sin actor enlazado</option>{(content.actores || []).map(actor => <option key={actor.id} value={actor.id}>{actor.nombre}</option>)}</select></label>}
        {['RF', 'RNF'].includes(editing.tipo) && <fieldset className="space-y-1"><legend className="text-sm font-medium">Reglas que condicionan esta necesidad</legend>{inventory.filter(rule => rule.tipo === 'regla_negocio').map(rule => <label key={rule.id} className="block text-sm"><input type="checkbox" checked={(editing.reglas_ids || []).includes(rule.id)} onChange={e => setEditing({ ...editing, reglas_ids: e.target.checked ? [...new Set([...(editing.reglas_ids || []), rule.id])] : (editing.reglas_ids || []).filter(id => id !== rule.id) })} /> {rule.id} · {rule.necesidad}</label>)}{!inventory.some(rule => rule.tipo === 'regla_negocio') && <p className="text-xs text-slate-500">No hay reglas de negocio para enlazar.</p>}</fieldset>}
        <label className="block">Justificación de los cambios<textarea aria-label="Justificación de los cambios" className="block w-full border p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button onClick={() => run(async () => { await persist(); setEditing(null); setToolsOpen(false); })}>Guardar elemento</button><button className="ml-4" onClick={closeEditor}>Cancelar</button>
      </div>}
      {!editing && toolsOpen === 'ai' && <>
      <p className="initial-analysis__intro">Describe qué está mal e indica qué elementos revisar. Recibirás una propuesta para comparar y aceptar; no se aplicará automáticamente. Para aportar un acuerdo nuevo, utiliza primero «Añadir información».</p>
      <label className="block">Corrección puntual con IA<textarea className="block w-full border p-2" value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
      <label className="block">IDs a corregir (separados por coma; usa sintesis para el resumen)<input className="block w-full border p-2" value={targetIds} onChange={e => setTargetIds(e.target.value)} placeholder="N-01, ACT-01" /></label>
      <button disabled={dirty || !instruction.trim() || !targetIds.trim()} onClick={() => run(async () => { await onProposal(instruction, targetIds.split(',').map(id => id.trim()).filter(Boolean)); setToolsOpen(false); })}>Solicitar propuesta sin aplicar</button>
      </>}
    </fieldset></AnalysisModal></section>}
    {proposal?.propuesta && <details open className="my-4 rounded border p-4"><summary>Comparación de propuesta IA · requiere revisión humana</summary><p>Elementos seleccionados: {(proposal.elementos_afectados || []).join(', ')}.</p><p>Corrección solicitada: {proposal.justificacion}</p><div className="grid gap-4 md:grid-cols-2"><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(content, null, 2)}</pre><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(proposal.propuesta, null, 2)}</pre></div><button disabled={busy || dirty || !editable} onClick={() => run(onApplyProposal)}>Aplicar propuesta a un nuevo borrador</button></details>}
    <details className="my-4 rounded border p-4" open><summary><ShieldCheck size={18} /> Diagnósticos y pendientes <span className="initial-analysis__count">{issues.length + warnings.length + diagnosticItems.length}</span></summary>
      <p className="initial-analysis__intro">{issues.length ? 'Corrige los siguientes errores antes de aprobar el análisis.' : 'Estructura y citas válidas. Esto no demuestra por sí solo que el contenido esté completo.'}</p>
      <div className="my-3 rounded-xl border border-violet-100 bg-violet-50 p-3"><strong>Revisión de contenido: {content.revision_inventario?.estado === 'completa' ? 'completada por IA' : 'parcial o pendiente'}</strong><p className="text-xs">{content.revision_inventario?.motivo || 'La revisión asistida requiere contraste humano; no certifica exhaustividad.'}</p></div>
      {diagnosticItems.map((finding, index) => <div key={index} className="initial-analysis__notice"><Info size={17} /><div><strong>{finding.codigo === 'POSIBLE_AGRUPACION' ? 'Posible agrupación: revisar' : finding.codigo}</strong><p>{finding.descripcion}</p><p>{finding.accion}</p><AnalysisEvidence item={finding} />{editable && (finding.elementos || []).map(id => inventory.find(n => n.id === id)).filter(Boolean).map(item => <button key={item.id} onClick={() => openDiagnostic(item)} disabled={busy}>Corregir {item.id}</button>)}<div className="mt-2 flex flex-wrap gap-2">{editable && (finding.elementos || []).filter(id => content.actores?.some(a => a.id === id)).map(id => <button key={id} disabled={busy} onClick={() => reviewActor(id)}>Revisar actor {id}</button>)}{editable && !finding.elementos?.length && onReviewQuality && <button disabled={busy || dirty} onClick={() => run(onReviewQuality)}>Revisar propuesta de incorporación</button>}<button disabled={busy} onClick={onBack}>Consultar fuente original</button></div></div></div>)}
      {issues.map((message, index) => <div key={`error-${index}`} className="initial-analysis__notice initial-analysis__notice--error"><AlertTriangle size={17} /><div className="min-w-0 flex-1"><strong>Requiere corrección</strong><p>{message}</p>{editable && diagnosticTarget(message) && <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => openDiagnostic(diagnosticTarget(message))}>Corregir {diagnosticTarget(message).id}</button>{/evidencia pendiente/.test(message) && <button disabled={busy} onClick={() => acceptCitation(diagnosticTarget(message).id)}>Aceptar cita</button>}</div>}</div></div>)}
      {warnings.map((message, index) => <div key={`warning-${index}`} className="initial-analysis__notice"><Info size={17} /><div className="min-w-0 flex-1"><strong>Aspecto por revisar</strong><p>{message}</p>{editable && diagnosticTarget(message) ? <button className="mt-3" disabled={busy} onClick={() => openDiagnostic(diagnosticTarget(message))}>Revisar {diagnosticTarget(message).id}</button> : /contrasta.*insumo|fuentes/i.test(message) && <button className="mt-3" disabled={busy} onClick={onBack}>Consultar fuentes</button>}</div></div>)}
      {!content.control_aprobacion && <p className="initial-analysis__empty">El control de aprobación aún no está disponible para esta versión.</p>}
      {!!content.revision_inventario?.causas?.length && <ul className="mt-3 text-sm text-red-700">{content.revision_inventario.causas.map((cause, index) => <li key={index}>{cause.id}: {(cause.errores || []).join(', ')}</li>)}</ul>}
      {content.revision_inventario?.propuesta_rechazada && <details className="mt-4"><summary>Consultar corrección no aplicada</summary><p className="initial-analysis__intro">Esta propuesta no se guardó porque no superó todos los controles. Compárala con los hallazgos; no se aplica automáticamente.</p>{content.revision_inventario.propuesta_rechazada.map(item => <article key={item.id} className="mt-3"><strong>{item.id} · {item.tipo}</strong><p>{item.necesidad}</p><AnalysisEvidence item={item} /></article>)}</details>}
    </details>
    <details className="my-4"><summary>Versiones conservadas</summary>{state?.versiones?.map(v => <p key={v.id}>Versión {v.version} · {v.estado} · {v.procedencia} {onViewVersion && <button className="ml-2 text-violet-700 underline" onClick={() => run(async () => setHistorical(await onViewVersion(v.id)))}>Ver versión {v.version}</button>}</p>)}{historical && <div><p>Consulta histórica de solo lectura</p><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(historical.contenido, null, 2)}</pre><button onClick={() => setHistorical(null)}>Cerrar consulta</button></div>}</details>
    {!!state?.impacto?.requisitos_existentes && <div className="my-4 rounded border border-amber-300 p-3"><h2 className="font-semibold">Impacto sobre requisitos existentes</h2><p>Afectados: {state.impacto.requisitos_afectados.join(', ') || 'ninguno detectado'}.</p><p>Necesidades sin requisito: {state.impacto.nuevas_necesidades.join(', ') || 'ninguna'}.</p>{state.impacto.alcance_incierto && <p>El alcance no se determina con seguridad: revisa todos los requisitos indicados antes de actualizar.</p>}</div>}
    {editable ? <div className="initial-analysis__approval my-6 space-y-3">{dirty && <p role="status" className="text-amber-800">Guarda o cancela los cambios pendientes antes de aprobar o pedir una propuesta de IA.</p>}<label className="block"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> Revisé las evidencias, decisiones y advertencias; las preguntas pendientes siguen abiertas.</label>{control.bloqueado && <p className="text-sm text-amber-800">La aprobación estará disponible cuando se corrijan los errores indicados en Diagnósticos y pendientes.</p>}<button disabled={busy || dirty || !ack || content.control_aprobacion?.bloqueado} className="initial-analysis__primary rounded bg-violet-600 px-5 py-3 text-white disabled:opacity-50" onClick={() => run(() => onApprove(row.id))}>Aprobar análisis y generar requisitos</button></div>
      : <button disabled={busy} className="my-4 rounded border px-4 py-2" onClick={() => run(onReopen)}>Revisar análisis inicial{state?.version_flujo !== 2 ? ' y adoptar flujo separado' : ''}</button>}
    {state?.aprobado && !state?.borrador && <button disabled={busy || !state.vigente} className="ml-3 rounded border p-2" onClick={() => run(() => onUpdateRequirements ? onUpdateRequirements() : onApprove(state.aprobado.id))}>Generar o reintentar pendientes</button>}
  </div></div>;
}
