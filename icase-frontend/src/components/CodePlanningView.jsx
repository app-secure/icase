import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Code2, Download, FolderTree, Layers3,
  Loader2, LockKeyhole, Puzzle, RotateCcw, Save, Scale, Settings2, ShieldCheck, WandSparkles, X
} from 'lucide-react';
import {
  fetchCodePlanApi, fetchGeneratedArtifactsApi, generateBackendArtifactApi,
  downloadDeliveryArtifactApi, generateDeliveryArtifactApi, generateFrontendArtifactApi,
  generateInfrastructureArtifactApi, generatePipelineArtifactApi, generateTestArtifactApi, proposeCodePhaseApi,
  reviewBackendArtifactApi, reviewCodePhaseApi, reviewFrontendArtifactApi,
  reviewDeliveryArtifactApi, reviewInfrastructureArtifactApi, reviewPipelineArtifactApi,
  reviewTestArtifactApi, suggestCodePhaseApi, verifyGeneratedArtifactApi, updateGeneratedArtifactFileApi,
  executeOneClickModeApi, startArtifactVerificationJobApi, fetchArtifactVerificationJobApi, fetchLatestArtifactVerificationJobApi
} from '../services/api';
import GenerationReport from './GenerationReport';
import { ToastContainer, useToasts } from './Toast';

const DECISION_PHASES = ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'];
// Etapas que se pueden editar y aprobar pero no bloquean la generación (si no se aprueban rige el modo automático).
const OPTIONAL_PHASES = ['modulos'];

function mockupFormWaiver(verification) {
  const text = (verification?.errores || []).join('\n');
  const passed = (pattern) => (verification?.pruebas || []).some((item) => pattern.test(item.paso) && item.resultado === 'correcto');
  return verification?.estado === 'fallida'
    && /designed-ui\.spec\.js|interfaz diseñada|locator\.fill/i.test(text)
    && passed(/Compilación/) && passed(/health checks/) && passed(/CRUD/);
}
const EDITABLE_PHASES = [...DECISION_PHASES, ...OPTIONAL_PHASES];

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
  control_acceso: { autenticacion: { metodo: 'jwt', expiracion: '8h' }, roles: [], permisos: [], operaciones: [], notas: '' },
  modulos: { modo: 'automatico', modulos: [], notas: '' }
};

const ICONS = {
  alcance_plataforma: Settings2,
  stack_tecnologico: Code2,
  arquitectura_codigo: Layers3,
  estructura_carpetas: FolderTree,
  reglas_negocio: Scale,
  control_acceso: ShieldCheck,
  modulos: Puzzle
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
  const approvedCount = plan?.etapas?.filter((item) => DECISION_PHASES.includes(item.etapa) && item.estado === 'aprobada').length || 0;
  const testsEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_pruebas')?.habilitada;
  const infrastructureEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_infraestructura')?.habilitada;
  const pipelineEnabled = plan?.etapas?.find((item) => item.etapa === 'generacion_ci_cd')?.habilitada;
  const deliveryEnabled = plan?.etapas?.find((item) => item.etapa === 'paquete_entrega')?.habilitada;
  const [showOneClickReport, setShowOneClickReport] = useState(true);

  const handleOneClickMode = async () => {
    if (!window.confirm('¿Deseas ejecutar el Modo de un clic?\n\nRecorrerá todas las etapas de planificación aplicando valores seguros:\n• Autenticación JWT con roles derivados de los RF\n• Registro cerrado (sin autoregistro de usuarios)\n• Solo reglas explícitas con evidencia literal confirmadas\n• Módulos recomendados por defecto\n\nAl terminar tendrás un informe detallado con los aspectos dudosos o descartados.')) {
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
      setPlan((previous) => ({ ...updated, modulos: { ...updated.modulos, requisitos: previous?.modulos?.requisitos || [] } }));
      addToast({ type: 'success', message: 'Propuesta guardada. Ahora debe aprobarse explícitamente.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const generateSuggestion = async () => {
    try {
      setBusy(true); setSuggestionMeta(null);
      const result = await suggestCodePhaseApi(projectId, selected);
      setDrafts((old) => ({ ...old, [selected]: result.propuesta }));
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

  const generateFrontend = async () => {
    try {
      setBusy(true);
      const result = await generateFrontendArtifactApi(projectId);
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
      addToast({ type: 'success', message: decision === 'aprobar' ? 'Entrega aprobada y proyecto finalizado. Ya puedes descargar el ZIP.' : 'Paquete rechazado para corrección.' });
    } catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  const downloadDelivery = async () => {
    try { setBusy(true); await downloadDeliveryArtifactApi(projectId, deliveryArtifact.id); }
    catch (error) { addToast({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
      {/* SIDEBAR IZQUIERDO DELGADO TIPO ROADMAP: Compuertas de decisión */}
      <aside className="w-64 shrink-0 border-r border-slate-100 bg-white flex flex-col overflow-y-auto select-none">
        <div className="px-5 pt-6 pb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Compuertas de decisión
          </h2>
        </div>

        <nav className="flex-1 flex flex-col pb-4">
          {(() => {
            const decisionItems = (plan?.etapas || []).filter((item) => DECISION_PHASES.includes(item.etapa));
            const generationGate = {
              etapa: 'generacion_entrega',
              titulo: 'Generación y entrega',
              estado: deliveryArtifact?.aprobado
                ? 'aprobada'
                : approvedCount === DECISION_PHASES.length
                  ? 'en_revision'
                  : 'bloqueada'
            };
            const roadmapItems = [...decisionItems, generationGate];

            return roadmapItems.map((item, idx) => {
              const isSelected = selected === item.etapa;
              const isApproved = item.estado === 'aprobada';
              const isBlocked = item.estado === 'bloqueada';
              const nextItem = roadmapItems[idx + 1];
              const isNextApproved = nextItem?.estado === 'aprobada';
              const showConnector = idx < roadmapItems.length - 1;

              return (
                <React.Fragment key={item.etapa}>
                  <button
                    disabled={isBlocked}
                    onClick={() => { if (!isBlocked) { setSelected(item.etapa); setSuggestionMeta(null); } }}
                    className={`group w-full flex items-center gap-3 px-5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#F8F4FF] text-[#6D28D9] font-bold'
                        : isApproved
                        ? 'text-slate-800 font-semibold hover:bg-slate-50/80'
                        : isBlocked
                        ? 'text-slate-400 cursor-not-allowed opacity-65'
                        : 'text-slate-500 font-medium hover:bg-slate-50/80'
                    }`}
                    title={
                      item.etapa === 'generacion_entrega' && isBlocked
                        ? 'Aprueba las 6 decisiones anteriores para habilitar la generación y entrega'
                        : `${item.titulo} (${item.estado?.replace('_', ' ')})`
                    }
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      isApproved
                        ? 'bg-emerald-500 text-white'
                        : isSelected
                        ? 'border border-violet-500 bg-violet-100 text-violet-700'
                        : 'border border-slate-300 bg-white text-slate-500'
                    }`}>
                      {isApproved ? <Check size={12} strokeWidth={3} /> : idx + 1}
                    </span>
                    <span className="truncate">{item.titulo}</span>
                    {isBlocked && <LockKeyhole size={12} className="ml-auto shrink-0 text-slate-400" />}
                  </button>

                  {showConnector && (
                    <div className="flex items-center px-5 pointer-events-none" aria-hidden="true">
                      <div className="w-5 flex justify-center">
                        <span
                          className={`block w-[2px] h-2.5 rounded-full ${
                            isApproved && isNextApproved ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            });
          })()}

          {(plan?.etapas || []).some((item) => OPTIONAL_PHASES.includes(item.etapa)) && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="px-5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Opcional
              </p>
              {(plan?.etapas || []).filter((item) => OPTIONAL_PHASES.includes(item.etapa)).map((item) => {
                const Icon = ICONS[item.etapa] || Puzzle;
                const isSelected = selected === item.etapa;
                const isApproved = item.estado === 'aprobada';
                return (
                  <button
                    key={item.etapa}
                    onClick={() => { setSelected(item.etapa); setSuggestionMeta(null); }}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#F8F4FF] text-[#6D28D9] font-bold'
                        : isApproved
                        ? 'text-slate-800 font-semibold hover:bg-slate-50/80'
                        : 'text-slate-500 font-medium hover:bg-slate-50/80'
                    }`}
                    title={`${item.titulo} (Opcional)`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      isApproved
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-300 bg-white text-slate-500'
                    }`}>
                      {isApproved ? <Check size={12} strokeWidth={3} /> : <Icon size={11} />}
                    </span>
                    <span className="truncate">{item.titulo}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </aside>

      {/* SECCIÓN DERECHA: Misma altura y estructura de cabecera que la Fase 2 */}
      <div className="w-full flex-1 overflow-y-auto min-h-0 pt-6 pb-10 px-6 md:px-12 flex flex-col bg-white">
        <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
          {/* Cabecera superior unificada de Fase 3 (idéntica en altura a Fase 2) */}
          <div className="pb-3 mb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wider block">
                Fase 3: Planificación de la Codificación
              </span>
              <h2 className="text-xl font-normal text-slate-900 tracking-tight mt-0.5">
                Decisiones técnicas de {projectName || 'proyecto'}
              </h2>
            </div>

            <button
              onClick={onBackToDiagrams}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Volver a Diagramas y Mockups
            </button>
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
                Aprueba cada decisión antes de habilitar la generación del código.
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
                    Genera, verifica y aprueba secuencialmente el backend, frontend, pruebas, infraestructura, pipeline CI/CD y paquete final.
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
                    <button disabled={busy} onClick={generateFrontend} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"><Code2 size={15} />{frontendArtifact ? 'Regenerar frontend' : 'Generar frontend'}</button>
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
                      {deliveryArtifact.estado === 'en_revision' && <>{mockupFormWaiver(deliveryArtifact.verificacion) && <label className="mr-auto flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={permissive} onChange={(event) => setPermissive(event.target.checked)} />Modo permisivo: aprobar aunque fallen los formularios del mockup.</label>}<button disabled={busy} onClick={() => reviewDelivery('rechazar')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button><button disabled={busy} onClick={() => reviewDelivery('aprobar')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar entrega</button></>}
                      {deliveryArtifact.aprobado && <button disabled={busy} onClick={downloadDelivery} className="flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white"><Download size={14} />Descargar ZIP</button>}
                    </div>
                  </div>}
                </div>
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
              {current && <>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-600 leading-tight max-w-[180px]">
                      Compuerta de decisión activa
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
                  <PhaseForm phase={selected} modules={plan?.modulos} value={drafts[selected] || {}} disabled={busy || current.estado === 'bloqueada'} onChange={(value) => setDrafts((old) => ({ ...old, [selected]: value }))} />
                </div>
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
          onArtifactChange({ ...artifact, verificacion: data.verificacion });
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
      <span className="font-semibold text-slate-700">Verificación aislada (Docker): {result?.estado || (job?.estado === 'procesando' ? 'en ejecución…' : 'pendiente')}</span>
      <button type="button" disabled={loading} onClick={verify} className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-1.5 font-semibold text-violet-700 hover:bg-violet-100/60 disabled:opacity-50 transition cursor-pointer">
        {loading ? <Loader2 size={13} className="animate-spin" /> : null}
        {loading ? (job?.mensaje || 'Verificando en contenedor…') : 'Verificar artefacto'}
      </button>
    </div>

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
    case 'calculo': return `«${rule.campo}» se calcula con ${JSON.stringify(rule.expresion)} (${rule.decimales} decimales). Solo se ejecuta tras confirmar la regla.`;
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
                {permisos.some((item) => item.operacion === operation.id && item.rol === role.id) && <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                  <input type="checkbox" disabled={disabled} checked={ownOnly(operation.id, role.id)} onChange={() => toggleOwn(operation.id, role.id)} />Solo registros propios
                </label>}
              </div></td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
  </div>;
}

function ModulesEditor({ value, onChange, disabled, modules }) {
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
  const setMode = (next) => onChange({ ...value, modo: next, modulos: optional.map((item) => ({ id: item.id, activo: next === 'automatico' ? item.porDefecto : stateOf(item.id) })) });
  const toggle = (id, active) => onChange({ ...value, modo: 'personalizado', modulos: optional.map((item) => ({ id: item.id, activo: item.id === id ? active : stateOf(item.id) })) });
  return <div className="space-y-5">
    <CoverageEditor value={value.cobertura || {}} onChange={(cobertura) => onChange({ ...value, cobertura })} disabled={disabled} modules={modules} />
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-semibold text-slate-700">Modo</legend>
      <label className="flex items-start gap-2 text-sm"><input type="radio" name="modo-modulos" disabled={disabled} checked={mode === 'automatico'} onChange={() => setMode('automatico')} className="mt-1" /><span><span className="font-medium text-slate-800">Automático (recomendado)</span><span className="block text-xs text-slate-500">Usa los módulos recomendados. Es lo que se genera si no apruebas esta etapa.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="radio" name="modo-modulos" disabled={disabled} checked={mode === 'personalizado'} onChange={() => setMode('personalizado')} className="mt-1" /><span><span className="font-medium text-slate-800">Personalizado</span><span className="block text-xs text-slate-500">Tú decides qué módulos opcionales se incluyen.</span></span></label>
    </fieldset>
    <section>
      <h3 className="mb-2 text-xs font-semibold text-slate-700">Módulos opcionales</h3>
      {optional.length === 0 ? <p className="text-xs text-slate-500">No hay módulos opcionales disponibles.</p> : <ul className="space-y-2">{optional.map((item) => <li key={item.id} className="rounded-lg border border-slate-200 p-3">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={disabled || mode === 'automatico'} checked={stateOf(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} className="mt-1" />
          <span><span className="font-medium text-slate-800">{item.etiqueta}</span><span className="ml-2 text-[10px] text-slate-500">{item.porDefecto ? 'recomendado' : 'no recomendado por defecto'}</span>
            <span className="block text-xs text-slate-600">{item.descripcion}</span>
            {item.sinEfecto && <span className="block text-xs text-slate-500">{item.sinEfecto}</span>}</span></label>
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
    <section>
      <h3 className="mb-2 text-xs font-semibold text-slate-700">Incluido según otras etapas</h3>
      <ul className="space-y-1">{included.map((item) => <li key={item.id} className="flex items-start gap-2 text-xs">
        <span aria-hidden="true" className={item.activo ? 'text-emerald-600' : 'text-slate-400'}>{item.activo ? '✓' : '—'}</span>
        <span className={item.activo ? 'text-slate-700' : 'text-slate-400'}><span className="font-medium">{item.etiqueta}</span> — {item.motivo}</span>
      </li>)}</ul>
    </section>
  </div>;
}

function CoverageEditor({ value, onChange, disabled, modules }) {
  const requirements = modules?.requisitos || [];
  const catalog = modules?.capacidades || [];
  const declaration = (rf) => (value.requisitos || []).find((item) => item.requisito === rf.identificador) || {
    requisito: rf.identificador, tipo: rf.sugerencias?.length ? 'personalizado' : 'crud',
    capacidades: (rf.sugerencias || []).map((item) => item.id), confirmado: false, justificacion: ''
  };
  const update = (rf, changes) => {
    const current = declaration(rf);
    const next = { ...current, confirmado: false, ...changes, huella_requisito: rf.huella_requisito };
    onChange({ ...value, requisitos: [...(value.requisitos || []).filter((item) => item.requisito !== rf.identificador), next] });
  };
  return <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-3">
    <h3 className="text-sm font-semibold text-slate-800">Alcance de la entrega</h3>
    <p className="text-xs text-slate-600">El arranque y las pruebas técnicas no certifican todo el negocio. Declara qué necesita cada RF. Las capacidades pendientes no se activan al seleccionarlas.</p>
    <label className="block text-xs font-medium">Modalidad
      <select disabled={disabled} className="mt-1 block w-full rounded border p-2" value={value.modo_entrega || 'parcial'} onChange={(event) => onChange({ ...value, modo_entrega: event.target.value })}>
        <option value="parcial">Parcial: incluir pendientes en el informe</option>
        <option value="completa">Completa: resolver la cobertura del generador</option>
      </select>
    </label>
    {(value.modo_entrega || 'parcial') === 'parcial' && <label className="flex gap-2 text-xs">
      <input disabled={disabled} type="checkbox" checked={value.aceptar_pendientes !== false} onChange={(event) => onChange({ ...value, aceptar_pendientes: event.target.checked })} />
      Reconozco que la entrega puede tener funciones pendientes; revisaré su informe antes de aprobarla.
    </label>}
    {requirements.map((rf) => {
      const item = declaration(rf);
      return <details key={rf.identificador} className="rounded border bg-white p-2">
        <summary className="cursor-pointer text-xs font-medium">{rf.identificador} · {rf.nombre} — {item.confirmado && item.huella_requisito === rf.huella_requisito ? 'confirmado' : 'por revisar'}</summary>
        <label className="mt-2 block text-xs">Comportamiento
          <select disabled={disabled} className="mt-1 w-full rounded border p-2" value={item.tipo} onChange={(event) => update(rf, { tipo: event.target.value })}>
            <option value="crud">Gestión CRUD con las reglas declaradas</option><option value="personalizado">Proceso específico que requiere implementación adicional</option>
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Sugerencias del texto: {(rf.sugerencias || []).map((capability) => capability.etiqueta).join(', ') || 'ninguna; esto no demuestra cobertura'}</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">{catalog.map((capability) => <label key={capability.id} className="flex gap-2 text-xs">
          <input disabled={disabled} type="checkbox" checked={item.capacidades.includes(capability.id)} onChange={(event) => update(rf, { capacidades: event.target.checked ? [...item.capacidades, capability.id] : item.capacidades.filter((id) => id !== capability.id) })} />
          {capability.etiqueta} (pendiente)
        </label>)}</div>
        <label className="mt-2 block text-xs">Justificación si descartas alguna sugerencia
          <textarea disabled={disabled} className="mt-1 w-full rounded border p-2" value={item.justificacion || ''} onChange={(event) => update(rf, { justificacion: event.target.value })} />
        </label>
        <label className="mt-2 flex gap-2 text-xs"><input disabled={disabled} type="checkbox" checked={item.confirmado && item.huella_requisito === rf.huella_requisito} onChange={(event) => update(rf, { confirmado: event.target.checked })} />Confirmo esta declaración para la versión actual del RF.</label>
      </details>;
    })}
    {!requirements.length && <p className="text-xs text-slate-500">Reabre el plan para cargar los RF aprobados.</p>}
  </section>;
}

function PhaseForm({ phase, value, onChange, disabled, modules }) {
  if (phase === 'modulos') return <ModulesEditor value={value} onChange={onChange} disabled={disabled} modules={modules} />;
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
