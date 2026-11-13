import React, { useState } from 'react';
import AnalysisModal from './AnalysisModal';
import { ShieldCheck } from 'lucide-react';

function suggestedType(question) {
  const text = `${question?.necesidad || ''}`.toLowerCase();
  if (/respaldo|copia|recurrencia|frecuencia|inactiv|recuper|caída|caida|volver a funcionar/.test(text)) return 'RNF';
  return 'decision';
}
function answerHint(question) {
  const text = `${question?.necesidad || ''}`.toLowerCase();
  if (/respaldo|copia|recurrencia|frecuencia/.test(text)) return 'Por ejemplo: las copias de seguridad se harán todos los días al cerrar.';
  if (/inactiv|recuper|caída|caida|volver a funcionar/.test(text)) return 'Por ejemplo: el sistema no debe permanecer inactivo más de 30 minutos.';
  return 'Escribe el dato acordado. Si todavía no se conoce, cierra este cuadro y deja la pregunta pendiente.';
}

export default function AnswerQuestionModal({ question, inventory, busy, onClose, onSave, onAnalyze, version }) {
  const [elements, setElements] = useState(null);
  const [proposalId, setProposalId] = useState(null);
  const [resumeId, setResumeId] = useState(null);
  const [answer, setAnswer] = useState('');
  const [type, setType] = useState(() => suggestedType(question));
  const [related, setRelated] = useState([]);
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const baseVersion = React.useRef(version);
  React.useEffect(() => {
    if (baseVersion.current !== version) {
      baseVersion.current = version; setElements(null); setProposalId(null); setResumeId(null); setConfirmed(false);
      setError('El análisis cambió. Se conserva tu respuesta; revisa otra propuesta antes de guardar.');
    }
  }, [version]);
  const locked = busy || saving;
  const close = () => { if (!answer.trim() || window.confirm('¿Cerrar sin guardar esta respuesta?')) onClose(); };
  const options = inventory.filter(n => n.tipo !== 'pregunta' && !['rechazado', 'fuera_de_alcance'].includes(n.estado));
  return <AnalysisModal open title={`Responder pregunta ${question.id}`} busy={locked} onClose={close}>
    <p className="mb-4 rounded-xl bg-violet-50 p-4 text-sm text-violet-900">{question.necesidad}</p>
    <p className="initial-analysis__intro">Tu respuesta se guardará como información explícita del proyecto. La pregunta quedará respondida y se añadirá un elemento vinculado, sin reemplazar otros acuerdos.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError(''); setSaving(true);
      try { await onSave({ accion: 'responder_pregunta', id: question.id, respuesta: answer.trim(), tipo_resultado: type, elementos_relacionados: related, ...(elements?.length ? { elementos: elements, confirmar_elementos: true, propuesta_job_id: proposalId } : {}), ...(goal ? { objetivo_id: goal } : {}), justificacion: `Respuesta explícita del usuario a ${question.id}.` }); onClose(); }
      catch (failure) { setError(failure.message); }
      finally { setSaving(false); }
    }}><fieldset disabled={locked}>
      <h3 className="font-semibold text-violet-900">1. Escribe la respuesta acordada</h3>
      <label>Respuesta acordada<textarea aria-label="Respuesta acordada" autoFocus required maxLength={12000} value={answer} onChange={e => { setAnswer(e.target.value); setElements(null); setProposalId(null); setResumeId(null); setConfirmed(false); }} placeholder={answerHint(question)} /></label>
      <p className="initial-analysis__intro">Guardar esta respuesta no exige un análisis de IA. La propuesta automática queda como apoyo opcional.</p>
      {onAnalyze && <button type="button" disabled={!answer.trim() || locked} onClick={async () => { setSaving(true); setError(''); try { const requestedVersion = baseVersion.current; const proposal = await onAnalyze(question.id, answer.trim(), resumeId); if (requestedVersion !== baseVersion.current) throw new Error('El análisis cambió durante la propuesta; vuelve a revisarla.'); setElements(proposal.elementos); setProposalId(proposal.trabajo_id); setConfirmed(false); setResumeId(null); } catch (failure) { setError(failure.message); setResumeId(failure.trabajoId || null); } finally { setSaving(false); } }}>{saving ? 'Analizando…' : resumeId ? 'Reanudar análisis de respuesta' : 'Proponer cómo incorporar la respuesta'}</button>}
      {!!elements?.length && <><h3 className="mt-5 font-semibold text-violet-900">2. Revisa los elementos antes de guardar</h3><p className="initial-analysis__intro">Puedes corregir cada propuesta. Categorías o resultados independientes deben quedar en elementos distintos. El texto original de tu respuesta se conservará.</p>
      {(elements || []).map((element, index) => <div key={index} className="my-3 rounded-xl border border-violet-100 p-3"><label>Contenido del elemento {index + 1}<textarea aria-label={`Contenido del elemento ${index + 1}`} value={element.necesidad || ''} onChange={e => { setElements(elements.map((n, i) => i === index ? { ...n, necesidad: e.target.value } : n)); setConfirmed(false); }} /></label><label>Categoría del elemento {index + 1}<select value={element.tipo} onChange={e => { setElements(elements.map((n, i) => i === index ? { ...n, tipo: e.target.value, objetivo_id: undefined } : n)); setConfirmed(false); }}><option value="decision">Decisión</option><option value="RF">Capacidad funcional</option><option value="RNF">Cualidad esperada</option><option value="regla_negocio">Regla de negocio</option><option value="restriccion_tecnica">Restricción técnica</option></select></label><label>Evidencia del elemento {index + 1}<textarea aria-label={`Evidencia del elemento ${index + 1}`} value={element.evidencia || element.evidencias?.[0]?.texto || ''} onChange={e => { setElements(elements.map((n, i) => i === index ? { ...n, evidencia: e.target.value, evidencias: undefined } : n)); setConfirmed(false); }} /></label><label>Estado del elemento {index + 1}<select value={element.estado || 'confirmado'} onChange={e => { setElements(elements.map((n, i) => i === index ? { ...n, estado: e.target.value } : n)); setConfirmed(false); }}><option value="confirmado">Confirmado</option><option value="pendiente">Detalle pendiente</option></select></label>{['RF', 'RNF'].includes(element.tipo) && <label>Objetivo del elemento {index + 1}<select value={element.objetivo_id || ''} onChange={e => { setElements(elements.map((n, i) => i === index ? { ...n, objetivo_id: e.target.value || undefined } : n)); setConfirmed(false); }}><option value="">Objetivo nuevo</option>{options.filter(n => n.tipo === element.tipo && n.objetivo_id).map(n => <option key={n.id} value={n.objetivo_id}>Complementar {n.id}: {n.necesidad}</option>)}</select></label>}<button type="button" onClick={() => { setElements(elements.filter((_, i) => i !== index)); setConfirmed(false); }}>Quitar elemento {index + 1}</button></div>)}
      <button type="button" disabled={!answer.trim()} onClick={() => { setElements([...(elements || []), { tipo: 'decision', necesidad: '', evidencia: '', estado: 'confirmado' }]); setConfirmed(false); }}>Añadir elemento manual</button></>}
      {!elements?.length && <>
      <label>¿Cómo debe incorporarse?<select value={type} onChange={e => { setType(e.target.value); setGoal(''); }}>
        <option value="decision">Decisión o aclaración del proyecto</option><option value="RNF">Cualidad o condición de calidad (RNF)</option><option value="RF">Capacidad funcional (RF)</option><option value="regla_negocio">Regla de negocio</option><option value="restriccion_tecnica">Restricción técnica</option>
      </select></label>
      <p className="initial-analysis__intro">No necesitas reclasificar la pregunta ni copiar una cita: el sistema conservará la pregunta original y usará tu respuesta como evidencia.</p>
      {['RF', 'RNF'].includes(type) && <label>Objetivo de la respuesta<select value={goal} onChange={e => setGoal(e.target.value)}><option value="">Un objetivo nuevo</option>{[...new Map(options.filter(n => n.tipo === type && n.objetivo_id).map(n => [n.objetivo_id, n])).values()].map(n => <option key={n.objetivo_id} value={n.objetivo_id}>Complementar {n.id}: {n.necesidad}</option>)}</select></label>}
      </>}
      {!!options.length && <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><summary>Vínculos de referencia · opcional <span className="initial-analysis__count">{related.length}</span></summary><p className="initial-analysis__intro">Marca los elementos relacionados con esta respuesta. Vincularlos no confirma el acuerdo ni cambia su contenido.</p><div role="group" aria-label="Elementos relacionados con la respuesta">{options.map(n => <label key={n.id} className="my-2 flex items-start gap-2"><input type="checkbox" checked={related.includes(n.id)} onChange={e => setRelated(e.target.checked ? [...related, n.id] : related.filter(id => id !== n.id))} /><span>{n.id} · {n.necesidad}</span></label>)}</div></details>}
      <section aria-labelledby="answer-confirmation-title" className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <h3 id="answer-confirmation-title" className="flex items-center gap-2 text-sm font-semibold text-violet-900"><ShieldCheck size={18} aria-hidden="true" />Confirmación del acuerdo · obligatoria</h3>
        <p id="answer-confirmation-help" className="mt-2 text-xs text-slate-600">Este paso es independiente de los vínculos anteriores. Autoriza a utilizar tu respuesta como información confirmada del proyecto.</p>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" aria-describedby="answer-confirmation-help" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Confirmo que esta respuesta es un acuerdo y puede utilizarse para generar los requisitos.</span></label>
      </section>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
      <button type="submit" className="initial-analysis__primary" disabled={!answer.trim() || !confirmed || locked || Boolean(elements?.length) && elements.some(n => !n.necesidad?.trim() || !(n.evidencia || n.evidencias?.length))}>{saving ? 'Guardando respuesta…' : 'Guardar respuesta y resolver duda'}</button><button type="button" onClick={close} disabled={locked}>Cancelar</button>
    </fieldset></form>
  </AnalysisModal>;
}
