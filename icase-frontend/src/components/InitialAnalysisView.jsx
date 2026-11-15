import React, { useState, useId } from 'react';
import RequirementActorsPanel from './RequirementActorsPanel';
import AnalysisModal from './AnalysisModal';
import SourceAutocomplete from './SourceAutocomplete';
import ObjectiveAutocomplete from './ObjectiveAutocomplete';
import AnswerQuestionModal from './AnswerQuestionModal';
import AnalysisEvidence from './AnalysisEvidence';
import AnalysisSummaryFields from './AnalysisSummaryFields';
import { isTechnologyStack } from './technologyStack';
import { FileSearch, ShieldCheck, AlertTriangle, Info, FilePlus2, Plus, WandSparkles, RotateCcw } from 'lucide-react';
const types = ['RF', 'RNF', 'regla_negocio', 'restriccion_tecnica', 'contexto', 'decision', 'pregunta'];
const labels = ['Necesidades funcionales', 'Cualidades esperadas', 'Reglas de negocio', 'Restricciones técnicas', 'Contexto', 'Decisiones y exclusiones', 'Preguntas pendientes'];
export default function InitialAnalysisView({ sources = [], state, onSave, onApprove, onReopen, onProposal, proposal, onApplyProposal, onBack, onRequirements, busy, provider, onUpdateRequirements, onViewVersion, onExtract, onDirtyChange, onAnalyzeAnswer, onReviewQuality, onRefresh }) {
  const row = state?.borrador || state?.aprobado;
  const content = row?.contenido || state?.heredado || {};
  const inventory = content.inventario || [];
  const [showRejected, setShowRejected] = useState(false);
  const visibleInventory = inventory.filter(item => showRejected || item.estado !== 'rechazado');
  const rejectedToggle = <label className="inline-flex cursor-pointer items-center gap-2 px-2 py-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={showRejected} onChange={event => setShowRejected(event.target.checked)} className="h-4 w-4 accent-violet-600" />Mostrar rechazadas ({inventory.filter(item => item.estado === 'rechazado').length})</label>;
  const pendingValidation = (content.necesidades_pendientes || []).filter(item => !['corregida', 'descartada'].includes(item.estado_validacion));
  const editable = Boolean(state?.borrador && row?.estado === 'borrador');
  const [editing, setEditing] = useState(null), [error, setError] = useState(''), [ack, setAck] = useState(false), [instruction, setInstruction] = useState('');
  const [additional, setAdditional] = useState(''), [reason, setReason] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const editorFormId = useId();
  const [fieldErrors, setFieldErrors] = useState({});
  const [savingElement, setSavingElement] = useState(false);
  const [merging, setMerging] = useState(null);
  const [mergeIds, setMergeIds] = useState([]);
  const [mergeText, setMergeText] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const mergeButton = item => <button type="button" disabled={busy || dirty || ['rechazado', 'fuera_de_alcance'].includes(item.estado)} onClick={() => { setMergeError(''); setMerging(item); setMergeIds([]); setMergeText(item.necesidad); }}>Fusionar</button>;
  const creating = Boolean(editing && !editing.dividir_de && !inventory.some(item => item.id === editing.id));
  const editorTitle = editing ? editing.dividir_de ? `Separar resultado de ${editing.dividir_de}` : creating ? 'Añadir necesidad' : `Editar o reclasificar ${editing.id}` : '';
  React.useEffect(() => { setFieldErrors({}); setReason(''); setError(''); }, [editing?.id]);
  const fieldError = key => fieldErrors[key] && <p id={`${editorFormId}-${key}`} role="alert" className="mt-1 text-xs text-red-700">{fieldErrors[key]}</p>;
  const submitElement = async event => {
    event.preventDefault();
    if (busy || savingElement) return;
    const missing = {};
    if (!editing.necesidad?.trim()) missing.necesidad = 'Escribe el contenido.';
    if (['RF', 'RNF'].includes(editing.tipo) && !/^O-[0-9]+$/.test((editing.objetivo_id || '').trim())) missing.objetivo_id = 'Indica un objetivo con formato O-01.';
    if (!editing.cita?.trim()) missing.cita = 'Añade una cita literal de la fuente.';
    if (!creating && !reason.trim()) missing.reason = 'Explica la razón de los cambios.';
    if (editing.dividir_de && !editing.resultado_original?.trim()) missing.resultado_original = 'Describe el resultado que conserva el elemento original.';
    setFieldErrors(missing); setError('');
    if (Object.keys(missing).length) {
      const form = document.getElementById(editorFormId);
      const field = form?.querySelector(`[name="${Object.keys(missing)[0]}"]`);
      field?.focus(); return;
    }
    setSavingElement(true);
    try { await persist(); setEditing(null); setToolsOpen(false); }
    catch (failure) {
      const key = /evidencia|cita|fragmento/i.test(failure.message) ? 'cita' : /objetivo/i.test(failure.message) ? 'objetivo_id' : /justificaci/i.test(failure.message) ? 'reason' : null;
      if (key) {
        setFieldErrors({ [key]: failure.message });
        document.getElementById(editorFormId)?.querySelector(`[name="${key}"]`)?.focus();
      } else setError(failure.message);
    }
    finally { setSavingElement(false); }
  };
  const [targetIds, setTargetIds] = useState('');
  const [aiScope, setAiScope] = useState(null);
  const [requestingProposal, setRequestingProposal] = useState(false);
  const openAi = (ids, label) => {
    setError(''); setEditing(null); setInstruction('');
    setTargetIds(ids.join(', ')); setAiScope({ ids, label }); setToolsOpen('ai');
  };
  const aiButton = (ids, label, section = false) => editable && onProposal && <button type="button" disabled={busy || dirty || !ids.length} className={section ? 'ml-auto shrink-0' : ''} onClick={event => { event.preventDefault(); event.stopPropagation(); openAi(ids, label); }}><WandSparkles size={14} aria-hidden="true" />{section ? 'Revisar apartado con IA' : 'Corregir con IA'}</button>;
  const [historical, setHistorical] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [answering, setAnswering] = useState(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [qualityConfirmOpen, setQualityConfirmOpen] = useState(false);
  const [startingReview, setStartingReview] = useState(false);
  const actorPanelRef = React.useRef(null);
  const reviewActor = id => {
    const panel = actorPanelRef.current;
    const details = panel?.querySelector('details');
    if (details) details.open = true;
    const article = [...(panel?.querySelectorAll('[data-actor-id]') || [])].find(node => node.dataset.actorId === id);
    article?.querySelector('button')?.click();
  };
  const editingBaseline = React.useRef(null);
  const elementBaseline = React.useRef(null);
  React.useEffect(() => { editingBaseline.current = editing ? JSON.stringify(editing) : null; elementBaseline.current = editing ? inventory.find(item => item.id === (editing.dividir_de || editing.id)) || null : null; }, [editing?.id, editing?.dividir_de]);
  const closeEditor = () => {
    if (editing && JSON.stringify(editing) !== editingBaseline.current && !window.confirm('¿Descartar los cambios del elemento sin guardar?')) return;
    setToolsOpen(false); setEditing(null); setError('');
  };
  const dirty = Boolean(summary || additional.trim() || editing || summaryDirty);
  React.useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  React.useEffect(() => { setSummary(null); setAck(false); }, [row?.id]);
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
    await save({ ...content, inventario: items }, { justificacion: creating ? `Alta manual de ${item.id} sustentada en evidencia.` : reason });
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
    <header className="initial-analysis__header"><div className="initial-analysis__icon"><FileSearch size={24} /></div><div><p className="text-xs font-bold tracking-wide text-violet-700">FASE 2 · ANÁLISIS INICIAL</p><h1 className="text-2xl font-bold">Comprender el proyecto antes de redactar requisitos</h1><p className="initial-analysis__intro">Revisa la interpretación del proyecto y sus evidencias. Los requisitos se redactarán después de tu aprobación.</p></div><div className="initial-analysis__metadata"><span>Versión {row?.version || 'heredada'}</span><span>{row?.estado === 'aprobado' ? 'Aprobado · solo lectura' : row?.estado === 'borrador' ? 'Borrador en revisión' : 'Sin aprobación inicial'}</span><span>Proveedor: {provider === 'auto' ? 'Automático' : provider}</span></div></header>
    {editable && <section className="initial-analysis__actions my-4" aria-label="Acciones del análisis"><div className="flex flex-wrap gap-2">
      <button onClick={() => { setError(''); setEditing({ id: nextId('N', inventory.map(n => n.id)), tipo: 'RF', objetivo_id: nextId('O', inventory.map(n => n.objetivo_id)), estado: 'pendiente', necesidad: '', cita: '', fuente: 'insumo_directo' }); }} disabled={busy}><Plus size={15} aria-hidden="true" />Añadir necesidad</button>
      {onReviewQuality && <button disabled={busy || dirty} onClick={() => { setError(''); setQualityConfirmOpen(true); }}><ShieldCheck size={15} aria-hidden="true" />Revisar calidad del análisis</button>}
      {rejectedToggle}
    </div>
    <AnalysisModal open={qualityConfirmOpen} title="¿Revisar la calidad del análisis con IA?" busy={busy || startingReview} onClose={() => setQualityConfirmOpen(false)}>
      <p>Se revisará el borrador actual utilizando las fuentes del proyecto y el proveedor seleccionado.</p>
      <ul className="my-4 list-disc space-y-2 pl-5 text-sm text-slate-600"><li>Esta acción consume solicitudes y tokens de IA.</li><li>No extrae el análisis desde cero ni aplica correcciones automáticamente. Podrás revisar la propuesta antes de aceptarla.</li><li>No aprueba requisitos ni diagramas.</li></ul>
      <div className="flex flex-wrap gap-2"><button className="initial-analysis__primary" disabled={busy || startingReview || dirty} onClick={() => run(async () => { setStartingReview(true); try { await onReviewQuality(); setQualityConfirmOpen(false); } finally { setStartingReview(false); } })}>{startingReview ? 'Iniciando…' : 'Confirmar y revisar con IA'}</button><button disabled={busy || startingReview} onClick={() => setQualityConfirmOpen(false)}>Cancelar</button></div>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </AnalysisModal>
    {onExtract && <div className="initial-analysis__restart">
      <button className="initial-analysis__restart-button" title="Vuelve a extraer el análisis sin reutilizar las etapas anteriores" disabled={busy || dirty} onClick={() => setReprocessOpen(true)}><RotateCcw size={15} aria-hidden="true" />Reprocesar desde cero</button>
      <AnalysisModal open={reprocessOpen} title="¿Reprocesar el análisis desde cero?" busy={busy || reprocessing} onClose={() => setReprocessOpen(false)}>
        <p>Se realizará una extracción y revisión nuevas con el proveedor seleccionado, como en el primer análisis.</p>
        <ul className="my-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Se usarán las fuentes actuales y la información adicional explícita que guardaste.</li>
          <li>La nueva interpretación no partirá de las ediciones del borrador anterior.</li>
          <li>Se conservarán las versiones anteriores, los requisitos y los diagramas. No se aprobará nada automáticamente.</li>
          <li>Consume nuevas solicitudes y tokens de IA. Si falla, conservarás el análisis anterior.</li>
        </ul>
        <div className="flex flex-wrap gap-2"><button className="initial-analysis__primary" disabled={busy || reprocessing} onClick={() => run(async () => { setReprocessing(true); try { await onExtract(row.id); setReprocessOpen(false); } finally { setReprocessing(false); } })}>{reprocessing ? 'Iniciando…' : 'Confirmar y reprocesar desde cero'}</button><button disabled={busy || reprocessing} onClick={() => setReprocessOpen(false)}>Cancelar</button></div>
        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      </AnalysisModal>
    </div>}
    <AnalysisModal open={Boolean(toolsOpen || editing)} title={editing ? editorTitle : ({ information: 'Añadir información al proyecto', ai: 'Solicitar corrección con IA' }[toolsOpen])} busy={busy || savingElement} onClose={closeEditor} footer={editing && <div className="flex justify-end gap-3"><button type="button" disabled={busy || savingElement} onClick={closeEditor}>Cancelar</button><button type="submit" form={editorFormId} className="initial-analysis__primary" disabled={busy || savingElement}>{savingElement ? 'Guardando…' : creating ? 'Crear necesidad' : 'Guardar elemento'}</button></div>}><fieldset disabled={busy} className="space-y-3">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {editing && error && /borrador cambió|versión|recarga/i.test(error) && onRefresh && <button type="button" disabled={busy || savingElement} onClick={() => run(async () => {
        const latest = await onRefresh();
        if (!latest?.borrador) throw new Error('No hay un borrador editable. Reabre el análisis para continuar; conserva una copia de lo escrito.');
        const items = latest.borrador.contenido.inventario || [];
        const original = items.find(item => item.id === (editing.dividir_de || editing.id));
        if (elementBaseline.current && JSON.stringify(original) !== JSON.stringify(elementBaseline.current)) {
          setError('El elemento original también cambió. Compara tus cambios con la versión actual antes de guardar; no se ha sobrescrito nada.');
        }
        if ((!elementBaseline.current || editing.dividir_de) && items.some(item => item.id === editing.id)) setEditing(previous => ({ ...previous, id: nextId('N', items.map(item => item.id)), objetivo_id: nextId('O', items.map(item => item.objetivo_id)) }));
      })}>Actualizar versión conservando el formulario</button>}
      {!editing && toolsOpen === 'information' && <>
      <p className="initial-analysis__intro">Registra acuerdos o datos que no aparezcan en los archivos. Se guardarán como insumo adicional explícito, no como requisitos automáticos. Después puedes añadir una necesidad o pedir una corrección puntual a la IA.</p>
      <label className="block">Insumo adicional explícito (si deseas añadir obligaciones nuevas)<textarea className="block w-full border p-2" value={additional} onChange={e => setAdditional(e.target.value)} /></label>
      <label className="block">Justificación de los cambios<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button disabled={!additional.trim() || !reason.trim()} onClick={() => run(async () => { await save(content); setToolsOpen(false); })}>Guardar información</button>
      {additional && <button onClick={() => { setAdditional(''); setToolsOpen(false); }}>Descartar información sin guardar</button>}
      </>}
      {editing && <form id={editorFormId} onSubmit={submitElement} noValidate role="region" aria-label={editorTitle} className="initial-analysis__editor space-y-2 rounded bg-slate-50 p-3"><label className="block">Contenido<textarea autoFocus aria-label="Contenido" name="necesidad" aria-invalid={Boolean(fieldErrors.necesidad)} aria-describedby={fieldErrors.necesidad ? `${editorFormId}-necesidad` : undefined} className="block w-full border p-2" value={editing.necesidad} onChange={e => setEditing({ ...editing, necesidad: e.target.value })} /></label>{fieldError('necesidad')}
        {editing.dividir_de && <label className="block">Resultado que conserva {editing.dividir_de}<textarea className="block w-full border p-2" value={editing.resultado_original} name="resultado_original" aria-invalid={Boolean(fieldErrors.resultado_original)} aria-describedby={fieldErrors.resultado_original ? `${editorFormId}-resultado_original` : undefined} onChange={e => setEditing({ ...editing, resultado_original: e.target.value })} /></label>}{fieldError('resultado_original')}
        <label className="block">Categoría<select value={isTechnologyStack(editing) ? 'stack' : editing.tipo} onChange={event => {
          const selected = event.target.value;
          setEditing({ ...editing, tipo: selected === 'stack' ? 'restriccion_tecnica' : selected, grupo: selected === 'stack' ? 'stack' : selected === 'restriccion_tecnica' ? 'restriccion' : undefined });
        }}>{types.flatMap((type, i) => type === 'restriccion_tecnica' ? [<option key="stack" value="stack">Stack tecnológico</option>, <option key={type} value={type}>{labels[i]}</option>] : [<option key={type} value={type}>{labels[i]}</option>])}</select></label>
        {['RF', 'RNF'].includes(editing.tipo) && <label className="block">Objetivo (RF/RNF)<ObjectiveAutocomplete value={editing.objetivo_id || ''} inventory={inventory} type={editing.tipo} invalid={Boolean(fieldErrors.objetivo_id)} describedBy={fieldErrors.objetivo_id ? `${editorFormId}-objetivo_id` : undefined} onChange={objetivo_id => { setEditing(previous => ({ ...previous, objetivo_id })); setFieldErrors(previous => ({ ...previous, objetivo_id: undefined })); }} /></label>}{fieldError('objetivo_id')}
        <label className="block">Estado<select value={editing.estado} onChange={e => setEditing({ ...editing, estado: e.target.value })}>{['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="block">Cita literal<textarea aria-label="Cita literal" name="cita" aria-invalid={Boolean(fieldErrors.cita)} aria-describedby={fieldErrors.cita ? `${editorFormId}-cita` : undefined} className="block w-full border p-2" value={editing.cita} onChange={e => setEditing({ ...editing, cita: e.target.value })} /></label>{fieldError('cita')}
        <p className="text-xs text-slate-500">Pega cada oración tal como está en la fuente. Quita los puntos suspensivos, las palabras añadidas y los fragmentos que no encuentres. El estado confirmado no valida la cita: al guardar, cada fragmento tiene que localizarse en el archivo.</p>
        <label className="block">Archivo de origen<SourceAutocomplete sources={sources} value={editing.fuente} onChange={fuente => setEditing({ ...editing, fuente })} /></label>
        {(editing.evidencias || []).slice(1).map((fragment, index) => <div key={index} className="rounded-lg border border-slate-200 p-3"><label>Fragmento adicional {index + 2}<textarea value={fragment.texto || ''} onChange={e => setEditing({ ...editing, evidencias: editing.evidencias.map((entry, n) => n === index + 1 ? { ...entry, texto: e.target.value } : entry) })} /></label><label>Archivo del fragmento {index + 2}<SourceAutocomplete sources={sources} value={fragment.fuente || ''} onChange={fuente => setEditing({ ...editing, evidencias: editing.evidencias.map((entry, n) => n === index + 1 ? { ...entry, fuente } : entry) })} /></label><button type="button" onClick={() => setEditing({ ...editing, evidencias: editing.evidencias.filter((_, n) => n !== index + 1) })}>Quitar fragmento {index + 2}</button></div>)}
        <button type="button" onClick={() => setEditing({ ...editing, evidencias: [...(editing.evidencias?.length ? editing.evidencias : [{ texto: editing.cita, fuente: editing.fuente }]), { texto: '', fuente: editing.fuente || '' }] })}>Añadir fragmento de evidencia</button>
        {['RF', 'RNF'].includes(editing.tipo) && <label className="block">Actor<select value={editing.actor_id || ''} onChange={e => setEditing({ ...editing, actor_id: e.target.value || undefined })}><option value="">Sin actor enlazado</option>{(content.actores || []).map(actor => <option key={actor.id} value={actor.id}>{actor.nombre}</option>)}</select></label>}
        {['RF', 'RNF'].includes(editing.tipo) && <fieldset className="space-y-1"><legend className="text-sm font-medium">Reglas que condicionan esta necesidad</legend>{inventory.filter(rule => rule.tipo === 'regla_negocio').map(rule => <label key={rule.id} className="block text-sm"><input type="checkbox" checked={(editing.reglas_ids || []).includes(rule.id)} onChange={e => setEditing({ ...editing, reglas_ids: e.target.checked ? [...new Set([...(editing.reglas_ids || []), rule.id])] : (editing.reglas_ids || []).filter(id => id !== rule.id) })} /> {rule.id} · {rule.necesidad}</label>)}{!inventory.some(rule => rule.tipo === 'regla_negocio') && <p className="text-xs text-slate-500">No hay reglas de negocio para enlazar.</p>}</fieldset>}
        {!creating && <label className="block">Justificación de los cambios<textarea aria-label="Justificación de los cambios" name="reason" aria-invalid={Boolean(fieldErrors.reason)} aria-describedby={fieldErrors.reason ? `${editorFormId}-reason` : undefined} className="block w-full border p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>}{!creating && fieldError('reason')}
      </form>}
      {!editing && toolsOpen === 'ai' && <>
      <p className="initial-analysis__intro">Se consultará a la IA y se consumirán tokens. Recibirás una propuesta para comparar y aceptar; no se aplicará automáticamente. Para aportar acuerdos nuevos, sube un insumo desde el panel de fuentes.</p>
      {aiScope && <p className="rounded-lg bg-violet-50 p-3 text-sm"><strong>Alcance: {aiScope.label}</strong><br />Solo se podrán modificar: {aiScope.ids.join(', ')}. Los problemas externos se señalarán sin modificar otros elementos.</p>}
      <label className="block">Corrección puntual con IA<textarea className="block w-full border p-2" value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
      {!aiScope && <label className="block">IDs a corregir (separados por coma; usa sintesis para el resumen)<input className="block w-full border p-2" value={targetIds} onChange={e => setTargetIds(e.target.value)} placeholder="N-01, ACT-01" /></label>}
      <button disabled={busy || requestingProposal || dirty || !instruction.trim() || !targetIds.trim()} onClick={() => run(async () => { setRequestingProposal(true); try { await onProposal(instruction, aiScope?.ids || targetIds.split(',').map(id => id.trim()).filter(Boolean)); setToolsOpen(false); } finally { setRequestingProposal(false); } })}>{requestingProposal ? 'Solicitando…' : 'Confirmar y solicitar propuesta sin aplicar'}</button>
      </>}
    </fieldset></AnalysisModal></section>}

    {!state?.vigente && state?.aprobado && <p role="alert" className="my-3 rounded border border-amber-300 p-3">La versión aprobada no corresponde al contenido actual de las fuentes. Revisa un nuevo borrador.</p>}
    {state?.borrador && !state.borrador_vigente && <p role="alert" className="my-3 rounded border border-amber-300 p-3">Las fuentes cambiaron desde este borrador. Contrasta sus citas y guarda la revisión antes de aprobar.</p>}
    <AnalysisModal open={Boolean(merging)} title={`Fusionar con ${merging?.id || ''}`} busy={busy || mergeBusy} onClose={() => setMerging(null)} footer={<div className="flex justify-end gap-3"><button disabled={busy || mergeBusy} onClick={() => setMerging(null)}>Cancelar</button><button className="initial-analysis__primary" disabled={busy || mergeBusy || !mergeIds.length || !mergeText.trim()} onClick={async () => { setMergeBusy(true); setMergeError(''); try { await onSave({ accion: 'fusionar_necesidades', id: merging.id, ids: mergeIds, contenido: mergeText, version_esperada: row.id, justificacion: `Fusión manual de ${[merging.id, ...mergeIds].join(', ')} en ${merging.id}.` }); setMerging(null); } catch (failure) { setMergeError(failure.message); } finally { setMergeBusy(false); } }}>{mergeBusy ? 'Guardando…' : 'Confirmar fusión'}</button></div>}>
      {merging && <div className="space-y-4"><p className="rounded-xl bg-violet-50 p-3 text-sm">Se conservarán <strong>{merging.id}</strong> y su objetivo <strong>{merging.objetivo_id || 'no aplica'}</strong>. Se reunirán las evidencias y las referencias. Los originales quedarán conservados como fusionados e inactivos.</p><fieldset disabled={busy || mergeBusy} className="space-y-2"><legend className="mb-2 font-semibold">Selecciona elementos del mismo tipo</legend>{inventory.filter(item => item.id !== merging.id && item.tipo === merging.tipo && !['rechazado', 'fuera_de_alcance'].includes(item.estado)).map(item => <label key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" className="mt-1 accent-violet-600" checked={mergeIds.includes(item.id)} onChange={event => setMergeIds(ids => event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} /><span><strong>{item.id}</strong> · {item.necesidad}<span className="block text-xs text-slate-500">Objetivo: {item.objetivo_id || 'no aplica'}</span></span></label>)}</fieldset><p className="text-xs text-amber-800">Fusiona solo duplicados o detalles del mismo resultado. Tener el mismo tipo no significa que sean equivalentes. Si difieren actores u objetivos, revisa que no se pierda ninguna obligación.</p><label className="block">Contenido final<textarea className="mt-1 block w-full" value={mergeText} disabled={mergeBusy} onChange={event => setMergeText(event.target.value)} /></label><details><summary>Evidencias que se conservarán</summary>{[merging, ...inventory.filter(item => mergeIds.includes(item.id))].map(item => <div key={item.id}><strong>{item.id}</strong><AnalysisEvidence item={item} /></div>)}</details>{mergeError && <p role="alert" className="text-red-700">{mergeError}</p>}</div>}
    </AnalysisModal>
    {error && !editing && !toolsOpen && !reprocessOpen && !qualityConfirmOpen && <p role="alert" className="my-3 text-red-700">{error}</p>}
    {!!pendingValidation.length && <details className="my-4 rounded border border-amber-200 p-4" open><summary className="font-semibold cursor-pointer">Elementos pendientes de validación ({pendingValidation.length})</summary><p className="mt-2 text-sm">Estos elementos se conservaron, pero aún no forman parte del inventario validado. Revisa la causa antes de aprobar.</p>{pendingValidation.map((pending, index) => { const item = pending.elemento || pending; return <article key={item.id || index} className="my-3 rounded border p-3"><strong>{item.id || pending.id} · {item.necesidad || 'Contenido pendiente'}</strong><AnalysisEvidence item={item} /><p className="text-sm text-amber-800">Causa: {(pending.errores || []).map(code => ({ evidencia_no_localizada: 'la cita no está en el archivo como texto continuo', evidencia_ambigua: 'la cita aparece más de una vez; añade más contexto', evidencia_fuera_del_contenido_original: 'la cita está en los datos del archivo, no en su contenido', evidencia_ausente: 'falta la cita' }[code] || code)).join('. ') || pending.motivo || 'Validación pendiente'}. Marcar confirmado no sustituye esa cita.</p>{editable && <div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} onClick={() => openDiagnostic(item)}>Revisar evidencia y contenido</button><button disabled={busy} onClick={() => acceptCitation(item.id || pending.id)}>Aceptar cita</button></div>}</article>; })}</details>}
    {!editable && <div className="mb-4 flex items-center">{rejectedToggle}</div>}
    <details className="my-4 rounded border p-4" open><summary className="flex cursor-pointer items-center justify-start gap-3 text-left font-semibold"><span className="min-w-0 flex-1 text-left">Contexto, problema, objetivos y alcance</span>{editable && !summaryEditing && <button type="button" className="rounded-lg border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50" onMouseDown={event => event.preventDefault()} onClick={event => { event.preventDefault(); event.stopPropagation(); setSummaryEditing(true); }}>Editar</button>}{aiButton(['sintesis'], 'Contexto, problema, objetivos y alcance', true)}</summary>
      <AnalysisSummaryFields key={summaryEditing ? 'editando-resumen' : 'lectura-resumen'} sintesis={summary || content.sintesis || {}} inventory={inventory} editing={summaryEditing} busy={busy} onDirty={setSummaryDirty} onClose={() => setSummaryEditing(false)} onCommit={async change => { setError(''); try { await save({ ...content, inventario: change.inventario || inventory }, { sintesis: change.sintesis, justificacion: change.justificacion }); } catch (failure) { setError(failure.message); throw failure; } }} />
      {visibleInventory.some(n => n.tipo === 'contexto') && <div className="mt-4"><h3 className="text-sm font-semibold text-slate-700">Información de apoyo de las fuentes</h3>{visibleInventory.filter(n => n.tipo === 'contexto').map(item => <article key={item.id} className="mt-3"><p><strong>{item.id}</strong>{item.estado === 'rechazado' && <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Rechazada</span>} · {item.necesidad}</p>{(item.evidencias || (item.evidencia ? [{ texto: item.evidencia }] : [])).map((e, index) => <blockquote key={index}>{e.texto} · {e.fuente || 'insumo directo'}</blockquote>)}{editable && <button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar información de apoyo</button>}</article>)}</div>}
    </details>
    <div ref={actorPanelRef} className="initial-analysis__actor-panel"><RequirementActorsPanel sources={sources} modalForms onCorrectActor={actor => openAi([actor.id], `Actor: ${actor.nombre}`)} onReviewActors={() => openAi((content.actores || []).map(actor => actor.id), 'Actores del sistema')} audit={content} requirements={{}} readOnly={!editable || busy || Boolean(editing)} onReview={async body => { await onSave({ ...body, version_esperada: row.id, sintesis: summary || content.sintesis, insumo_adicional: additional }); setAdditional(''); }} /></div>
    {[...types.slice(0, 3), 'stack', ...types.slice(3)].map(type => type === 'stack' ? (() => { const stack = visibleInventory.filter(isTechnologyStack); return <details key="stack" className="my-3 rounded border p-4"><summary className="cursor-pointer font-semibold">Stack tecnológico <span className="initial-analysis__count">{stack.length}</span>{aiButton(stack.map(item => item.id), "Stack tecnológico", true)}</summary><p className="initial-analysis__intro">Tecnologías acordadas para construir el sistema. Cada elemento se guarda una sola vez.</p>{stack.length ? stack.map(item => <article key={item.id} className="mt-4 border-t pt-3"><p><strong>{item.id}</strong>{item.estado === 'rechazado' && <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Rechazada</span>} · {item.necesidad}</p><p className="text-xs text-slate-500">{item.estado} · objetivo {item.objetivo_id || 'no aplica'}</p><AnalysisEvidence item={item} />{editable && <div className="flex flex-wrap gap-4 text-violet-700"><button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar o reclasificar</button><button disabled={busy} onClick={() => split(item)}>Separar otro resultado</button>{aiButton([item.id], item.id)}{mergeButton(item)}</div>}</article>) : <p className="initial-analysis__empty">No se identificaron tecnologías del stack.</p>}</details>; })() : type !== 'contexto' && <details key={type} className="my-3 rounded border p-4"><summary className="cursor-pointer font-semibold">{type === 'pregunta' ? 'Preguntas y aclaraciones' : labels[types.indexOf(type)]} <span className="initial-analysis__count">{visibleInventory.filter(n => n.tipo === type && !isTechnologyStack(n)).length}</span>{type !== 'pregunta' && aiButton(visibleInventory.filter(n => n.tipo === type && !isTechnologyStack(n)).map(item => item.id), labels[types.indexOf(type)], true)}</summary>
      {type === 'pregunta' && <p className="initial-analysis__intro">{visibleInventory.filter(n => n.tipo === 'pregunta' && n.estado === 'pendiente').length} pendientes · {visibleInventory.filter(n => n.tipo === 'pregunta' && n.respuesta).length} respondidas. Puedes avanzar con dudas pendientes; no se asumirán como acuerdos. En Responder pregunta escribe el dato que falta, por ejemplo si las copias serán diarias o cuánto tiempo puede permanecer el sistema inactivo antes de volver a funcionar.</p>}
      {type === 'restriccion_tecnica' && <p className="initial-analysis__intro">Canales, dispositivos y límites que no forman parte del stack.</p>}
      {!visibleInventory.some(n => n.tipo === type && !isTechnologyStack(n)) && <p className="initial-analysis__empty">No se identificaron elementos en esta categoría.</p>}
      {visibleInventory.filter(n => n.tipo === type && !isTechnologyStack(n)).map(item => <article key={item.id} className="mt-4 border-t pt-3"><p><strong>{item.id}</strong>{item.estado === 'rechazado' && <span className="ml-2 inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Rechazada</span>} · {item.necesidad}</p><p className="text-xs text-slate-500">{item.estado} · objetivo {item.objetivo_id || 'no aplica'}</p>
        {(item.actor_id || item.reglas_ids?.length || item.preguntas_ids?.length) && <p className="text-xs text-slate-600">{item.actor_id ? `Actor: ${(content.actores || []).find(actor => actor.id === item.actor_id)?.nombre || item.actor_id}. ` : ''}{item.reglas_ids?.length ? `Reglas: ${item.reglas_ids.map(id => { const rule = inventory.find(entry => entry.id === id); return rule ? `${id} · ${rule.necesidad}` : id; }).join(' · ')}. ` : ''}{item.preguntas_ids?.length ? `Preguntas de umbral: ${item.preguntas_ids.join(', ')}.` : ''}</p>}
        <AnalysisEvidence item={item} />
        {item.respuesta && <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><strong className="text-emerald-800">Respondida</strong><p>{item.respuesta.texto}</p><p className="text-xs text-slate-500">Registrada como insumo adicional · Elemento resultante: {(item.respuesta.elementos_resultantes || [item.respuesta.elemento_resultante]).join(', ')}{item.respuesta.elementos_relacionados?.length ? ` · Relacionados: ${item.respuesta.elementos_relacionados.join(', ')}` : ''}</p></div>}
        
        {editable && type === 'pregunta' && item.estado === 'pendiente' && <button disabled={busy || dirty} onClick={() => setAnswering(item)}>Responder pregunta</button>}
        {editable && type !== 'pregunta' && <div className="flex flex-wrap gap-4 text-violet-700"><button disabled={busy} onClick={() => setEditing({ ...item, cita: item.evidencias?.[0]?.texto || item.evidencia || '', fuente: item.evidencias?.[0]?.fuente || '' })}>Editar o reclasificar</button><button disabled={busy} onClick={() => split(item)}>Separar otro resultado</button>{aiButton([item.id], item.id)}{mergeButton(item)}</div>}
      </article>)}
    </details>)}
    {answering && <AnswerQuestionModal key={answering.id} version={row.id} question={answering} inventory={inventory} busy={busy} onAnalyze={onAnalyzeAnswer} onClose={() => setAnswering(null)} onSave={body => onSave({ ...body, version_esperada: row.id })} />}

    {proposal?.propuesta && <details open className="my-4 rounded border p-4"><summary>Comparación de propuesta IA · requiere revisión humana</summary><p>Elementos seleccionados: {(proposal.elementos_afectados || []).join(', ')}.</p><p>Corrección solicitada: {proposal.justificacion}</p><div className="grid gap-4 md:grid-cols-2"><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(content, null, 2)}</pre><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(proposal.propuesta, null, 2)}</pre></div><button disabled={busy || dirty || !editable} onClick={() => run(onApplyProposal)}>Aplicar propuesta a un nuevo borrador</button></details>}
    <details className="my-4 rounded border p-4" open><summary><ShieldCheck size={18} /> Diagnósticos y pendientes <span className="initial-analysis__count">{issues.length + warnings.length + diagnosticItems.length}</span></summary>
      <p className="initial-analysis__intro">{issues.length ? 'Corrige los siguientes errores antes de aprobar el análisis.' : 'Estructura y citas válidas. Esto no demuestra por sí solo que el contenido esté completo.'}</p>
      <div className="my-3 rounded-xl border border-violet-100 bg-violet-50 p-3"><strong>Revisión de contenido: {content.revision_inventario?.estado === 'completa' ? 'completada por IA' : 'parcial o pendiente'}</strong><p className="text-xs">{content.revision_inventario?.motivo || 'La revisión asistida requiere contraste humano; no certifica exhaustividad.'}</p></div>
      {diagnosticItems.map((finding, index) => <div key={index} className="initial-analysis__notice"><Info size={17} /><div><strong>{finding.codigo === 'POSIBLE_AGRUPACION' ? 'Posible agrupación: revisar' : finding.codigo}</strong><p>{finding.descripcion}</p><p>{finding.accion}</p><AnalysisEvidence item={finding} />{editable && (finding.elementos || []).map(id => inventory.find(n => n.id === id)).filter(Boolean).map(item => <button key={item.id} onClick={() => openDiagnostic(item)} disabled={busy}>Corregir {item.id}</button>)}<div className="mt-2 flex flex-wrap gap-2">{editable && (finding.elementos || []).filter(id => content.actores?.some(a => a.id === id)).map(id => <button key={id} disabled={busy} onClick={() => reviewActor(id)}>Revisar actor {id}</button>)}{editable && !finding.elementos?.length && onReviewQuality && <button disabled={busy || dirty} onClick={() => { setError(''); setQualityConfirmOpen(true); }}>Revisar propuesta de incorporación</button>}<button disabled={busy} onClick={onBack}>Consultar fuente original</button></div></div></div>)}
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
