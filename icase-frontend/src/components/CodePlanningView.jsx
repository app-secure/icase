import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Check, ChevronRight, Code2, Download, FolderTree, Layers3,
  Loader2, LockKeyhole, RotateCcw, Save, Scale, Settings2, ShieldCheck, WandSparkles, X
} from 'lucide-react';
import {
  fetchCodePlanApi, fetchGeneratedArtifactsApi, generateBackendArtifactApi,
  downloadDeliveryArtifactApi, generateDeliveryArtifactApi, generateFrontendArtifactApi,
  generateInfrastructureArtifactApi, generatePipelineArtifactApi, generateTestArtifactApi, proposeCodePhaseApi,
  reviewBackendArtifactApi, reviewCodePhaseApi, reviewFrontendArtifactApi,
  reviewDeliveryArtifactApi, reviewInfrastructureArtifactApi, reviewPipelineArtifactApi,
  reviewTestArtifactApi, suggestCodePhaseApi, verifyGeneratedArtifactApi, updateGeneratedArtifactFileApi
} from '../services/api';
import GenerationReport from './GenerationReport';

const DECISION_PHASES = ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'];

const DEFAULTS = {
  alcance_plataforma: {
    plataformas: ['web'],
    alcance: 'Aplicación web funcional basada en los requisitos, diagramas y mockups aprobados.',
    exclusiones: 'Aplicaciones móviles nativas fuera del primer incremento.'
  },
  stack_tecnologico: {
    backend: 'Node.js + Express', frontend: 'React + Vite', base_datos: 'MongoDB',
    gestor_paquetes: 'npm', plataformas: ['web'], observaciones_tecnicas: ''
  },
  arquitectura_codigo: {
    estilo: 'Clean Architecture por módulos',
    capas: 'Dominio, casos de uso, adaptadores de interfaz e infraestructura',
    comunicacion: 'API REST con JSON',
    autenticacion: 'JWT y control de acceso basado en roles',
    decisiones_adicionales: ''
  },
  estructura_carpetas: {
    arbol: `backend/
  src/core/{entities,use-cases,services}
  src/interface-adapters/{controllers,repositories}
  src/infrastructure/{database,middlewares,services}
  src/routes
frontend/
  src/{components,pages,services,hooks,utils}
tests/{unit,integration,e2e}`,
    convenciones: 'Un módulo por capacidad funcional; nombres de archivos consistentes y sin código generado fuera de estas raíces.'
  },
  reglas_negocio: { reglas: [], notas: '' },
  control_acceso: { autenticacion: { metodo: 'jwt', expiracion: '8h' }, roles: [], permisos: [], operaciones: [], notas: '' }
};

const ICONS = {
  alcance_plataforma: Settings2,
  stack_tecnologico: Code2,
  arquitectura_codigo: Layers3,
  estructura_carpetas: FolderTree,
  reglas_negocio: Scale,
  control_acceso: ShieldCheck
};

const STATUS_STYLE = {
  aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  en_revision: 'border-blue-200 bg-blue-50 text-blue-700',
  rechazada: 'border-red-200 bg-red-50 text-red-700',
  desactualizada: 'border-amber-200 bg-amber-50 text-amber-700',
  pendiente: 'border-slate-200 bg-white text-slate-600',
  bloqueada: 'border-slate-200 bg-slate-50 text-slate-400'
};

export default function CodePlanningView({ projectId, projectName, onBackToDiagrams, onOpenDocument }) {
  const [plan, setPlan] = useState(null);
  const [selected, setSelected] = useState('alcance_plataforma');
  const [drafts, setDrafts] = useState(DEFAULTS);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [suggestionMeta, setSuggestionMeta] = useState(null);
  const [backendArtifact, setBackendArtifact] = useState(null);
  const [frontendArtifact, setFrontendArtifact] = useState(null);
  const [testArtifact, setTestArtifact] = useState(null);
  const [infrastructureArtifact, setInfrastructureArtifact] = useState(null);
  const [pipelineArtifact, setPipelineArtifact] = useState(null);
  const [deliveryArtifact, setDeliveryArtifact] = useState(null);
  const [busy, setBusy] = useState(Boolean(projectId));

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    fetchCodePlanApi(projectId)
      .then((data) => {
        if (cancelled) return;
        setPlan(data);
        const loaded = { ...DEFAULTS };
        for (const item of data.etapas || []) {
          if (item.propuesta && DECISION_PHASES.includes(item.etapa)) loaded[item.etapa] = item.propuesta;
        }
        setDrafts(loaded);
      })
      .catch((error) => !cancelled && setFeedback({ type: 'error', message: error.message }))
      .finally(() => !cancelled && setBusy(false));
    fetchGeneratedArtifactsApi(projectId, 'codigo_backend')
      .then((items) => !cancelled && setBackendArtifact(items[0] || null))
      .catch(() => undefined);
    fetchGeneratedArtifactsApi(projectId, 'codigo_frontend')
      .then((items) => !cancelled && setFrontendArtifact(items[0] || null))
      .catch(() => undefined);
    fetchGeneratedArtifactsApi(projectId, 'pruebas')
      .then((items) => !cancelled && setTestArtifact(items[0] || null))
      .catch(() => undefined);
    fetchGeneratedArtifactsApi(projectId, 'infraestructura')
      .then((items) => !cancelled && setInfrastructureArtifact(items[0] || null))
      .catch(() => undefined);
    fetchGeneratedArtifactsApi(projectId, 'pipeline_ci_cd')
      .then((items) => !cancelled && setPipelineArtifact(items[0] || null))
      .catch(() => undefined);
    fetchGeneratedArtifactsApi(projectId, 'paquete_entrega')
      .then((items) => !cancelled && setDeliveryArtifact(items[0] || null))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [projectId]);

  const current = useMemo(() => plan?.etapas?.find((item) => item.etapa === selected), [plan, selected]);
  const approvedCount = plan?.etapas?.filter((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'aprobada').length || 0;
  const testsEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_pruebas')?.habilitada;
  const infrastructureEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_infraestructura')?.habilitada;
  const pipelineEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_ci_cd')?.habilitada;
  const deliveryEnabled = plan?.etapas?.find((item) => item.etapa === 'paquete_entrega')?.habilitada;
  const visibleFeedback = feedback || (!projectId
    ? { type: 'error', message: 'El proyecto debe estar guardado antes de planificar la codificación.' }
    : null);

  const saveProposal = async () => {
    try {
      setBusy(true); setFeedback(null);
      const updated = await proposeCodePhaseApi(projectId, selected, drafts[selected], notes);
      setPlan(updated);
      setFeedback({ type: 'success', message: 'Propuesta guardada. Ahora debe aprobarse explícitamente.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateSuggestion = async () => {
    try {
      setBusy(true); setFeedback(null); setSuggestionMeta(null);
      const result = await suggestCodePhaseApi(projectId, selected);
      setDrafts((old) => ({ ...old, [selected]: result.propuesta }));
      setSuggestionMeta({ evidencias: result.evidencias || [], advertencias: result.advertencias || [] });
      setFeedback({ type: 'success', message: 'Propuesta preparada con artefactos aprobados. Revísala antes de guardarla.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const review = async (decision) => {
    const rejection = decision === 'rechazar' ? notes.trim() : notes;
    if (decision === 'rechazar' && !rejection) {
      setFeedback({ type: 'error', message: 'Indica el motivo del rechazo en observaciones.' });
      return;
    }
    try {
      setBusy(true); setFeedback(null);
      const updated = await reviewCodePhaseApi(projectId, selected, decision, rejection);
      setPlan(updated);
      setNotes('');
      const next = updated.etapas?.find((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'pendiente');
      if (decision === 'aprobar' && next) setSelected(next.etapa);
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Decisión aprobada.' : 'Propuesta rechazada para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateBackend = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generateBackendArtifactApi(projectId);
      setBackendArtifact(result.artefacto);
      setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'La entrada no cambió; se reutilizó la versión existente.' : 'Backend generado. Verifica su funcionalidad antes de aprobar.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewBackend = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) {
      setFeedback({ type: 'error', message: 'Indica en observaciones qué debe corregirse en el backend.' });
      return;
    }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewBackendArtifactApi(projectId, backendArtifact.id, decision, notes);
      setBackendArtifact(artifact);
      setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Backend aprobado.' : 'Backend rechazado; puedes generar una nueva versión tras ajustar las decisiones.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateFrontend = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generateFrontendArtifactApi(projectId);
      setFrontendArtifact(result.artefacto);
      setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'La entrada no cambió; se reutilizó el frontend existente.' : 'Frontend generado. Verifica sus interacciones antes de aprobar.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewFrontend = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) {
      setFeedback({ type: 'error', message: 'Indica en observaciones qué debe corregirse en el frontend.' }); return;
    }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewFrontendArtifactApi(projectId, frontendArtifact.id, decision, notes);
      setFrontendArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Frontend aprobado.' : 'Frontend rechazado para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateTests = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generateTestArtifactApi(projectId);
      setTestArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó la suite existente.' : 'Pruebas generadas y listas para revisión.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewTests = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { setFeedback({ type: 'error', message: 'Indica qué debe corregirse en las pruebas.' }); return; }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewTestArtifactApi(projectId, testArtifact.id, decision, notes);
      setTestArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Suite de pruebas aprobada.' : 'Suite rechazada para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateInfrastructure = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generateInfrastructureArtifactApi(projectId);
      setInfrastructureArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó la infraestructura existente.' : 'Infraestructura generada y lista para revisión.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewInfrastructure = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { setFeedback({ type: 'error', message: 'Indica qué debe corregirse en la infraestructura.' }); return; }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewInfrastructureArtifactApi(projectId, infrastructureArtifact.id, decision, notes);
      setInfrastructureArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Infraestructura aprobada.' : 'Infraestructura rechazada para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generatePipeline = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generatePipelineArtifactApi(projectId);
      setPipelineArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó el pipeline existente.' : 'Pipeline CI/CD generado y listo para revisión.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewPipeline = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { setFeedback({ type: 'error', message: 'Indica qué debe corregirse en el pipeline.' }); return; }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewPipelineArtifactApi(projectId, pipelineArtifact.id, decision, notes);
      setPipelineArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Pipeline CI/CD aprobado.' : 'Pipeline rechazado para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateDelivery = async () => {
    try {
      setBusy(true); setFeedback(null);
      const result = await generateDeliveryArtifactApi(projectId);
      setDeliveryArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: result.reutilizado ? 'Las versiones no cambiaron; se reutilizó el paquete existente.' : 'Paquete final consolidado y listo para revisión.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewDelivery = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { setFeedback({ type: 'error', message: 'Indica qué debe corregirse en el paquete final.' }); return; }
    try {
      setBusy(true); setFeedback(null);
      const artifact = await reviewDeliveryArtifactApi(projectId, deliveryArtifact.id, decision, notes);
      setDeliveryArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      setFeedback({ type: 'success', message: decision === 'aprobar' ? 'Entrega aprobada y proyecto finalizado. Ya puedes descargar el ZIP.' : 'Paquete rechazado para corrección.' });
    } catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const downloadDelivery = async () => {
    try { setBusy(true); setFeedback(null); await downloadDeliveryArtifactApi(projectId, deliveryArtifact.id); }
    catch (error) { setFeedback({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-600">Fase 3 · Planificación de la codificación</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">Decisiones técnicas de {projectName || 'proyecto'}</h1>
            <p className="mt-1 text-sm text-slate-500">Aprueba cada decisión antes de habilitar la generación del código.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onBackToDiagrams} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">← Diagramas y mockups</button>
            <button onClick={onOpenDocument} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700">Ver documento actual</button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${(approvedCount / DECISION_PHASES.length) * 100}%` }} /></div>
        <p className="mt-1 text-right text-[11px] text-slate-500">{approvedCount}/{DECISION_PHASES.length} decisiones aprobadas</p>
      </header>

      {visibleFeedback && <div className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${visibleFeedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><AlertCircle size={14} />{visibleFeedback.message}</div>}

      {busy && !plan ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />Cargando plan de codificación…</div> : (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-6">
          <aside className="w-72 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Compuertas de decisión</p>
            {(plan?.etapas || []).filter((item) => DECISION_PHASES.includes(item.etapa)).map((item) => {
              const Icon = ICONS[item.etapa] || Settings2;
              return <button key={item.etapa} onClick={() => { if (item.estado !== 'bloqueada') { setSelected(item.etapa); setSuggestionMeta(null); } }} className={`mb-2 w-full rounded-xl border p-3 text-left transition ${selected === item.etapa ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-200'} ${item.estado === 'bloqueada' ? 'cursor-not-allowed opacity-60' : 'hover:border-violet-200'}`}>
                <span className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold text-slate-800"><Icon size={15} />{item.titulo}</span>{item.estado === 'aprobada' ? <Check size={14} className="text-emerald-600" /> : item.estado === 'bloqueada' ? <LockKeyhole size={13} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}</span>
                <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[item.estado] || STATUS_STYLE.pendiente}`}>{item.estado?.replace('_', ' ')}</span>
              </button>;
            })}
            <p className="mb-2 mt-5 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Generación posterior</p>
            {(plan?.etapas || []).filter((item) => !DECISION_PHASES.includes(item.etapa)).map((item) => <div key={item.etapa} className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] text-slate-400"><LockKeyhole size={12} />{item.titulo}</div>)}
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
            {current && <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div><h2 className="text-lg font-semibold text-slate-900">{current.titulo}</h2><p className="mt-1 text-sm text-slate-500">{current.descripcion}</p></div>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLE[current.estado]}`}>{current.estado?.replace('_', ' ')}</span>
              </div>
              <div className="mb-4 flex justify-end">
                <button disabled={busy || current.estado === 'bloqueada'} onClick={generateSuggestion} className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"><WandSparkles size={15} />Generar propuesta desde el proyecto</button>
              </div>
              <PhaseForm phase={selected} value={drafts[selected] || {}} disabled={busy || current.estado === 'bloqueada'} onChange={(value) => setDrafts((old) => ({ ...old, [selected]: value }))} />
              {suggestionMeta && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Base de la sugerencia: {suggestionMeta.evidencias.length} artefactos aprobados</p>
                {suggestionMeta.advertencias.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-700">{suggestionMeta.advertencias.map((item) => <li key={item}>{item}</li>)}</ul>}
                <details className="mt-2"><summary className="cursor-pointer font-medium text-violet-700">Ver evidencias utilizadas</summary><ul className="mt-2 list-disc space-y-1 pl-4">{suggestionMeta.evidencias.map((item, index) => <li key={`${item.tipo}-${item.identificador}-${index}`}>{item.identificador}{item.nombre ? ` · ${item.nombre}` : ''}{item.version ? ` · v${item.version}` : ''}</li>)}</ul></details>
              </div>}
              <label className="mt-5 block"><span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones de revisión</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-violet-500" placeholder="Motivo, restricciones o cambios solicitados…" /></label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {current.estado === 'en_revision' && <button disabled={busy} onClick={() => review('rechazar')} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"><RotateCcw size={14} />Solicitar cambios</button>}
                <button disabled={busy || current.estado === 'bloqueada'} onClick={saveProposal} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"><Save size={14} />{current.estado === 'aprobada' ? 'Guardar nueva versión' : 'Guardar propuesta'}</button>
                {current.estado === 'en_revision' && <button disabled={busy} onClick={() => review('aprobar')} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={14} />Aprobar decisión</button>}
              </div>
              {approvedCount === DECISION_PHASES.length && <section className="mt-8 border-t border-slate-200 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-slate-900">Generación del backend</h3><p className="mt-1 text-xs text-slate-500">Código propuesto desde las decisiones y RF aprobados. La verificación detecta módulos pendientes antes de aprobar.</p></div>
                  <button disabled={busy} onClick={generateBackend} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Code2 size={15} />{backendArtifact ? 'Regenerar backend' : 'Generar backend'}</button>
                </div>
                {!backendArtifact && <GenerationReport projectId={projectId} artifact={null} />}
                {backendArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {backendArtifact.version} · {backendArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${backendArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{backendArtifact.estado}</span></div>
                  {backendArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{backendArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <GenerationReport projectId={projectId} artifact={backendArtifact} />
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(backendArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={backendArtifact.id} projectId={projectId} artifact={backendArtifact} onArtifactChange={setBackendArtifact} />
                  {backendArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewBackend('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewBackend('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar backend</button></div>}
                </div>}
                <div className="mt-7 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6">
                  <div><h3 className="font-semibold text-slate-900">Generación del frontend</h3><p className="mt-1 text-xs text-slate-500">Aplicación React/Vite con rutas y vistas derivadas del árbol y mockups aprobados.</p></div>
                  <button disabled={busy} onClick={generateFrontend} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Code2 size={15} />{frontendArtifact ? 'Regenerar frontend' : 'Generar frontend'}</button>
                </div>
                {frontendArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {frontendArtifact.version} · {frontendArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${frontendArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{frontendArtifact.estado}</span></div>
                  {frontendArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{frontendArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(frontendArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={frontendArtifact.id} projectId={projectId} artifact={frontendArtifact} onArtifactChange={setFrontendArtifact} />
                  {frontendArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewFrontend('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewFrontend('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar frontend</button></div>}
                </div>}
                <div className="mt-7 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6">
                  <div><h3 className="font-semibold text-slate-900">Generación de pruebas</h3><p className="mt-1 text-xs text-slate-500">Pruebas de trazabilidad, integración del API y navegación E2E vinculadas a versiones aprobadas.</p>{!testsEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba backend y frontend.</p>}</div>
                  <button disabled={busy || !testsEnabled} onClick={generateTests} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Code2 size={15} />{testArtifact ? 'Regenerar pruebas' : 'Generar pruebas'}</button>
                </div>
                {testArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {testArtifact.version} · {testArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${testArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{testArtifact.estado}</span></div>
                  {testArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{testArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(testArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={testArtifact.id} projectId={projectId} artifact={testArtifact} onArtifactChange={setTestArtifact} />
                  {testArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewTests('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewTests('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar pruebas</button></div>}
                </div>}
                <div className="mt-7 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6">
                  <div><h3 className="font-semibold text-slate-900">Infraestructura y puesta en marcha</h3><p className="mt-1 text-xs text-slate-500">Docker, Compose, proxy, persistencia y despliegue derivados de arquitectura y RNF aprobados.</p>{!infrastructureEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba backend y frontend.</p>}</div>
                  <button disabled={busy || !infrastructureEnabled} onClick={generateInfrastructure} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Settings2 size={15} />{infrastructureArtifact ? 'Regenerar infraestructura' : 'Generar infraestructura'}</button>
                </div>
                {infrastructureArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {infrastructureArtifact.version} · {infrastructureArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${infrastructureArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{infrastructureArtifact.estado}</span></div>
                  {infrastructureArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{infrastructureArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(infrastructureArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={infrastructureArtifact.id} projectId={projectId} artifact={infrastructureArtifact} onArtifactChange={setInfrastructureArtifact} />
                  {infrastructureArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewInfrastructure('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewInfrastructure('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar infraestructura</button></div>}
                </div>}
                <div className="mt-7 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6">
                  <div><h3 className="font-semibold text-slate-900">Pipeline CI/CD</h3><p className="mt-1 text-xs text-slate-500">Validación, compilación, pruebas, contenedores y paquete de entrega mediante GitHub Actions.</p>{!pipelineEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba pruebas e infraestructura.</p>}</div>
                  <button disabled={busy || !pipelineEnabled} onClick={generatePipeline} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Settings2 size={15} />{pipelineArtifact ? 'Regenerar pipeline' : 'Generar pipeline'}</button>
                </div>
                {pipelineArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {pipelineArtifact.version} · {pipelineArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${pipelineArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{pipelineArtifact.estado}</span></div>
                  {pipelineArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{pipelineArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(pipelineArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={pipelineArtifact.id} projectId={projectId} artifact={pipelineArtifact} onArtifactChange={setPipelineArtifact} />
                  {pipelineArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewPipeline('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewPipeline('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar pipeline</button></div>}
                </div>}
                <div className="mt-7 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6">
                  <div><h3 className="font-semibold text-slate-900">Paquete final de entrega</h3><p className="mt-1 text-xs text-slate-500">Consolida código, pruebas, infraestructura, CI/CD, manifiesto de versiones y huellas.</p>{!deliveryEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba el pipeline CI/CD.</p>}</div>
                  <button disabled={busy || !deliveryEnabled} onClick={generateDelivery} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><FolderTree size={15} />{deliveryArtifact ? 'Regenerar paquete' : 'Generar paquete final'}</button>
                </div>
                {deliveryArtifact && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Entrega v{deliveryArtifact.version} · {deliveryArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${deliveryArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{deliveryArtifact.estado}</span></div>
                  <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(deliveryArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                  <ArtifactVerification key={deliveryArtifact.id} projectId={projectId} artifact={deliveryArtifact} onArtifactChange={setDeliveryArtifact} />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {deliveryArtifact.estado === 'en_revision' && <><button disabled={busy} onClick={() => reviewDelivery('rechazar')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewDelivery('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar entrega</button></>}
                    {deliveryArtifact.aprobado && <button disabled={busy} onClick={downloadDelivery} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white"><Download size={14} />Descargar ZIP</button>}
                  </div>
                </div>}
              </section>}
            </>}
          </main>
        </div>
      )}
    </div>
  );
}

function ArtifactVerification({ projectId, artifact, onArtifactChange }) {
  const [result, setResult] = useState(artifact.verificacion || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [source, setSource] = useState('');
  const verify = async () => {
    setLoading(true); setError('');
    try { setResult(await verifyGeneratedArtifactApi(projectId, artifact.id)); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  const saveFile = async () => {
    setLoading(true); setError('');
    try {
      const updated = await updateGeneratedArtifactFileApi(projectId, artifact.id, selectedFile, source);
      onArtifactChange(updated);
      setResult(null);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  return <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-slate-700">Verificación individual: {result?.estado || 'pendiente'}</span>
      <button type="button" disabled={loading} onClick={verify} className="rounded-lg border border-violet-200 px-3 py-1.5 font-semibold text-violet-700 disabled:opacity-50">{loading ? 'Verificando…' : 'Verificar artefacto'}</button>
    </div>
    {error && <p className="mt-2 text-red-700">{error}</p>}
    {result && <><p className="mt-2 text-slate-500">{result.nota}</p>
      {result.pruebas?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-emerald-700">{result.pruebas.map((check) => <li key={check.paso}>{check.paso}: {check.resultado}</li>)}</ul>}
      {result.errores?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-red-700">{result.errores.map((item) => <li key={item}>{item}</li>)}</ul>}
      {result.advertencias?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-700">{result.advertencias.map((item) => <li key={item}>{item}</li>)}</ul>}
    </>}
    {artifact.estado === 'en_revision' && <details className="mt-3 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer font-semibold text-violet-700">Revisar y corregir un archivo</summary>
      <select aria-label="Archivo a corregir" value={selectedFile} onChange={(event) => {
        const path = event.target.value;
        setSelectedFile(path);
        setSource(artifact.archivos?.find((file) => file.ruta === path)?.contenido || '');
      }} className="mt-2 w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs">
        <option value="">Selecciona un archivo</option>
        {(artifact.archivos || []).map((file) => <option key={file.ruta} value={file.ruta}>{file.ruta}</option>)}
      </select>
      {selectedFile && <><textarea aria-label="Contenido del archivo" value={source} onChange={(event) => setSource(event.target.value)} rows={14} spellCheck={false} className="mt-2 w-full rounded border border-slate-300 p-2 font-mono text-xs" />
        <button type="button" disabled={loading} onClick={saveFile} className="mt-2 rounded bg-violet-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Guardar archivo y volver a verificar</button></>}
    </details>}
  </div>;
}

// Lo que el generador sabe producir (debe coincidir con StackCatalog del backend, que lo valida de todos modos).
const STACK_OPTIONS = {
  backend: ['Node.js + Express', 'Node.js + NestJS', 'Java + Spring Boot'],
  base_datos: ['PostgreSQL', 'MySQL', 'MongoDB'],
  frontend: ['React + Vite']
};

function stackProblem(value) {
  const backend = String(value.backend || '');
  const database = String(value.base_datos || '');
  if (/spring|\bjava\b/i.test(backend) && /mongo/i.test(database)) return 'Java + Spring Boot solo se genera con PostgreSQL o MySQL.';
  return '';
}

const RULE_DECISIONS = [
  { value: 'confirmado', label: 'Confirmar', style: 'border-emerald-300 bg-emerald-50 text-emerald-700', icon: Check },
  { value: 'rechazado', label: 'Rechazar', style: 'border-red-300 bg-red-50 text-red-700', icon: X },
  { value: 'pendiente', label: 'Pendiente', style: 'border-slate-300 bg-white text-slate-600', icon: null }
];

function describeRule(rule) {
  const limits = (min, max, unit) => (min !== undefined && max !== undefined ? `entre ${min} y ${max}${unit}` : min !== undefined ? `al menos ${min}${unit}` : `como máximo ${max}${unit}`);
  switch (rule.tipo) {
    case 'requerido': return `«${rule.campo}» es obligatorio`;
    case 'unico': return `${(rule.campos || [rule.campo]).map((item) => `«${item}»`).join(' + ')} no se repite entre registros`;
    case 'rango': return `«${rule.campo}» ${limits(rule.min, rule.max, '')}`;
    case 'longitud': return `«${rule.campo}» ${limits(rule.min, rule.max, ' caracteres')}`;
    case 'formato': return `«${rule.campo}» debe ser un ${rule.formato === 'email' ? 'correo electrónico' : 'URL'} válido`;
    case 'comparacion': return `«${rule.campo}» ${rule.operador} ${rule.con_campo !== undefined ? `«${rule.con_campo}»` : JSON.stringify(rule.con_valor)}`;
    case 'maquina_estados': return `«${rule.campo}» empieza en ${rule.inicial}. Transiciones: ${(rule.transiciones || []).map((item) => `${item.de} → ${item.a}`).join(', ')}`;
    case 'inmutable': return `«${rule.campo}» no puede cambiar una vez creado`;
    case 'valor_por_defecto': return `«${rule.campo}» vale ${JSON.stringify(rule.valor)} si no se envía`;
    default: return rule.tipo;
  }
}

function RulesEditor({ value, onChange, disabled }) {
  const rules = Array.isArray(value.reglas) ? value.reglas : [];
  const count = (decision) => rules.filter((item) => item.estado_decision === decision).length;
  const patch = (id, changes) => onChange({ ...value, reglas: rules.map((item) => (item.id === id ? { ...item, ...changes } : item)) });
  if (!rules.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      No hay reglas propuestas. Usa «Generar propuesta desde el proyecto» o aprueba la etapa vacía si el sistema no necesita reglas específicas.
    </div>;
  }
  return <div className="space-y-3">
    {value.notas && <p className="text-xs text-slate-500">{value.notas}</p>}
    <div className="flex flex-wrap gap-2 text-xs" aria-live="polite">
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">{count('confirmado')} confirmadas</span>
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{count('pendiente')} pendientes</span>
      <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">{count('rechazado')} rechazadas</span>
    </div>
    {rules.map((rule) => <article key={rule.id} className={`rounded-xl border p-4 ${rule.estado_decision === 'rechazado' ? 'border-red-100 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono font-semibold text-slate-700">{rule.id}</span>
            <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">{rule.tipo.replace('_', ' ')}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{rule.entidad}</span>
            <span className={`rounded px-1.5 py-0.5 ${rule.origen === 'explicito' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rule.origen === 'explicito' ? 'explícita en el RF' : 'inferida'}</span>
            {(rule.rf || []).map((id) => <span key={id} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-500">{id}</span>)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">{describeRule(rule)}</p>
          <label className="mt-2 block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Mensaje que verá el usuario</span>
            <input disabled={disabled} value={rule.mensaje || ''} maxLength={240} onChange={(event) => patch(rule.id, { mensaje: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
          </label>
          {rule.evidencia && <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-600">«{rule.evidencia}»{rule.evidencia_literal ? '' : ' (no consta literalmente en el RF)'}</blockquote>}
          {rule.justificacion && <p className="mt-1 text-xs text-slate-500">Por qué se propone: {rule.justificacion}</p>}
        </div>
        <div className="flex gap-1" role="group" aria-label={`Decisión sobre ${rule.id}`}>
          {RULE_DECISIONS.map(({ value: decision, label, style, icon: Icon }) => <button key={decision} type="button" disabled={disabled} aria-pressed={rule.estado_decision === decision}
            onClick={() => patch(rule.id, { estado_decision: decision })}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${rule.estado_decision === decision ? style : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'}`}>
            {Icon && <Icon size={12} />}{label}
          </button>)}
        </div>
      </div>
    </article>)}
  </div>;
}

const ACCESS_METHODS = [
  { method: 'GET', label: 'Ver' },
  { method: 'POST', label: 'Crear' },
  { method: 'PATCH', label: 'Editar' },
  { method: 'DELETE', label: 'Eliminar' }
];

function AccessEditor({ value, onChange, disabled }) {
  const auth = value.autenticacion || { metodo: 'jwt', expiracion: '8h' };
  const roles = Array.isArray(value.roles) ? value.roles : [];
  const permisos = Array.isArray(value.permisos) ? value.permisos : [];
  const operaciones = Array.isArray(value.operaciones) ? value.operaciones : [];
  const active = roles.filter((role) => role.incluir !== false);
  const [newRole, setNewRole] = useState('');
  const setAuth = (changes) => onChange({ ...value, autenticacion: { ...auth, ...changes } });
  const setRole = (id, changes) => onChange({ ...value, roles: roles.map((role) => (role.id === id ? { ...role, ...changes } : role)) });
  const has = (operation, role, method) => permisos.some((item) => item.operacion === operation && item.rol === role && item.metodos.includes(method));
  const toggle = (operation, role, method) => {
    const current = permisos.find((item) => item.operacion === operation && item.rol === role);
    const methods = current ? (current.metodos.includes(method) ? current.metodos.filter((item) => item !== method) : [...current.metodos, method]) : [method];
    const others = permisos.filter((item) => item !== current);
    onChange({ ...value, permisos: methods.length ? [...others, { operacion: operation, rol: role, metodos: methods }] : others });
  };
  const addRole = () => {
    const name = newRole.trim();
    if (!name) return;
    onChange({ ...value, roles: [...roles, { id: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), nombre: name, incluir: true, autoregistro: false }] });
    setNewRole('');
  };
  const open = active.filter((role) => role.autoregistro);

  return <div className="space-y-5">
    {value.notas && <p className="text-xs text-slate-500">{value.notas}</p>}
    <section className="grid gap-4 md:grid-cols-2">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">Autenticación</span>
        <select disabled={disabled} value={auth.metodo} onChange={(event) => setAuth({ metodo: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50">
          <option value="jwt">Inicio de sesión con correo y contraseña (JWT)</option>
          <option value="ninguna">Ninguna: la API será pública</option>
        </select></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">Duración de la sesión</span>
        <select disabled={disabled || auth.metodo === 'ninguna'} value={auth.expiracion} onChange={(event) => setAuth({ expiracion: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50">
          {['1h', '8h', '24h', '7d'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
    </section>
    {auth.metodo === 'ninguna' && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Sin autenticación, cualquier persona con acceso a la red podrá leer, crear, modificar y eliminar datos.</p>}
    {auth.metodo === 'jwt' && <>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Roles</h3>
        <p className="mb-3 text-xs text-slate-500">El rol <strong>administrador</strong> siempre existe: gestiona usuarios y puede operar todo. Sus credenciales iniciales se definen con ADMIN_EMAIL y ADMIN_PASSWORD al desplegar.</p>
        <div className="space-y-2">
          {roles.map((role) => <div key={role.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <span className="min-w-[8rem] font-medium text-slate-800">{role.nombre}</span>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" disabled={disabled} checked={role.incluir !== false} onChange={(event) => setRole(role.id, { incluir: event.target.checked, ...(event.target.checked ? {} : { autoregistro: false }) })} />Incluir</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" disabled={disabled || role.incluir === false} checked={role.autoregistro === true} onChange={(event) => setRole(role.id, { autoregistro: event.target.checked })} />Permitir crear cuenta sin administrador</label>
          </div>)}
          {!roles.length && <p className="text-xs text-slate-500">Ningún RF declara actores: solo el administrador podrá operar el sistema, a menos que agregues roles.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <input disabled={disabled} value={newRole} onChange={(event) => setNewRole(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRole(); } }} placeholder="Nuevo rol" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
          <button type="button" disabled={disabled || !newRole.trim()} onClick={addRole} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50">Agregar rol</button>
        </div>
        {open.length > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Cualquier persona podrá crear una cuenta con los roles: {open.map((role) => role.nombre).join(', ')}. Revisa sus permisos de escritura.</p>}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Qué puede hacer cada rol</h3>
        {!active.length ? <p className="text-xs text-slate-500">No hay roles incluidos.</p> : <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="p-2">Operación</th>{active.map((role) => <th scope="col" key={role.id} className="p-2">{role.nombre}</th>)}</tr></thead>
            <tbody>{operaciones.map((operation) => <tr key={operation.id} className="border-t border-slate-100 align-top">
              <td className="p-2"><span className="font-mono font-semibold">{operation.id}</span><br />{operation.nombre}</td>
              {active.map((role) => <td key={role.id} className="p-2"><div className="flex flex-wrap gap-1" role="group" aria-label={`${operation.id} para ${role.nombre}`}>
                {ACCESS_METHODS.map(({ method, label }) => <button key={method} type="button" disabled={disabled} aria-pressed={has(operation.id, role.id, method)} onClick={() => toggle(operation.id, role.id, method)}
                  className={`rounded border px-1.5 py-0.5 ${has(operation.id, role.id, method) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>{label}</button>)}
              </div></td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
  </div>;
}

function PhaseForm({ phase, value, onChange, disabled }) {
  if (phase === 'control_acceso') return <AccessEditor value={value} onChange={onChange} disabled={disabled} />;
  if (phase === 'reglas_negocio') return <RulesEditor value={value} onChange={onChange} disabled={disabled} />;
  const field = (key, label, multiline = false) => {
    const displayValue = Array.isArray(value[key]) ? value[key].join(', ') : (value[key] || '');
    const update = (raw) => onChange({
      ...value,
      [key]: Array.isArray(value[key]) ? raw.split(',').map((item) => item.trim()).filter(Boolean) : raw
    });
    return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>{multiline ? <textarea disabled={disabled} rows={key === 'arbol' ? 12 : 4} value={displayValue} onChange={(e) => update(e.target.value)} className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm disabled:bg-slate-50" /> : <input disabled={disabled} value={displayValue} onChange={(e) => update(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50" />}</label>;
  };
  if (phase === 'alcance_plataforma') return <div className="space-y-4">{field('alcance', 'Alcance del incremento', true)}{field('exclusiones', 'Exclusiones explícitas', true)}{field('plataformas', 'Plataformas (separadas por coma)')}{field('capacidades_principales', 'Requisitos funcionales incluidos', true)}{field('restricciones_no_funcionales', 'Restricciones no funcionales', true)}</div>;
  const choice = (key, label) => {
    const current = String(value[key] || '');
    const known = STACK_OPTIONS[key].includes(current);
    return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      <select disabled={disabled} value={current} onChange={(event) => onChange({ ...value, [key]: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50">
        {current && !known && <option value={current}>{current} (no soportado)</option>}
        {STACK_OPTIONS[key].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      {current && !known && <span role="alert" className="mt-1 block text-xs text-red-600">«{current}» todavía no está soportado: elige una de las opciones.</span>}
    </label>;
  };
  if (phase === 'stack_tecnologico') return <div className="grid gap-4 md:grid-cols-2">{choice('backend', 'Backend')}{choice('frontend', 'Frontend')}{choice('base_datos', 'Base de datos')}{stackProblem(value) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 md:col-span-2">{stackProblem(value)}</p>}{field('gestor_paquetes', 'Gestor de paquetes')}{field('tiempo_real', 'Comunicación en tiempo real')}{field('estilos', 'Sistema de estilos')}<div className="md:col-span-2">{field('observaciones_tecnicas', 'Restricciones y versiones', true)}</div></div>;
  if (phase === 'arquitectura_codigo') return <div className="space-y-4">{field('estilo', 'Estilo arquitectónico')}{field('capas', 'Capas')}{field('modulos', 'Módulos funcionales', true)}{field('comunicacion', 'Comunicación entre componentes')}{field('autenticacion', 'Autenticación y autorización')}{field('decisiones_adicionales', 'Decisiones adicionales', true)}</div>;
  return <div className="space-y-4">{field('arbol', 'Árbol de carpetas propuesto', true)}{field('convenciones', 'Convenciones', true)}</div>;
}
