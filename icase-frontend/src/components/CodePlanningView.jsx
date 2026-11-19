import StepSidebar from './StepSidebar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Code2, Download, FolderTree, Layers3,
  Loader2, LockKeyhole, Puzzle, RotateCcw, Save, Scale, Settings2, ShieldCheck, WandSparkles, X
} from 'lucide-react';
import {
  controlLocalRunApi, fetchCodePlanApi, fetchGeneratedArtifactsApi, generateBackendArtifactApi,
  downloadCodeArtifactApi, downloadDeliveryArtifactApi, generateDeliveryArtifactApi, generateFrontendArtifactApi,
  generateInfrastructureArtifactApi, generatePipelineArtifactApi, generateTestArtifactApi, proposeCodePhaseApi,
  reviewBackendArtifactApi, reviewCodePhaseApi, reviewFrontendArtifactApi,
  reviewDeliveryArtifactApi, reviewInfrastructureArtifactApi, reviewPipelineArtifactApi,
  reviewTestArtifactApi, suggestCodePhaseApi, verifyGeneratedArtifactApi, updateGeneratedArtifactFileApi,
  executeOneClickModeApi, startArtifactVerificationJobApi, fetchArtifactVerificationJobApi, fetchLatestArtifactVerificationJobApi
} from '../services/api';
import GenerationReport from './GenerationReport';
import SpecReviewPanel from './SpecReviewPanel';
import FunctionalGatePanel from './FunctionalGatePanel';
import GenerationPreviewPanel from './GenerationPreviewPanel';
import LocalRunPanel from './LocalRunPanel';
import FolderExplorer from './FolderExplorer';
import CodeSummary from './CodeSummary';
import GeneratedSummary from './GeneratedSummary';
import { ToastContainer, useToasts } from './Toast';

const DECISION_PHASES = ['alcance_plataforma', 'stack_tecnologico', 'estructura_carpetas', 'reglas_negocio', 'control_acceso', 'modulos'];

function mockupFormWaiver(verification) {
  const text = (verification?.errores || []).join('\n');
  const passed = (pattern) => (verification?.pruebas || []).some((item) => pattern.test(item.paso) && item.resultado === 'correcto');
  const specs = text.match(/[\w.-]+\.spec\.[jt]s/gi) || [];
  return verification?.estado === 'fallida'
    && specs.length > 0 && specs.every(spec => spec === 'designed-ui.spec.js')
    && passed(/Compilación/) && passed(/health checks/) && passed(/CRUD/);
}
// El comportamiento de la aplicación es opcional: se edita y se aprueba, pero no cuenta para el avance obligatorio.
const SPEC_PHASE = 'especificacion_aplicacion';
const EDITABLE_PHASES = [...DECISION_PHASES, SPEC_PHASE];

const DEFAULTS = {};

const STATUS_STYLE = {
  aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  en_revision: 'border-blue-200 bg-blue-50 text-blue-700',
  rechazada: 'border-red-200 bg-red-50 text-red-700',
  desactualizada: 'border-amber-200 bg-amber-50 text-amber-700',
  pendiente: 'border-slate-200 bg-white text-slate-600',
  bloqueada: 'border-slate-200 bg-slate-50 text-slate-400'
};

export default function CodePlanningView({ projectId, projectName, onBackToDiagrams, onOpenDocument }) {
  const [stepsCollapsed, setStepsCollapsed] = useState(false);
  const [plan, setPlan] = useState(null);
  const [selected, setSelected] = useState('alcance_plataforma');
  const [drafts, setDrafts] = useState(DEFAULTS);
  const [notes, setNotes] = useState('');
  const [permissive, setPermissive] = useState(false);
  const { toasts, addToast, removeToast } = useToasts();
  const [suggestionMeta, setSuggestionMeta] = useState(null);
  const [backendArtifact, setBackendArtifact] = useState(null);
  const [frontendArtifact, setFrontendArtifact] = useState(null);
  const [testArtifact, setTestArtifact] = useState(null);
  const [infrastructureArtifact, setInfrastructureArtifact] = useState(null);
  const [pipelineArtifact, setPipelineArtifact] = useState(null);
  const [deliveryArtifact, setDeliveryArtifact] = useState(null);
  const [busy, setBusy] = useState(Boolean(projectId));
  // Al aprobar la entrega, levantar el proyecto en Docker sin un paso más (se puede desactivar).
  const [autoRun, setAutoRun] = useState(() => { try { return localStorage.getItem('icase:ejecutar-al-aprobar') !== 'no'; } catch { return true; } });
  const changeAutoRun = (value) => { setAutoRun(value); try { localStorage.setItem('icase:ejecutar-al-aprobar', value ? 'si' : 'no'); } catch { /* sin almacenamiento */ } };

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    fetchCodePlanApi(projectId)
      .then((data) => {
        if (cancelled) return;
        setPlan(data);
        const loaded = { ...DEFAULTS };
        for (const item of data.etapas || []) {
          if (item.propuesta && EDITABLE_PHASES.includes(item.etapa)) loaded[item.etapa] = item.propuesta;
        }
        setDrafts(loaded);
      })
      .catch((error) => !cancelled && addToast({ type: 'error', message: error.message }))
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
  const [loadingDraft, setLoadingDraft] = useState(false);
  useEffect(() => {
    setLoadingDraft(false);
    if (!current || !EDITABLE_PHASES.includes(selected) || current.estado === 'bloqueada') return;
    if (current.propuesta && (current.estado !== 'desactualizada' || !['estructura_carpetas', 'stack_tecnologico'].includes(selected))) return;
    let active = true;
    setLoadingDraft(true);
    suggestCodePhaseApi(projectId, selected, true).then(result => {
      if (active) {
        setDrafts(old => ({ ...old, [selected]: result.propuesta }));
        setSuggestionMeta(result);
      }
    }).catch(error => active && addToast({ type: 'error', message: error.message }))
      .finally(() => active && setLoadingDraft(false));
    return () => { active = false; };
  }, [projectId, selected, current]);

  const plataformas = plan?.etapas?.find(item => item.etapa === 'stack_tecnologico')?.propuesta?.plataformas || ['web'];
  const approvedCount = plan?.etapas?.filter((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'aprobada').length || 0;
  const testsEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_pruebas')?.habilitada;
  const infrastructureEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_infraestructura')?.habilitada;
  const pipelineEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_ci_cd')?.habilitada;
  const deliveryEnabled = plan?.etapas?.find((item) => item.etapa === 'paquete_entrega')?.habilitada;
  const [showOneClickReport, setShowOneClickReport] = useState(true);

  const handleOneClickMode = async () => {
    if (!window.confirm('¿Deseas ejecutar el Modo de un clic?\n\nRecorrerá todas las etapas de planificación aplicando valores seguros:\n• Autenticación JWT con roles derivados de los RF\n• Registro cerrado (sin autoregistro de usuarios)\n• Solo reglas explícitas con evidencia literal confirmadas\n• Módulos sugeridos por el análisis\n\nAl terminar tendrás un informe detallado con los aspectos dudosos o descartados.')) {
      return;
    }
    try {
      setBusy(true);
      const result = await executeOneClickModeApi(projectId);
      setPlan(await fetchCodePlanApi(projectId));
      const loaded = { ...drafts };
      for (const item of result.plan.etapas || []) {
        if (item.propuesta && EDITABLE_PHASES.includes(item.etapa)) {
          loaded[item.etapa] = item.propuesta;
        }
      }
      setDrafts(loaded);
      setShowOneClickReport(true);
      addToast({
        type: 'success',
        message: '¡Modo de un clic completado! Todas las etapas han sido configuradas y aprobadas con valores seguros.'
      });
    } catch (error) {
      addToast({ type: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const saveProposal = async () => {
    try {
      setBusy(true);
      const updated = await proposeCodePhaseApi(projectId, selected, drafts[selected], notes);
      setDrafts(old => ({ ...old, [selected]: updated.etapas.find(e => e.etapa === selected)?.propuesta }));
      setPlan((previous) => ({ ...updated, modulos: { ...updated.modulos, requisitos: previous?.modulos?.requisitos || [] } }));
      const artefactos = await fetchGeneratedArtifactsApi(projectId);
      for (const [tipo, actualizar] of Object.entries({ codigo_backend: setBackendArtifact, codigo_frontend: setFrontendArtifact,
        pruebas: setTestArtifact, infraestructura: setInfrastructureArtifact, pipeline_ci_cd: setPipelineArtifact, paquete_entrega: setDeliveryArtifact })) {
        actualizar(artefactos.find(item => item.tipo === tipo) || null);
      }
      addToast({ type: 'success', message: 'Propuesta guardada. Ahora debe aprobarse explícitamente.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateSuggestion = async () => {
    try {
      setBusy(true); setSuggestionMeta(null);
      const result = await suggestCodePhaseApi(projectId, selected);
      setDrafts(old => {
        if (selected !== 'reglas_negocio') return { ...old, [selected]: result.propuesta };
        const anteriores = old[selected]?.reglas || [];
        const nuevas = result.propuesta.reglas.filter(r => !anteriores.some(v => v.entidad === r.entidad && v.tipo === r.tipo && v.campo === r.campo && v.mensaje === r.mensaje));
        const ids = new Set(anteriores.map(r => r.id));
        const adicionales = nuevas.map(r => {
          let id = r.id;
          while (ids.has(id)) id += 'a';
          ids.add(id);
          return { ...r, id };
        });
        return { ...old, [selected]: { ...result.propuesta, reglas: [...anteriores, ...adicionales] } };
      });
      setSuggestionMeta({ evidencias: result.evidencias || [], advertencias: result.advertencias || [] });
      addToast({ type: 'success', message: 'Propuesta preparada con artefactos aprobados. Revísala antes de guardarla.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const review = async (decision) => {
    const rejection = decision === 'rechazar' ? notes.trim() : notes;
    if (decision === 'rechazar' && !rejection) {
      addToast({ type: 'error', message: 'Indica el motivo del rechazo en observaciones.' });
      return;
    }
    try {
      setBusy(true);
      const updated = await reviewCodePhaseApi(projectId, selected, decision, rejection);
      setPlan((previous) => ({ ...updated, modulos: { ...updated.modulos, requisitos: previous?.modulos?.requisitos || [] } }));
      setNotes('');
      const next = updated.etapas?.find((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'pendiente');
      const allDecisionsApproved = (updated.etapas || []).filter((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'aprobada').length === DECISION_PHASES.length;
      if (decision === 'aprobar') {
        if (next) setSelected(next.etapa);
        else if (allDecisionsApproved) setSelected('generacion_entrega');
      }
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Decisión aprobada.' : 'Propuesta rechazada para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateBackend = async () => {
    try {
      setBusy(true);
      const result = await generateBackendArtifactApi(projectId);
      setBackendArtifact(result.artefacto);
      setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'La entrada no cambió; se reutilizó la versión existente.' : 'Backend generado. Verifica su funcionalidad antes de aprobar.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewBackend = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) {
      addToast({ type: 'error', message: 'Indica en observaciones qué debe corregirse en el backend.' });
      return;
    }
    try {
      setBusy(true);
      const artifact = await reviewBackendArtifactApi(projectId, backendArtifact.id, decision, notes);
      setBackendArtifact(artifact);
      setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Backend aprobado.' : 'Backend rechazado; puedes generar una nueva versión tras ajustar las decisiones.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateFrontend = async (plataforma) => {
    try {
      setBusy(true);
      const result = await generateFrontendArtifactApi(projectId, plataforma);
      setFrontendArtifact(result.artefacto);
      setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'La entrada no cambió; se reutilizó el frontend existente.' : 'Frontend generado. Verifica sus interacciones antes de aprobar.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewFrontend = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) {
      addToast({ type: 'error', message: 'Indica en observaciones qué debe corregirse en el frontend.' }); return;
    }
    try {
      setBusy(true);
      const artifact = await reviewFrontendArtifactApi(projectId, frontendArtifact.id, decision, notes);
      setFrontendArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Frontend aprobado.' : 'Frontend rechazado para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateTests = async () => {
    try {
      setBusy(true);
      const result = await generateTestArtifactApi(projectId);
      setTestArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó la suite existente.' : 'Pruebas generadas y listas para revisión.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewTests = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { addToast({ type: 'error', message: 'Indica qué debe corregirse en las pruebas.' }); return; }
    try {
      setBusy(true);
      const artifact = await reviewTestArtifactApi(projectId, testArtifact.id, decision, notes, { modo_permisivo: decision === 'aprobar' && permissive });
      setTestArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Suite de pruebas aprobada.' : 'Suite rechazada para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateInfrastructure = async () => {
    try {
      setBusy(true);
      const result = await generateInfrastructureArtifactApi(projectId);
      setInfrastructureArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó la infraestructura existente.' : 'Infraestructura generada y lista para revisión.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewInfrastructure = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { addToast({ type: 'error', message: 'Indica qué debe corregirse en la infraestructura.' }); return; }
    try {
      setBusy(true);
      const artifact = await reviewInfrastructureArtifactApi(projectId, infrastructureArtifact.id, decision, notes);
      setInfrastructureArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Infraestructura aprobada.' : 'Infraestructura rechazada para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generatePipeline = async () => {
    try {
      setBusy(true);
      const result = await generatePipelineArtifactApi(projectId);
      setPipelineArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'Las entradas no cambiaron; se reutilizó el pipeline existente.' : 'Pipeline CI/CD generado y listo para revisión.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewPipeline = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { addToast({ type: 'error', message: 'Indica qué debe corregirse en el pipeline.' }); return; }
    try {
      setBusy(true);
      const artifact = await reviewPipelineArtifactApi(projectId, pipelineArtifact.id, decision, notes);
      setPipelineArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Pipeline CI/CD aprobado.' : 'Pipeline rechazado para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateDelivery = async () => {
    try {
      setBusy(true);
      const result = await generateDeliveryArtifactApi(projectId);
      setDeliveryArtifact(result.artefacto); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: result.reutilizado ? 'Las versiones no cambiaron; se reutilizó el paquete existente.' : 'Paquete final consolidado y listo para revisión.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const reviewDelivery = async (decision) => {
    if (decision === 'rechazar' && !notes.trim()) { addToast({ type: 'error', message: 'Indica qué debe corregirse en el paquete final.' }); return; }
    try {
      setBusy(true);
      const artifact = await reviewDeliveryArtifactApi(projectId, deliveryArtifact.id, decision, notes, { modo_permisivo: decision === 'aprobar' && permissive });
      setDeliveryArtifact(artifact); setPlan(await fetchCodePlanApi(projectId));
      addToast({ type: 'success', message: decision === 'aprobar' ? `Entrega aprobada y proyecto finalizado. Ya puedes descargar el ZIP.${autoRun ? ' Iniciando el proyecto en Docker…' : ''}` : 'Paquete rechazado para corrección.' });
      if (decision === 'aprobar' && autoRun) controlLocalRunApi(projectId, 'iniciar').catch((error) => addToast({ type: 'error', message: `No se pudo iniciar el proyecto: ${error.message}` }));
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const downloadDelivery = async () => {
    try { setBusy(true); await downloadDeliveryArtifactApi(projectId, deliveryArtifact.id); }
    catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const decisionItems = (plan?.etapas || []).filter((item) => EDITABLE_PHASES.includes(item.etapa));
  const generationGate = {
    etapa: 'generacion_entrega',
    titulo: 'Generación y entrega',
    estado: deliveryArtifact?.aprobado ? 'aprobada' : plan?.etapas?.some(e => e.etapa === 'generacion_backend' && e.habilitada) ? 'en_revision' : 'bloqueada'
  };
  // La revisión previa no depende de ninguna aprobación: permite ver qué se generará mientras se toman las decisiones.
  const previewItem = { etapa: 'revision_previa', titulo: 'Revisión previa', estado: 'pendiente' };
  const codingSteps = [...decisionItems, previewItem, generationGate].map((item) => ({
    key: item.etapa,
    label: item.titulo,
    state: item.estado === 'aprobada' ? 'done' : item.estado === 'bloqueada' && !item.propuesta ? 'blocked' : item.estado === 'desactualizada' ? 'stale' : 'pending',
    title: item.etapa === 'generacion_entrega' && item.estado === 'bloqueada'
      ? 'Aprueba las decisiones anteriores para habilitar la generación y entrega'
      : `${item.titulo} (${String(item.estado || '').replace('_', ' ')})`
  }));

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
      <StepSidebar title="Codificación" ariaLabel="Pasos de la codificación" steps={codingSteps} currentKey={selected}
        collapsed={stepsCollapsed} onToggleCollapsed={() => setStepsCollapsed((value) => !value)}
        onSelect={(key) => { setSelected(key); setSuggestionMeta(null); }} />

      {/* SECCIÓN DERECHA: Misma altura y estructura de cabecera que la Fase 2 */}
      <div className="w-full flex-1 overflow-y-auto min-h-0 pt-6 pb-10 px-6 md:px-12 flex flex-col bg-white">
        {plan?.etapas?.some(item => item.estado === 'desactualizada') && <p role="status" className="rounded bg-amber-50 p-3 text-sm">
          Vuelve a revisar o generar: {plan.etapas.filter(item => item.estado === 'desactualizada').map(item => item.titulo).join(', ')}.
        </p>}
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
          <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-normal text-slate-900 tracking-tight">Decisiones técnicas de {projectName || 'proyecto'}</h2>
          </div>

          {/* Barra compacta de acción y progreso (en el mismo nivel donde Fase 2 ubica sus tabs) */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleOneClickMode}
                disabled={busy}
                title="Configura y aprueba todas las etapas con valores seguros (JWT, sin autoregistro, solo reglas con evidencia literal)"
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50 transition cursor-pointer"
              >
                <WandSparkles size={13} className={busy ? 'animate-spin' : ''} />
                Modo de un clic
              </button>
              <span className="text-xs text-slate-500 hidden sm:inline">
                Puedes volver a revisar las decisiones aprobadas.
              </span>
            </div>

            <div className="flex items-center gap-3 min-w-[200px] sm:min-w-[240px]">
              <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all"
                  style={{ width: `${(approvedCount / DECISION_PHASES.length) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                {approvedCount}/{DECISION_PHASES.length} decisiones aprobadas
              </span>
            </div>
          </div>

          {plan?.modo_un_clic && (
            <div className="mb-5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/70 to-indigo-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      Planificación completada en Modo de un clic
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">
                        Valores seguros aplicados
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {plan.modo_un_clic.resumen} {plan.modo_un_clic.ejecutado_en ? `· ${new Date(plan.modo_un_clic.ejecutado_en).toLocaleTimeString()}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOneClickReport((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition shadow-xs"
                >
                  {showOneClickReport ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showOneClickReport ? 'Ocultar informe' : 'Ver informe de lo dudoso'}
                </button>
              </div>

              {showOneClickReport && (
                <div className="mt-3.5 space-y-3 border-t border-violet-200/70 pt-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Autenticación</span>
                      <p className="mt-0.5 font-medium text-slate-800">{String(plan.modo_un_clic.valores_seguros?.autenticacion || 'jwt').toUpperCase()}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Autoregistro</span>
                      <p className="mt-0.5 font-medium text-slate-800">Cerrado (sin registro libre)</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Reglas con evidencia</span>
                      <p className="mt-0.5 font-medium text-emerald-700">{plan.modo_un_clic.valores_seguros?.reglas_confirmadas || 0} confirmadas</p>
                    </div>
                    <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-xs">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Reglas descartadas</span>
                      <p className="mt-0.5 font-medium text-amber-700">{plan.modo_un_clic.valores_seguros?.reglas_descartadas || 0} sin evidencia literal</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-slate-700 mb-1">
                      Aspectos dudosos y advertencias detectadas ({plan.modo_un_clic.dudas?.length || 0}):
                    </p>
                    {(!plan.modo_un_clic.dudas || plan.modo_un_clic.dudas.length === 0) ? (
                      <p className="text-[11px] text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
                        ✓ No se detectaron aspectos dudosos; todas las decisiones se basaron en evidencia explícita de los requisitos.
                      </p>
                    ) : (
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-950">
                        {plan.modo_un_clic.dudas.map((duda, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 text-amber-600 mt-0.5" />
                            <span>
                              <strong className="font-semibold capitalize">[{duda.etapa?.replace('_', ' ')}]:</strong>{' '}
                              {duda.detalle || duda.descripcion}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {busy && !plan ? (
            <div className="flex py-16 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="animate-spin" size={18} />
              Cargando plan de codificación…
            </div>
          ) : selected === 'revision_previa' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
              <h2 className="text-2xl font-bold text-slate-900">Revisión previa</h2>
              <p className="mt-1 mb-6 text-sm text-slate-500">Qué pantallas, componentes, botones y operaciones se van a generar. Revísalo antes de generar el código.</p>
              <GenerationPreviewPanel projectId={projectId} refreshKey={plan?.version} onError={(message) => addToast({ type: 'error', message })} />
            </div>
          ) : selected === 'generacion_entrega' ? (
            /* PANEL EXCLUSIVO PARA GENERACIÓN Y ENTREGA DE ARTEFACTOS */
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-600">
                      Compuerta de generación activa
                    </span>
                    <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${deliveryArtifact?.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>
                      {deliveryArtifact?.aprobado ? 'aprobada' : 'habilitada'}
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-2xl font-bold text-slate-900">Generación y entrega del sistema</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Genera las partes seleccionadas. Cada versión tiene su propia descarga y verificación.
                  </p>
                </div>
              </div>

              <label className="mb-6 block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones de revisión (para rechazos o ajustes)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-violet-500"
                  placeholder="Indica observaciones si deseas rechazar o solicitar cambios en algún artefacto generado…"
                />
              </label>

              <section className="space-y-7">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Generación del backend</h3><p className="mt-1 text-xs text-slate-500">Código propuesto desde las decisiones y RF aprobados. La verificación detecta módulos pendientes antes de aprobar.</p></div>
                    <button disabled={busy} onClick={generateBackend} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"><Code2 size={15} />{backendArtifact ? 'Regenerar backend' : 'Generar backend'}</button>
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
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Generación del frontend</h3><p className="mt-1 text-xs text-slate-500">Aplicación React/Vite con rutas y vistas derivadas del árbol y mockups aprobados.</p></div>
                    <div className="flex gap-2">{plataformas.map(p => <button key={p} disabled={busy} onClick={() => generateFrontend(p)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Generar {p}</button>)}</div>
                  </div>
                  {frontendArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {frontendArtifact.version} · {frontendArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${frontendArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{frontendArtifact.estado}</span></div>
                    {frontendArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{frontendArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(frontendArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                    <ArtifactVerification key={frontendArtifact.id} projectId={projectId} artifact={frontendArtifact} onArtifactChange={setFrontendArtifact} />
                    {frontendArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewFrontend('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewFrontend('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar frontend</button></div>}
                  </div>}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Generación de pruebas</h3><p className="mt-1 text-xs text-slate-500">Pruebas de trazabilidad, integración del API y navegación E2E vinculadas a versiones aprobadas.</p>{!testsEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba backend y frontend.</p>}</div>
                    <button disabled={busy || !testsEnabled} onClick={generateTests} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"><Code2 size={15} />{testArtifact ? 'Regenerar pruebas' : 'Generar pruebas'}</button>
                  </div>
                  {testArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {testArtifact.version} · {testArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${testArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{testArtifact.estado}</span></div>
                    {testArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{testArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(testArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                    <ArtifactVerification key={testArtifact.id} projectId={projectId} artifact={testArtifact} onArtifactChange={setTestArtifact} />
                    {testArtifact.estado === 'en_revision' && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">{mockupFormWaiver(testArtifact.verificacion) && <label className="mr-auto flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={permissive} onChange={(event) => setPermissive(event.target.checked)} />Modo permisivo: aprobar aunque fallen los formularios del mockup. La compilación, el arranque y el CRUD ya pasaron.</label>}<button disabled={busy} onClick={() => reviewTests('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewTests('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar pruebas</button></div>}
                  </div>}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Infraestructura y puesta en marcha</h3><p className="mt-1 text-xs text-slate-500">Docker, Compose, proxy, persistencia y despliegue derivados de arquitectura y RNF aprobados.</p>{!infrastructureEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba backend y frontend.</p>}</div>
                    <button disabled={busy || !infrastructureEnabled} onClick={generateInfrastructure} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"><Settings2 size={15} />{infrastructureArtifact ? 'Regenerar infraestructura' : 'Generar infraestructura'}</button>
                  </div>
                  {infrastructureArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {infrastructureArtifact.version} · {infrastructureArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${infrastructureArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{infrastructureArtifact.estado}</span></div>
                    {infrastructureArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{infrastructureArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(infrastructureArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                    <ArtifactVerification key={infrastructureArtifact.id} projectId={projectId} artifact={infrastructureArtifact} onArtifactChange={setInfrastructureArtifact} />
                    {infrastructureArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewInfrastructure('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewInfrastructure('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar infraestructura</button></div>}
                  </div>}
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Pipeline CI/CD</h3><p className="mt-1 text-xs text-slate-500">Validación, compilación, pruebas, contenedores y paquete de entrega mediante GitHub Actions.</p>{!pipelineEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba pruebas e infraestructura.</p>}</div>
                    <button disabled={busy || !pipelineEnabled} onClick={generatePipeline} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"><Settings2 size={15} />{pipelineArtifact ? 'Regenerar pipeline' : 'Generar pipeline'}</button>
                  </div>
                  {pipelineArtifact && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Versión {pipelineArtifact.version} · {pipelineArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${pipelineArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{pipelineArtifact.estado}</span></div>
                    {pipelineArtifact.advertencias?.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">{pipelineArtifact.advertencias.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(pipelineArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                    <ArtifactVerification key={pipelineArtifact.id} projectId={projectId} artifact={pipelineArtifact} onArtifactChange={setPipelineArtifact} />
                    {pipelineArtifact.estado === 'en_revision' && <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => reviewPipeline('rechazar')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewPipeline('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar pipeline</button></div>}
                  </div>}
                </div>

                <GeneratedSummary artifacts={{ backend: backendArtifact, frontend: frontendArtifact, tests: testArtifact, infrastructure: infrastructureArtifact, pipeline: pipelineArtifact, delivery: deliveryArtifact }} />

                <FunctionalGatePanel projectId={projectId} refreshKey={`${backendArtifact?.id}-${frontendArtifact?.id}-${testArtifact?.id}`} onError={(message) => addToast({ type: 'error', message })} />

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-slate-900">Paquete final de entrega</h3><p className="mt-1 text-xs text-slate-500">Consolida código, pruebas, infraestructura, CI/CD, manifiesto de versiones y huellas.</p>{!deliveryEnabled && <p className="mt-1 text-xs text-amber-600">Primero aprueba el pipeline CI/CD.</p>}</div>
                    <button disabled={busy || !deliveryEnabled} onClick={generateDelivery} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"><FolderTree size={15} />{deliveryArtifact ? 'Regenerar paquete' : 'Generar paquete final'}</button>
                  </div>
                  {deliveryArtifact && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800">Entrega v{deliveryArtifact.version} · {deliveryArtifact.archivos?.length || 0} archivos</p><span className={`rounded-full border px-2 py-0.5 text-[10px] ${deliveryArtifact.aprobado ? STATUS_STYLE.aprobada : STATUS_STYLE.en_revision}`}>{deliveryArtifact.estado}</span></div>
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-600">{(deliveryArtifact.archivos || []).map((file) => <div key={file.ruta}>{file.ruta}</div>)}</div>
                    <ArtifactVerification key={deliveryArtifact.id} projectId={projectId} artifact={deliveryArtifact} onArtifactChange={setDeliveryArtifact} />
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      {deliveryArtifact.estado === 'en_revision' && <><label className="mr-auto flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={autoRun} onChange={(event) => changeAutoRun(event.target.checked)} />Ejecutar el proyecto en Docker al aprobar</label>{mockupFormWaiver(deliveryArtifact.verificacion) && <label className="mr-auto flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={permissive} onChange={(event) => setPermissive(event.target.checked)} />Modo permisivo: aprobar aunque fallen los formularios del mockup.</label>}<button disabled={busy} onClick={() => reviewDelivery('rechazar')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewDelivery('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar entrega</button></>}
                      {deliveryArtifact.aprobado && <button disabled={busy} onClick={downloadDelivery} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white"><Download size={14} />Descargar ZIP</button>}
                    </div>
                  </div>}
                  {deliveryArtifact?.aprobado && <div className="mt-4"><LocalRunPanel key={deliveryArtifact.id} projectId={projectId} onError={(message) => addToast({ type: 'error', message })} /></div>}
                </div>
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
              {current && <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-600 leading-tight max-w-[180px]">
                      Decisión
                    </span>
                    <span className={`inline-flex rounded-full border px-3 py-0.5 text-xs font-semibold ${STATUS_STYLE[current.estado]}`}>
                      {current.estado?.replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    disabled={busy || current.estado === 'bloqueada'}
                    onClick={generateSuggestion}
                    className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <WandSparkles size={15} />
                    Generar propuesta desde el proyecto
                  </button>
                </div>

                <div className="mb-5">
                  <h2 className="text-2xl font-bold text-slate-900">{current.titulo}</h2>
                  <p className="mt-1 text-sm text-slate-500">{current.descripcion}</p>
                </div>

                {/* Formulario principal de decisión */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-5">
                  {loadingDraft && <p role="status">Preparando propuesta…</p>}
                  <PhaseForm phase={selected} projectId={projectId} version={plan?.version} modules={plan?.modulos} value={drafts[selected] || {}} disabled={busy || current.estado === 'bloqueada'} onChange={(value) => setDrafts((old) => ({ ...old, [selected]: value }))} />
                </div>
                {suggestionMeta && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Base de la sugerencia: {suggestionMeta.evidencias.length} artefactos aprobados</p>
                  {suggestionMeta.advertencias.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-700">{suggestionMeta.advertencias.map((item) => <li key={item}>{item}</li>)}</ul>}
                  <details className="mt-2"><summary className="cursor-pointer font-medium text-violet-700">Ver evidencias utilizadas</summary><ul className="mt-2 list-disc space-y-1 pl-4">{suggestionMeta.evidencias.map((item, index) => <li key={`${item.tipo}-${item.identificador}-${index}`}>{item.identificador}{item.nombre ? ` · ${item.nombre}` : ''}{item.version ? ` · v${item.version}` : ''}</li>)}</ul></details>
                </div>}
                <label className="mt-5 block"><span className="mb-1 block text-xs font-semibold text-slate-700">Observaciones de revisión</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-violet-500" placeholder="Motivo, restricciones o cambios solicitados…" /></label>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {current.estado === 'en_revision' && <button disabled={busy} onClick={() => review('rechazar')} className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50"><RotateCcw size={14} />Solicitar cambios</button>}
                  <button disabled={busy || current.estado === 'bloqueada' || loadingDraft || !drafts[selected]} onClick={saveProposal} className="flex items-center gap-1.5 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"><Save size={14} />{current.estado === 'aprobada' ? 'Guardar nueva versión' : 'Guardar propuesta'}</button>
                  {current.estado === 'en_revision' && <button disabled={busy || JSON.stringify(current.propuesta) !== JSON.stringify(drafts[selected])} onClick={() => review('aprobar')} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={14} />Aprobar decisión</button>}
                </div>
              </>}
            </div>
          )}
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

function ArtifactVerification({ projectId, artifact, onArtifactChange }) {
  const [result, setResult] = useState(artifact.verificacion || null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [source, setSource] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [line, setLine] = useState(null);

  // Salta al archivo y la línea que indica el diagnóstico, sin buscar a mano.
  const fixHere = (finding) => {
    setSelectedFile(finding.archivo);
    setSource(artifact.archivos?.find((file) => file.ruta === finding.archivo)?.contenido || '');
    setLine(finding.linea);
    setEditorOpen(true);
  };

  // Reanudar polling si al montar existe un trabajo activo
  useEffect(() => {
    let active = true;
    fetchLatestArtifactVerificationJobApi(projectId, artifact.id)
      .then((data) => {
        if (!active || !data?.trabajo) return;
        if (['encolado', 'procesando'].includes(data.trabajo.estado)) {
          setJob(data.trabajo);
          setLoading(true);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [projectId, artifact.id]);

  // Polling del trabajo persistente
  useEffect(() => {
    if (!job || !['encolado', 'procesando'].includes(job.estado)) return undefined;
    const interval = setInterval(async () => {
      try {
        const data = await fetchArtifactVerificationJobApi(projectId, artifact.id, job.id);
        if (!data?.trabajo) return;
        setJob(data.trabajo);
        if (data.trabajo.estado === 'completado') {
          setLoading(false);
          setResult(data.verificacion);
          // Si la verificación de una corrección no pasó, el servidor retiró la aprobación: la vista lo refleja.
          onArtifactChange((prev) => ({ ...(prev || artifact), verificacion: data.verificacion, pendiente_reverificacion: false, ...(data.verificacion?.aprobacion_retirada ? { estado: 'en_revision', aprobado: false } : {}) }));
        } else if (data.trabajo.estado === 'fallido') {
          setLoading(false);
          setError(data.trabajo.error || 'La verificación falló en el contenedor aislado.');
        }
      } catch (err) {
        console.warn('Error en sondeo de verificación:', err);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [job, projectId, artifact, onArtifactChange]);

  const verify = async () => {
    setLoading(true); setError('');
    try {
      const data = await startArtifactVerificationJobApi(projectId, artifact.id);
      setJob(data.trabajo);
    } catch (failure) {
      setError(failure.message);
      setLoading(false);
    }
  };

  // Arreglo rápido: los controles sin enlace de una vista diseñada se aceptan como «solo interfaz» sin volver a la etapa de mockups.
  // Se anota en el manifiesto (quedan registrados en `aceptados_ui`) y se vuelve a verificar. Regenerar el frontend lo restablece.
  const unlinkedScreens = (result?.errores || []).map((item) => /^La vista diseñada de «(.+)» tiene \d+ controles? sin enlace/.exec(item)?.[1]).filter(Boolean);
  const acceptAsUi = async () => {
    setLoading(true); setError('');
    try {
      const path = 'frontend/icase.manifest.json';
      const manifest = JSON.parse(artifact.archivos?.find((file) => file.ruta === path)?.contenido || '{}');
      manifest.pantallas = (manifest.pantallas || []).map((screen) => {
        const links = screen.enlaces;
        if (!links || !unlinkedScreens.includes(screen.name || screen.nombre || screen.id)) return screen;
        return { ...screen, enlaces: { ...links, ui: (links.ui || 0) + (links.sin_enlace_total ?? (links.sin_enlace || []).length), aceptados_ui: [...(links.aceptados_ui || []), ...(links.sin_enlace || [])], sin_enlace: [], sin_enlace_total: 0 } };
      });
      const updated = await updateGeneratedArtifactFileApi(projectId, artifact.id, path, JSON.stringify(manifest, null, 2));
      onArtifactChange(updated);
      setResult(null);
      const data = await startArtifactVerificationJobApi(projectId, artifact.id);
      setJob(data.trabajo);
      return;
    } catch (failure) { setError(failure.message); }
    setLoading(false);
  };

  const saveFile = async () => {
    setLoading(true); setError('');
    try {
      const updated = await updateGeneratedArtifactFileApi(projectId, artifact.id, selectedFile, source);
      onArtifactChange(updated);
      setResult(null);
      // Tras corregir se vuelve a verificar de inmediato: si pasa, la aprobación (si la había) se mantiene.
      const data = await startArtifactVerificationJobApi(projectId, artifact.id);
      setJob(data.trabajo);
      return;
    } catch (failure) { setError(failure.message); }
    setLoading(false);
  };

  // Infraestructura y pipeline no se ejecutan en Docker: se revisan y se aprueban directamente.
  const estructural = ['infraestructura', 'pipeline_ci_cd'].includes(artifact.tipo);
  const partes = artifact.tipo === 'codigo_frontend'
    ? [['web', 'frontend/'], ['móvil', 'mobile/']].filter(([, dir]) => artifact.archivos?.some(f => f.ruta.startsWith(dir))).map(([p]) => p) : [''];
  return <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
    {artifact.tipo !== 'paquete_entrega' && partes.map(p => <button key={p} className="mb-2 mr-3 font-semibold text-violet-700"
      onClick={() => downloadCodeArtifactApi(projectId, artifact.id, p).catch(e => setError(e.message))}>Descargar ZIP {p}</button>)}
    {artifact.modulos && <details><summary>Módulos de esta versión</summary>
      <p>Incluidos: {artifact.modulos.incluidos.join(', ') || 'ninguno'}</p><p>Fuera: {artifact.modulos.excluidos.join(', ') || 'ninguno'}</p></details>}
    {!estructural && <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-slate-700">Verificación aislada (Docker): {result?.estado || (job?.estado === 'procesando' ? 'en ejecución…' : 'pendiente')}</span>
      <button type="button" disabled={loading} onClick={verify} className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-1.5 font-semibold text-violet-700 hover:bg-violet-100/60 disabled:opacity-50 transition cursor-pointer">
        {loading ? <Loader2 size={13} className="animate-spin" /> : null}
        {loading ? (job?.mensaje || 'Verificando en contenedor…') : 'Verificar artefacto'}
      </button>
    </div>}

    {loading && job && (
      <div className="mt-2.5 rounded-lg border border-violet-200 bg-violet-50/60 p-2 text-[11px] text-violet-900">
        <div className="flex justify-between items-center mb-1">
          <span className="font-medium">{job.mensaje || 'Ejecutando pruebas en Docker…'}</span>
          <span className="font-semibold text-violet-700">{job.progreso}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-200">
          <div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${job.progreso}%` }} />
        </div>
      </div>
    )}

    {error && <p className="mt-2 text-red-700">{error}</p>}
    {artifact.pendiente_reverificacion && !loading && !result && <p role="status" className="mt-2 text-amber-700">Corrección pendiente de verificar: no se puede empaquetar hasta que pase.</p>}
    {result?.aprobacion_mantenida && <p role="status" className="mt-2 font-semibold text-emerald-700">La corrección pasó la verificación: la aprobación se mantiene.</p>}
    {result?.aprobacion_retirada && <p role="alert" className="mt-2 font-semibold text-red-700">La corrección no pasó la verificación: se retiró la aprobación. Corrige y vuelve a verificar.</p>}
    {result && <><p className="mt-2 text-slate-500">{result.nota}</p>
      {result.pruebas?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-emerald-700">{result.pruebas.map((check) => <li key={check.paso}>{check.paso}: {check.resultado}</li>)}</ul>}
      {result.diagnostico?.ubicados?.length > 0 && <div className="mt-2 rounded-lg border border-red-200 bg-red-50/60 p-2" aria-label="Dónde está el error">
        <p className="font-semibold text-red-800">Dónde está el error ({result.diagnostico.total})</p>
        <ul className="mt-1 space-y-1.5">
          {result.diagnostico.ubicados.map((item) => <li key={`${item.archivo}:${item.linea}:${item.mensaje}`} className="text-red-800">
            <span className="font-mono font-semibold">{item.archivo}:{item.linea}</span>{item.afecta ? <span className="ml-1 text-red-600">({item.afecta.tipo}: {item.afecta.id})</span> : null}
            <span className="block text-red-700">{item.mensaje}</span>
            {item.corregible_aqui && ['en_revision', 'aprobado'].includes(artifact.estado)
              ? <button type="button" onClick={() => fixHere(item)} className="mt-0.5 font-semibold text-violet-700 underline">Corregir este archivo</button>
              : <span className="text-[11px] text-slate-500">{item.corregible_aqui ? 'El artefacto ya está revisado.' : 'Pertenece a otro artefacto: corrígelo allí.'}</span>}
          </li>)}
        </ul>
      </div>}
      {unlinkedScreens.length > 0 && ['en_revision', 'aprobado'].includes(artifact.estado) && <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2" aria-label="Arreglo rápido de controles sin enlace">
        <p className="text-violet-900">Hay controles sin enlace en {unlinkedScreens.map((name) => `«${name}»`).join(', ')}. Si son solo de interfaz, no hace falta volver a los mockups.</p>
        <button type="button" disabled={loading} onClick={acceptAsUi} className="mt-1 rounded bg-violet-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Marcar como solo interfaz y volver a verificar</button>
      </div>}
      {result.errores?.length > 0 && <details className="mt-2" open={!result.diagnostico?.ubicados?.length}><summary className="cursor-pointer text-red-700">Salida completa del error</summary><ul className="mt-1 list-disc space-y-1 pl-4 text-red-700">{result.errores.map((item) => <li key={item}>{item}</li>)}</ul></details>}
      {result.advertencias?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-700">{result.advertencias.map((item) => <li key={item}>{item}</li>)}</ul>}
    </>}
    {['en_revision', 'aprobado'].includes(artifact.estado) && <details className="mt-3 border-t border-slate-100 pt-2" open={editorOpen} onToggle={(event) => setEditorOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold text-violet-700">Revisar y corregir un archivo</summary>
      {artifact.aprobado && <p className="mt-2 text-[11px] text-slate-500">Este artefacto está aprobado. Al guardar se vuelve a verificar; si pasa, la aprobación se mantiene, y si no, se retira.</p>}
      <select aria-label="Archivo a corregir" value={selectedFile} onChange={(event) => {
        const path = event.target.value;
        setSelectedFile(path);
        setSource(artifact.archivos?.find((file) => file.ruta === path)?.contenido || '');
      }} className="mt-2 w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs">
        <option value="">Selecciona un archivo</option>
        {(artifact.archivos || []).map((file) => <option key={file.ruta} value={file.ruta}>{file.ruta}</option>)}
      </select>
      {selectedFile && line && <p className="mt-1 text-[11px] text-slate-500">El error está en la línea {line}.</p>}
      {selectedFile && <><textarea aria-label="Contenido del archivo" value={source} onChange={(event) => setSource(event.target.value)} rows={14} spellCheck={false} className="mt-2 w-full rounded border border-slate-300 p-2 font-mono text-xs" />
        <button type="button" disabled={loading} onClick={saveFile} className="mt-2 rounded bg-violet-700 px-3 py-2 font-semibold text-white disabled:opacity-50">Guardar archivo y volver a verificar</button></>}
    </details>}
  </div>;
}

// Lo que el generador sabe producir (debe coincidir con StackCatalog del backend, que lo valida de todos modos).
const STACK_OPTIONS = {
  backend: ['Node.js + Express', 'Node.js + NestJS', 'Node.js 22.12+ + NestJS 12.3.2', 'Java + Spring Boot'],
  base_datos: ['PostgreSQL', 'MySQL', 'MongoDB'],
  gestor_paquetes: ['npm', 'Maven'], tiempo_real: ['', 'Socket.IO'], estilos: ['Estilos del mockup', 'Tailwind CSS'],
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
    case 'requerido': return `${ruleField(rule)} es obligatorio`;
    case 'unico': return `${(rule.campos || [rule.campo]).map((item) => `«${humanizeField(item)}»`).join(' + ')} no se repite entre registros`;
    case 'rango': return `«${ruleField(rule)}» ${limits(rule.min, rule.max, '')}`;
    case 'longitud': return `«${ruleField(rule)}» ${limits(rule.min, rule.max, ' caracteres')}`;
    case 'formato': return `«${ruleField(rule)}» debe ser un ${rule.formato === 'email' ? 'correo electrónico' : 'URL'} válido`;
    case 'comparacion': return `«${ruleField(rule)}» ${rule.operador} ${rule.con_campo !== undefined ? `«${rule.con_campo}»` : JSON.stringify(rule.con_valor)}`;
    case 'maquina_estados': return `«${ruleField(rule)}» empieza en ${rule.inicial}. Transiciones: ${(rule.transiciones || []).map((item) => `${item.de} → ${item.a}`).join(', ')}`;
    case 'inmutable': return `«${ruleField(rule)}» no puede cambiar una vez creado`;
    case 'valor_por_defecto': return `«${ruleField(rule)}» vale ${JSON.stringify(rule.valor)} si no se envía`;
    case 'calculo': return `«${ruleField(rule)}» se calcula con ${JSON.stringify(rule.expresion)} (${rule.decimales} decimales). Solo se ejecuta tras confirmar la regla.`;
    default: return rule.tipo;
  }
}

const RULE_TYPE_LABELS = {
  requerido: 'Obligatorio', unico: 'No se repite', rango: 'Rango permitido', longitud: 'Longitud', formato: 'Formato válido',
  comparacion: 'Comparación', maquina_estados: 'Estados', inmutable: 'No se modifica', valor_por_defecto: 'Valor por defecto', calculo: 'Cálculo'
};

/** Nombre legible de un campo cuando la propuesta no lo trae: «passwordHash» → «Contraseña», «cliente_id» → «Cliente». */
function humanizeField(name) {
  const raw = String(name || '').trim();
  const key = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (['passwordhash', 'password', 'contrasena'].includes(key)) return 'Contraseña';
  if (['correo', 'email'].includes(key)) return 'Correo electrónico';
  const words = raw.replace(/(?:_|\b)id$/i, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/\bfecha hora\b/, 'fecha y hora');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw;
}
const ruleField = (rule) => rule.campo_etiqueta || humanizeField(rule.campo);
const ruleEntity = (rule) => rule.entidad_etiqueta || humanizeField(rule.entidad) || 'General';

function DecisionButtons({ rule, onDecide, disabled, compact = false }) {
  return <div className="flex shrink-0 gap-1" role="group" aria-label={`Decisión sobre la regla de ${ruleField(rule)}`}>
    {RULE_DECISIONS.map(({ value: decision, label, style, icon: Icon }) => <button key={decision} type="button" disabled={disabled}
      aria-pressed={rule.estado_decision === decision} aria-label={label} title={label}
      onClick={() => onDecide(decision)}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-50 ${rule.estado_decision === decision ? style : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'}`}>
      {Icon && <Icon size={12} />}{(!compact || !Icon) && label}
    </button>)}
  </div>;
}

function RuleOrigin({ rule }) {
  const explicit = rule.origen === 'explicito';
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${explicit ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
    {explicit ? 'Pedida en un requisito' : 'Sugerida por el sistema'}
  </span>;
}

function RuleDetails({ rule, disabled, onChange }) {
  return <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Mensaje que verá el usuario cuando no se cumpla</span>
      <input disabled={disabled} value={rule.mensaje || ''} maxLength={240} onChange={(event) => onChange({ mensaje: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50" />
    </label>
    {rule.evidencia && <blockquote className="border-l-2 border-slate-300 pl-3 text-xs italic text-slate-600">«{rule.evidencia}»{rule.evidencia_literal ? '' : ' (no consta literalmente en el requisito)'}</blockquote>}
    {rule.justificacion && <p className="text-xs text-slate-500">Por qué se propone: {rule.justificacion}</p>}
    {(rule.rf || []).length > 0 && <p className="text-xs text-slate-500">Requisitos relacionados: {(rule.rf || []).join(', ')}</p>}
  </div>;
}

export function RulesEditor({ value, onChange, disabled }) {
  const rules = Array.isArray(value.reglas) ? value.reglas : [];
  const [filter, setFilter] = useState('todas');
  const count = (decision) => rules.filter((item) => item.estado_decision === decision).length;
  const patchMany = (ids, changes) => onChange({ ...value, reglas: rules.map((item) => (ids.includes(item.id) ? { ...item, ...changes } : item)) });
  if (!rules.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      No hay reglas propuestas. Usa «Generar propuesta desde el proyecto» o aprueba la etapa vacía si el sistema no necesita reglas específicas.
    </div>;
  }
  const visible = rules.filter((item) => filter === 'todas' || item.estado_decision === filter);
  const groups = [];
  for (const rule of visible) {
    const name = ruleEntity(rule);
    let group = groups.find((item) => item.name === name);
    if (!group) groups.push(group = { name, rules: [] });
    group.rules.push(rule);
  }
  const pendingIds = rules.filter((item) => item.estado_decision === 'pendiente').map((item) => item.id);
  const FILTERS = [['todas', `Todas (${rules.length})`], ['pendiente', `Pendientes (${count('pendiente')})`], ['confirmado', `Confirmadas (${count('confirmado')})`], ['rechazado', `Rechazadas (${count('rechazado')})`]];

  return <div className="space-y-3">
    <p className="text-xs text-slate-500">Cada regla es una condición que el sistema comprobará al guardar datos. Confirma las que correspondan al negocio y rechaza las que no. {value.notas ? '' : ''}</p>
    <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
          className={`rounded-full border px-2.5 py-1 ${filter === key ? 'border-violet-300 bg-violet-50 font-semibold text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}>{label}</button>)}
      </div>
      <button type="button" disabled={disabled || !pendingIds.length} onClick={() => patchMany(pendingIds, { estado_decision: 'confirmado' })}
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40">
        Confirmar las {pendingIds.length} pendientes
      </button>
    </div>
    {!groups.length && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No hay reglas en este filtro.</p>}
    {groups.map((group) => {
      const required = group.rules.filter((item) => item.tipo === 'requerido');
      const others = group.rules.filter((item) => item.tipo !== 'requerido');
      const pending = group.rules.filter((item) => item.estado_decision === 'pendiente').map((item) => item.id);
      return <details key={`${filter}-${group.name}`} open={filter !== 'todas' || pending.length > 0} className="rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">{group.name} <span className="ml-1 text-xs font-normal text-slate-500">{group.rules.length} {group.rules.length === 1 ? 'regla' : 'reglas'}{pending.length ? ` · ${pending.length} por decidir` : ''}</span></span>
          {pending.length > 0 && <button type="button" disabled={disabled} onClick={(event) => { event.preventDefault(); patchMany(pending, { estado_decision: 'confirmado' }); }}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-40">Confirmar las de {group.name}</button>}
        </summary>
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {required.length > 0 && <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Datos que siempre se piden</p>
            <ul className="divide-y divide-slate-100">
              {required.map((rule) => <li key={rule.id} className={`py-2 ${rule.estado_decision === 'rechazado' ? 'opacity-60' : ''}`} title={rule.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-sm text-slate-800">{ruleField(rule)} es obligatorio</span><RuleOrigin rule={rule} /></div>
                  <DecisionButtons rule={rule} disabled={disabled} compact onDecide={(decision) => patchMany([rule.id], { estado_decision: decision })} />
                </div>
                <details className="mt-1"><summary className="cursor-pointer text-[11px] text-slate-500">Ver detalle y editar el mensaje</summary>
                  <RuleDetails rule={rule} disabled={disabled} onChange={(changes) => patchMany([rule.id], changes)} /></details>
              </li>)}
            </ul>
          </div>}
          {others.map((rule) => <article key={rule.id} title={rule.id} className={`rounded-xl border p-3 ${rule.estado_decision === 'rechazado' ? 'border-red-100 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">{RULE_TYPE_LABELS[rule.tipo] || rule.tipo}</span>
                  <RuleOrigin rule={rule} />
                </div>
                <p className="mt-1.5 text-sm font-medium text-slate-900">{describeRule(rule)}</p>
              </div>
              <DecisionButtons rule={rule} disabled={disabled} onDecide={(decision) => patchMany([rule.id], { estado_decision: decision })} />
            </div>
            <RuleDetails rule={rule} disabled={disabled} onChange={(changes) => patchMany([rule.id], changes)} />
          </article>)}
        </div>
      </details>;
    })}
  </div>;
}

const ACCESS_METHODS = [
  { method: 'GET', label: 'Ver' },
  { method: 'POST', label: 'Crear' },
  { method: 'PATCH', label: 'Editar' },
  { method: 'DELETE', label: 'Eliminar' }
];

const ACCESS_VERB_LABEL = { GET: 'consulta', POST: 'registra', PATCH: 'modifica', DELETE: 'elimina' };
/** «Solo consulta», «Consulta y registra»…: qué hace la operación según los mockups aprobados. */
function describeAccessMethods(methods) {
  const verbs = methods.map((method) => ACCESS_VERB_LABEL[method]).filter(Boolean);
  if (verbs.length === 1) return 'Solo consulta';
  const text = verbs.join(', ').replace(/, ([^,]*)$/, ' y $1');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function AccessEditor({ value, onChange, disabled }) {
  const auth = value.autenticacion || { metodo: 'jwt', expiracion: '8h' };
  const roles = Array.isArray(value.roles) ? value.roles : [];
  const permisos = Array.isArray(value.permisos) ? value.permisos : [];
  const operaciones = Array.isArray(value.operaciones) ? value.operaciones : [];
  const active = roles.filter((role) => role.incluir !== false);
  const [newRole, setNewRole] = useState('');
  const setAuth = (changes) => onChange({ ...value, autenticacion: { ...auth, ...changes } });
  const setRole = (id, changes) => onChange({ ...value, roles: roles.map((role) => (role.id === id ? { ...role, ...changes } : role)) });
  const has = (operation, role, method) => permisos.some((item) => item.operacion === operation && item.rol === role && item.metodos.includes(method));
  const ownOnly = (operation, role) => permisos.some((item) => item.operacion === operation && item.rol === role && item.alcance === 'propios');
  const toggle = (operation, role, method) => {
    const current = permisos.find((item) => item.operacion === operation && item.rol === role);
    const methods = current ? (current.metodos.includes(method) ? current.metodos.filter((item) => item !== method) : [...current.metodos, method]) : [method];
    const others = permisos.filter((item) => item !== current);
    const alcance = current?.alcance === 'propios' ? 'propios' : 'todos';
    onChange({ ...value, permisos: methods.length ? [...others, { operacion: operation, rol: role, metodos: methods, alcance }] : others });
  };
  const toggleOwn = (operation, role) => {
    const current = permisos.find((item) => item.operacion === operation && item.rol === role);
    if (!current) return;
    onChange({ ...value, permisos: permisos.map((item) => item === current ? { ...item, alcance: item.alcance === 'propios' ? 'todos' : 'propios' } : item) });
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
          {['1h', '8h', '24h', '7d'].map((item) => <option key={item} value={item}>{item || 'Ninguno'}</option>)}
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
            <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="p-2">Operación</th>{active.map((role) => <th scope="col" key={role.id} className="p-2">{role.nombre}</th>)}<th scope="col" className="p-2 text-slate-500">Administrador</th></tr></thead>
            <tbody>{operaciones.map((operation) => operation.tipo === 'acceso' ? <tr key={operation.id} className="border-t border-slate-100 bg-slate-50/60">
              <td className="p-2"><span className="font-mono font-semibold">{operation.id}</span><br />{operation.nombre}</td>
              <td className="p-2 text-slate-500" colSpan={active.length + 1}>Inicio de sesión: lo resuelve la aplicación para todos los roles. No tiene permisos que configurar.</td>
            </tr> : <tr key={operation.id} className="border-t border-slate-100 align-top">
              <td className="p-2"><span className="font-mono font-semibold">{operation.id}</span><br />{operation.nombre}{Array.isArray(operation.metodos) && operation.metodos.length > 0 && <span className="mt-0.5 block text-[11px] text-slate-500">{describeAccessMethods(operation.metodos)}</span>}</td>
              {active.map((role) => <td key={role.id} className="p-2"><div className="flex flex-wrap gap-1" role="group" aria-label={`${operation.id} para ${role.nombre}`}>
                {ACCESS_METHODS.filter(({ method }) => !Array.isArray(operation.metodos) || !operation.metodos.length || operation.metodos.includes(method)).map(({ method, label }) => <button key={method} type="button" disabled={disabled} aria-pressed={has(operation.id, role.id, method)} onClick={() => toggle(operation.id, role.id, method)}
                  className={`rounded border px-1.5 py-0.5 ${has(operation.id, role.id, method) ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>{label}</button>)}
                {permisos.some((item) => item.operacion === operation.id && item.rol === role.id) && <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                  <input type="checkbox" disabled={disabled} checked={ownOnly(operation.id, role.id)} onChange={() => toggleOwn(operation.id, role.id)} />Solo registros propios
                </label>}
              </div></td>)}
              <td className="p-2 text-[11px] text-slate-500">Todo, siempre</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
  </div>;
}

export function ModulesEditor({ value, onChange, disabled, modules }) {
  const [processDraft,setProcessDraft]=useState(()=>JSON.stringify(value.procesos||[],null,2));
  const [processError,setProcessError]=useState('');
  useEffect(()=>{setProcessDraft(JSON.stringify(value.procesos||[],null,2));setProcessError('');},[value.procesos]);
  const optional = modules?.opcionales || [];
  const included = modules?.incluidos || [];
  const mode = value.modo === 'personalizado' ? 'personalizado' : 'automatico';
  const stateOf = (id) => {
    const recommended = optional.find((item) => item.id === id)?.porDefecto ?? false;
    const chosen = (value.modulos || []).find((item) => item.id === id);
    return mode === 'personalizado' && chosen ? chosen.activo : recommended;
  };
  const toggle = (id, active) => onChange({ ...value, modo: 'personalizado', modulos: optional.map((item) => ({ id: item.id, activo: item.id === id ? active : stateOf(item.id) })) });
  const requests = moduleRequests(modules);
  return <div className="space-y-5">
    <p className="text-xs text-slate-600">Elige qué funciones extra se agregan al sistema. Si omites este paso se usan las sugeridas por el análisis.</p>
    <ModuleNeeds modules={modules} isActive={stateOf} onActivate={(id) => toggle(id, true)} disabled={disabled} />
    <section>
      <h3 className="mb-2 text-xs font-semibold text-slate-700">Funciones extra que puedes incluir</h3>
      {optional.length === 0 ? <p className="text-xs text-slate-500">No hay módulos opcionales disponibles.</p> : <ul className="space-y-2">{optional.map((item) => <li key={item.id} className="rounded-lg border border-slate-200 p-3">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={stateOf(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} className="mt-1" />
          <span><span className="font-medium text-slate-800">{item.etiqueta}</span>
            <span className="block text-xs text-slate-600">{item.descripcion}</span>
            {item.sinEfecto && <span className="block text-xs text-slate-500">{item.sinEfecto}</span>}
            {(requests.get(item.id) || []).length > 0 && <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${stateOf(item.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>Lo piden: {requests.get(item.id).join(', ')}</span>}</span></label>
      </li>)}</ul>}
      {mode==='personalizado'&&stateOf('procesos_negocio')&&<div className="mt-4 rounded border p-3">
        <h4 className="font-semibold">Definiciones de procesos (experimental)</h4>
        <p className="text-xs text-slate-600">Introduce una lista declarativa revisada con RF, estados, roles, registros y acciones. Solo PostgreSQL y JWT. No se inventan procesos al activar el módulo. Ver PROCESSES.md de la entrega; la validación contra el modelo se realiza al generar.</p>
        <textarea aria-label="Definiciones de procesos" disabled={disabled} rows={12} className="mt-2 w-full rounded border p-2 font-mono text-xs" value={processDraft} onChange={event=>setProcessDraft(event.target.value)}/>
        {processError&&<p role="alert" className="text-sm text-red-600">{processError}</p>}
        <button type="button" disabled={disabled} className="rounded border px-3 py-2 text-sm" onClick={()=>{try{const procesos=JSON.parse(processDraft);if(!Array.isArray(procesos))throw new Error();onChange({...value,procesos});setProcessError('');}catch{setProcessError('Introduce una lista JSON válida. No se aplicaron cambios.');}}}>Aplicar definiciones para revisión</button>
        <p className="text-xs text-slate-500">Aplicar no aprueba la etapa: revisa las definiciones y aprueba Módulos explícitamente. Los cambios sin aplicar no se guardan.</p>
      </div>}
    </section>
    <DeliveryScope value={value.cobertura || {}} onChange={(cobertura) => onChange({ ...value, cobertura })} disabled={disabled} />
    <section>
      <h3 className="mb-2 text-xs font-semibold text-slate-700">Incluido según otras etapas</h3>
      <ul className="space-y-1">{included.map((item) => <li key={item.id} className="flex items-start gap-2 text-xs">
        <span aria-hidden="true" className={item.activo ? 'text-emerald-600' : 'text-slate-400'}>{item.activo ? '✓' : '—'}</span>
        <span className={item.activo ? 'text-slate-700' : 'text-slate-400'}><span className="font-medium">{item.etiqueta}</span> — {item.motivo}</span>
      </li>)}</ul>
    </section>
  </div>;
}

/** Qué requisitos piden algo que un módulo opcional cubre: de ahí salen las etiquetas «Lo piden…» y el resumen de arriba. */
function moduleRequests(modules) {
  const catalog = new Map((modules?.capacidades || []).map((item) => [item.id, item]));
  const byModule = new Map();
  for (const rf of modules?.requisitos || []) {
    for (const suggestion of rf.sugerencias || []) {
      const moduleId = catalog.get(suggestion.id)?.modulo;
      if (!moduleId) continue;
      byModule.set(moduleId, [...new Set([...(byModule.get(moduleId) || []), rf.identificador])]);
    }
  }
  return byModule;
}

/**
 * Lo que los requisitos piden más allá de gestionar datos, y qué módulo lo cubre. Una sola lista: la persona decide por
 * módulo (abajo), no requisito por requisito. Lo que ningún módulo cubre solo se informa; no se activa nada al marcarlo.
 */
function ModuleNeeds({ modules, isActive, onActivate, disabled }) {
  const requirements = modules?.requisitos || [];
  const catalog = new Map((modules?.capacidades || []).map((item) => [item.id, item]));
  const optional = new Map((modules?.opcionales || []).map((item) => [item.id, item]));
  const special = requirements.filter((rf) => rf.sugerencias?.length);
  const plain = requirements.filter((rf) => !rf.sugerencias?.length);
  if (!requirements.length) return <p className="text-xs text-slate-500">Reabre el plan para cargar los requisitos aprobados.</p>;
  return <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-4" aria-label="Qué piden tus requisitos">
    <div>
      <h3 className="text-sm font-semibold text-slate-800">Qué piden tus requisitos</h3>
      <p className="mt-1 text-xs text-slate-600">Todos los requisitos se generan como gestión de datos (crear, consultar, editar y eliminar) con tus reglas y permisos. Aquí solo aparece lo que un requisito menciona y va más allá de eso.</p>
    </div>
    {special.length > 0 ? <ul className="space-y-2">
      {special.map((rf) => <li key={rf.identificador} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <p className="font-semibold text-slate-800">{rf.identificador} · {rf.nombre}</p>
        <ul className="mt-1.5 space-y-1.5">
          {rf.sugerencias.map((suggestion) => {
            const moduleId = catalog.get(suggestion.id)?.modulo;
            const module = moduleId ? optional.get(moduleId) : null;
            return <li key={suggestion.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-600"><span className="font-medium text-slate-800">{suggestion.etiqueta}</span> — {suggestion.evidencia}</span>
              {module && isActive(moduleId) && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Lo cubre «{module.etiqueta}»</span>}
              {module && !isActive(moduleId) && <button type="button" disabled={disabled} onClick={() => onActivate(moduleId)} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 disabled:opacity-50">Activar «{module.etiqueta}»</button>}
              {!module && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600" title={suggestion.alternativa}>El generador aún no lo hace: quedará como pendiente en el informe</span>}
            </li>;
          })}
        </ul>
      </li>)}
    </ul> : <p className="text-xs text-slate-600">Ningún requisito pide funciones especiales.</p>}
    {plain.length > 0 && <details className="text-xs text-slate-600">
      <summary className="cursor-pointer font-medium">{plain.length} {plain.length === 1 ? 'requisito es' : 'requisitos son'} gestión de datos estándar: no necesitan decisión</summary>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{plain.map((rf) => <li key={rf.identificador}>{rf.identificador} · {rf.nombre}</li>)}</ul>
    </details>}
  </section>;
}

/** Opciones avanzadas de la entrega: casi nunca hace falta tocarlas. */
function DeliveryScope({ value, onChange, disabled }) {
  const mode = value.modo_entrega || 'parcial';
  return <details className="rounded-xl border border-slate-200 p-3 text-xs">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">Opciones avanzadas de la entrega</summary>
    <p className="mt-2 text-slate-600">El arranque y las pruebas técnicas no certifican todo el negocio. Por defecto la entrega es parcial: lo que ningún módulo cubre aparece como pendiente en el informe.</p>
    <label className="mt-2 block font-medium">Modalidad
      <select disabled={disabled} className="mt-1 block w-full rounded border p-2" value={mode} onChange={(event) => onChange({ ...value, modo_entrega: event.target.value })}>
        <option value="parcial">Parcial: incluir pendientes en el informe</option>
        <option value="completa">Completa: exige confirmar cada requisito y no admite pendientes</option>
      </select>
    </label>
    {mode === 'parcial' && <label className="mt-2 flex gap-2">
      <input disabled={disabled} type="checkbox" checked={value.aceptar_pendientes !== false} onChange={(event) => onChange({ ...value, aceptar_pendientes: event.target.checked })} />
      Reviso el informe de pendientes antes de aprobar la entrega.
    </label>}
  </details>;
}

function PhaseForm({ phase, value, onChange, disabled, modules, projectId, version }) {
  if (phase === 'modulos') return <ModulesEditor value={value} onChange={onChange} disabled={disabled} modules={modules} />;
  if (phase === SPEC_PHASE) return <SpecReviewPanel value={value} onChange={onChange} disabled={disabled} />;
  if (phase === 'control_acceso') return <AccessEditor value={value} onChange={onChange} disabled={disabled} />;
  if (phase === 'reglas_negocio') return <div className="space-y-3">
    {value.confirmadas?.map(item => <p key={item.id}><strong>{item.id}</strong> {item.necesidad} · Confirmada en el análisis</p>)}

    <RulesEditor value={value} onChange={onChange} disabled={disabled} />
  </div>;
  if (phase === 'alcance_plataforma') return <fieldset className="space-y-2"><legend>Interfaces</legend>
    {(value.detectadas || ['web', 'móvil']).map(p => <label key={p} className="mr-4"><input type="checkbox" checked={(value.plataformas || []).includes(p)} disabled={disabled || (value.plataformas?.length === 1 && value.plataformas.includes(p))}
      onChange={e => {
        const plataformas = e.target.checked ? [...(value.plataformas || []), p] : value.plataformas.filter(item => item !== p);
        // Al quitar la móvil, sus pantallas (el flujo del cliente) pasan a la web adaptadas, salvo que se desmarque.
        onChange({ ...value, plataformas, ...(p === 'móvil' ? { moviles_en_web: !e.target.checked } : {}) });
      }} /> {p}</label>)}
    {(value.detectadas || []).includes('móvil') && !(value.plataformas || []).includes('móvil') && <label className="mt-2 block text-sm text-slate-700">
      <input type="checkbox" disabled={disabled} checked={value.moviles_en_web === true} onChange={e => onChange({ ...value, moviles_en_web: e.target.checked })} /> Mostrar en la web, adaptadas, las pantallas pensadas para móvil (por ejemplo, el flujo del cliente). Sin esto no se generan.
    </label>}
  </fieldset>;
  const choice = (key, label) => {
    const current = String(value[key] || '');
    const known = STACK_OPTIONS[key].includes(current);
    return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-700">{label} · {value.origen?.[key] || 'Propuesta'}</span>
      <select disabled={disabled} value={current} onChange={(event) => onChange({ ...value, [key]: event.target.value, origen: { ...value.origen, [key]: 'Elegido por ti' }, ...(key === 'backend' ? { version_backend: undefined, gestor_paquetes: /spring/i.test(event.target.value) ? 'Maven' : 'npm' } : {}) })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50">
        {current && !known && <option value={current}>{current} (no soportado)</option>}
        {STACK_OPTIONS[key].filter(item => key !== 'gestor_paquetes' || item === (/spring/i.test(value.backend) ? 'Maven' : 'npm')).map((item) => <option key={item} value={item}>{item || 'Ninguno'}</option>)}
      </select>
      {current && !known && <span role="alert" className="mt-1 block text-xs text-red-600">«{current}» todavía no está soportado: elige una de las opciones.</span>}
    </label>;
  };
  if (phase === 'stack_tecnologico') return <div className="grid gap-4 md:grid-cols-2">{choice('backend', 'Backend')}{choice('frontend', 'Frontend')}{choice('base_datos', 'Base de datos')}{stackProblem(value) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 md:col-span-2">{stackProblem(value)}</p>}{choice('gestor_paquetes', 'Gestor de paquetes')}{choice('tiempo_real', 'Tiempo real')}{choice('estilos', 'Estilos')}</div>;
  return <div><CodeSummary projectId={projectId} refreshKey={version} /><FolderExplorer tree={value.arbol} /></div>;
}
