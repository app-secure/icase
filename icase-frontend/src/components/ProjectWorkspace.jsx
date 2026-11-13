import React, { useState } from "react";
import { ArrowLeft, Files, FileText, Pencil, PanelLeft } from "lucide-react";
import { RequirementsReferencePanel } from "./ApprovedRequirementsSidebar";
import RbixLogo from "./RbixLogo";
import SourcesPanel from "./SourcesPanel";
import RequirementsView from "./RequirementsView";
import InitialAnalysisView from './InitialAnalysisView';
import AnalysisFlowProgress from './AnalysisFlowProgress';
import RequirementJobStatus from './RequirementJobStatus';
import DiagramsView from "./DiagramsView";
import DocumentViewer from "./DocumentViewer";
import CodePlanningView from "./CodePlanningView";
import { ToastContainer, useToasts } from "./Toast";
import {
  createProjectApi,
  updateProjectApi,
  uploadFuenteApi,
  updateFuenteApi,
  suggestFuenteMetadataApi,
  deleteFuenteApi,
  fetchFuentesApi,
  processWithAiApi,
  startRequirementJobApi,
  fetchRequirementJobApi,
  fetchLatestRequirementJobApi,
  resumeRequirementJobApi,
  fetchInitialAnalysisApi,
  initialAnalysisActionApi,
  startDiagramJobApi,
  fetchDiagramJobApi,
  fetchLatestDiagramJobApi,
  approvePhaseApi,
  reviewRequirementsApi,
  resolveRequirementNeedApi,
  approveDiagramApi,
  rejectDiagramApi,
  updateDiagramApi,
  fetchDiagramVersionsApi,
  restoreDiagramVersionApi,
  fetchDiagramWorkflowApi,
  fetchAiModelsApi,
  fetchMockupsApi,
  updateMockupApi,
  syncProjectRequirementsApi
} from "../services/api";
import { sanitizePlantUML } from "../utils/plantumlEncoder";
import { DIAGRAM_TYPES } from "../constants/diagramTypes";
import { completedDiagramAlreadyLoaded } from '../utils/diagramJobRecovery';

const DIAGRAM_KEY_BY_TYPE = Object.freeze({
  [DIAGRAM_TYPES.USE_CASES]: "useCase",
  [DIAGRAM_TYPES.DOMAIN_CLASSES]: "classDiagram",
  [DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE]: "architecture",
  [DIAGRAM_TYPES.SYSTEM_ARCHITECTURE]: "systemArchitecture",
  [DIAGRAM_TYPES.DESIGN_CLASSES]: "designClassDiagram",
  [DIAGRAM_TYPES.NAVIGATION_TREE]: "navigationTree"
});

const extractInsumoBruto = async (sources) => {
  let insumoBruto = "";
  for (const s of (sources || [])) {
    let text = s.contentSnippet || s.snippet || "";
    // Solo intentar leer con FileReader texto plano si es de tipo 'txt'
    if (!text && s.rawFile && s.type === "txt" && typeof s.rawFile.text === "function") {
      try {
        text = await s.rawFile.text();
        s.contentSnippet = text;
      } catch (e) {
        console.warn("Error leyendo archivo en navegador:", e);
      }
    }
    if (text && text.trim()) {
      const sourceContext = [
        `Archivo: ${s.name}`,
        `Categoría: ${s.category || s.type}`,
        `Tipo de contenido: ${s.contentType || "Sin especificar"}`,
        s.description ? `Descripción ${s.aiMetadata ? "sugerida por IA" : "registrada en la fuente"}: ${s.description}` : "",
        s.authorOrigin ? `Autor u origen: ${s.authorOrigin}` : "",
        s.documentDate ? `Fecha del contenido: ${s.documentDate}` : "",
        s.tags?.length ? `Etiquetas: ${s.tags.join(", ")}` : "",
        s.type === "audio" ? `Transcripción revisada por el usuario: ${s.transcriptionVerified ? "sí" : "no"}` : ""
      ].filter(Boolean).join("\n");
      insumoBruto += `[Fuente enriquecida]\n${sourceContext}\n\n[Contenido extraído]\n${text.trim()}\n\n---\n\n`;
    }
  }
  return insumoBruto.trim();
};

const generateDefaultPuml = (type, name = "Sistema I-CASE") => {
  const safeName = (name || "Sistema I-CASE").replace(/["“”]/g, "'");
  switch (type) {
    case "unavailable":
      return `@startuml\ntitle Diagrama no disponible - ${safeName}\nnote "El código generado no está disponible. Regenera este diagrama." as N1\n@enduml`;
    case "useCase":
      return `@startuml
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome

actor "Operador Principal" as Operador
actor "Administrador" as Admin

rectangle "${safeName}" {
  usecase "Control y Registro Operativo" as UC1
  usecase "Despacho y Coordinación" as UC2
  usecase "Liquidación y Facturación" as UC3
  usecase "Auditoría y Reportes Diarios" as UC4
}

Operador --> UC1
Operador --> UC2
Admin --> UC3
Admin --> UC4

UC1 .> UC2 : <<include>>
UC3 .> UC1 : <<include>>
@enduml`;

    case "architecture":
      return `@startuml
title Arquitectura no disponible - ${safeName}
note "El código generado no está disponible. Regenera este diagrama para evitar componentes no sustentados." as N1
@enduml`;

    case "classDiagram":
      return `@startuml
skinparam classAttributeIconSize 0

class UsuarioSistema {
  +int idUsuario
  +String nombreCompleto
  +String rol
  +String correo
  +autenticar(): boolean
  +verificarPermisos(modulo: String): boolean
}

class RegistroOperativo {
  +String idOperacion
  +DateTime fechaHora
  +String estado
  +float valorCalculado
  +String observaciones
  +procesar(): boolean
  +validarReglas(): boolean
  +anular(motivo: String): void
}

class ControlCalidad {
  +String idControl
  +DateTime fechaInspeccion
  +float parametroMedido
  +boolean cumpleNorma
  +registrarResultado(): boolean
}

class MetricaConsolidada {
  +String idReporte
  +DateTime periodoInicio
  +DateTime periodoFin
  +float totalProcesado
  +generarResumen(): Documento
}

UsuarioSistema "1" -- "*" RegistroOperativo : registra
RegistroOperativo "1" *-- "1..*" ControlCalidad : valida
UsuarioSistema "1" -- "*" MetricaConsolidada : emite
@enduml`;

    case "navigationTree":
      return `@startmindmap
* ${safeName}
** Portal de Acceso
*** Inicio de Sesión
*** Recuperación de Contraseña
** Panel Principal
*** Tablero Principal
*** Alertas y Notificaciones
** Módulo de Pedidos
*** Listado de Pedidos
*** Detalle de Pedido
*** Formulario de Nuevo Pedido
** Módulo de Despacho
*** Listado de Despachos
*** Programación de Entrega
** Administración
*** Gestión de Usuarios
*** Gestión de Roles y Permisos
*** Configuración del Sistema
@endmindmap`;

    default:
      return `@startuml\nactor Usuario\nrectangle Sistema {\n  usecase Proceso\n}\nUsuario --> Proceso\n@enduml`;
  }
};

const transformAiOutput = (aiResult, fallbackName = "Sistema", existingDiagrams = {}) => {
  let reqs = null;
  let diags = null;

  if (aiResult && (aiResult.requerimientos?.length || aiResult.diagramas?.length)) {
    const seenIds = new Set();
    let rfCount = 1;
    let rnfCount = 1;

    const funcReqs = (aiResult.requerimientos || [])
      .filter(r => (r.tipo || "").toUpperCase() === "RF")
      .map((r) => {
        let id = String(r.identificador || r.id || "").trim();
        if (!id || seenIds.has(id)) {
          id = `RF-${String(rfCount++).padStart(2, "0")}`;
          while (seenIds.has(id)) {
            id = `RF-${String(rfCount++).padStart(2, "0")}`;
          }
        }
        seenIds.add(id);

        return {
          id,
          name: r.nombre || "Requerimiento Funcional",
          description: r.descripcion || "",
          dependencies: r.dependencias || "Ninguna",
          actors: Array.isArray(r.actores) ? r.actores : [],
          priority: r.prioridad || "Alta",
          precondition: r.precondiciones || "",
          postcondition: r.poscondiciones || "",
          origin: r.origen || "inferido",
          evidence: r.evidencia || "",
          evidences: r.evidencias || [],
          decisionStatus: r.estado_decision || (r.requiere_confirmacion ? 'pendiente' : 'confirmado'),
          excludedConstraints: r.restricciones_excluidas || [],
          sourceNames: Array.isArray(r.fuentes_origen) ? r.fuentes_origen : [],
          needIds: r.necesidades_origen || [],
          acceptanceCriteria: r.criterios_aceptacion || [],
          ruleIds: r.reglas_relacionadas || [],
          requiresConfirmation: Boolean(r.requiere_confirmacion),
          approved: Boolean(r.aprobado)
        };
      });

    const nonFuncReqs = (aiResult.requerimientos || [])
      .filter(r => (r.tipo || "").toUpperCase() === "RNF")
      .map((r) => {
        let id = String(r.identificador || r.id || "").trim();
        if (!id || seenIds.has(id)) {
          id = `RNF-${String(rnfCount++).padStart(2, "0")}`;
          while (seenIds.has(id)) {
            id = `RNF-${String(rnfCount++).padStart(2, "0")}`;
          }
        }
        seenIds.add(id);

        return {
          id,
          category: r.nombre || "Requisito No Funcional",
          description: r.descripcion || "",
          dependencies: r.dependencias || "Ninguna",
          priority: r.prioridad || "Alta",
          metric: r.metrica_medible || "Por confirmar con el usuario",
          compliance: r.requiere_confirmacion ? "Pendiente de confirmación" : "Trazado al insumo",
          origin: r.origen || "inferido",
          evidence: r.evidencia || "",
          evidences: r.evidencias || [],
          decisionStatus: r.estado_decision || (r.requiere_confirmacion ? 'pendiente' : 'confirmado'),
          excludedConstraints: r.restricciones_excluidas || [],
          sourceNames: Array.isArray(r.fuentes_origen) ? r.fuentes_origen : [],
          needIds: r.necesidades_origen || [],
          acceptanceCriteria: r.criterios_aceptacion || [],
          ruleIds: r.reglas_relacionadas || [],
          requiresConfirmation: Boolean(r.requiere_confirmacion),
          approved: Boolean(r.aprobado)
        };
      });

    reqs = {
      functional: funcReqs,
      nonFunctional: nonFuncReqs
    };

    const diagramList = aiResult.diagramas || [];
    const latestMatching = (predicate) => diagramList
      .filter((diagram) => predicate(String(diagram.tipo || "").toLowerCase()))
      .sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
    const ucDiag = latestMatching((type) => type.includes("caso"));
    const archDiag = latestMatching((type) => (type === "arquitectura" || type.includes("software")) && !type.includes("sistema"));
    const systemArchDiag = latestMatching((type) => type.includes("arquitectura_sistema"));
    const classDiag = latestMatching((type) => (type === "clases" || type.includes("clases_dominio") || type.includes("entidad")) && !type.includes("diseno"));
    const designClassDiag = latestMatching((type) => type.includes("clases_diseno"));
    const navDiag = latestMatching((type) => type.includes("arbol") || type.includes("nav"));

    const extractPuml = (diagObj, typeKey) => {
      const code = diagObj?.codigo_plantuml || diagObj?.codigo_puml || diagObj?.plantumlCode;
      if (code && typeof code === "string" && code.trim().length > 15) {
        return sanitizePlantUML(code);
      }
      if (existingDiagrams?.[typeKey]?.plantumlCode && existingDiagrams[typeKey].plantumlCode.trim().length > 15) {
        return sanitizePlantUML(existingDiagrams[typeKey].plantumlCode);
      }
      return generateDefaultPuml("unavailable", fallbackName);
    };

    const mapDiagram = (diag, key, fallbackTitle, type) => {
      if (!diag && !existingDiagrams?.[key]) return null;
      const existing = existingDiagrams?.[key] || {};
      const source = diag || existing;
      const code = extractPuml(diag, key);
      return {
        ...existing,
        id: source.id || source._id || existing.id,
        title: (source.titulo || source.title || fallbackTitle).replace(/\s*\([^)]*\)/g, '').trim(),
        type,
        code,
        plantumlCode: code,
        description: source.descripcion || source.description || "",
        descripcion_jerarquica: Array.isArray(source.descripcion_jerarquica) ? source.descripcion_jerarquica : [],
        trazabilidad_rnf: Array.isArray(source.trazabilidad_rnf) ? source.trazabilidad_rnf : (existing.trazabilidad_rnf || []),
        approved: Boolean(source.aprobado ?? source.approved),
        status: source.estado || source.status || (source.aprobado ? "aprobado" : "pendiente_revision"),
        stale: Boolean(source.desactualizado ?? source.stale),
        version: Number(source.version || existing.version || 1),
        staleReasons: source.motivos_desactualizacion || source.staleReasons || [],
        originVersions: source.versiones_origen || source.originVersions || {},
        approvedAt: source.aprobado_en || source.approvedAt || null,
        approvedBy: source.aprobado_por || source.approvedBy || null,
        qualityStatus: source.estado_calidad || source.qualityStatus || null,
        validationErrors: source.errores_validacion || source.validationErrors || [],
        validationWarnings: source.advertencias_validacion || source.validationWarnings || [],
        validationMetrics: source.metricas_validacion || source.validationMetrics || {},
        reviewHistory: source.revisiones || source.reviewHistory || [],
        restoredFromVersion: source.restaurada_desde_version || source.restoredFromVersion || null
      };
    };

    diags = Object.fromEntries(Object.entries({
      useCase: mapDiagram(ucDiag, "useCase", "Diagrama de Casos de Uso", "casos_de_uso"),
      classDiagram: mapDiagram(classDiag, "classDiagram", "Diagrama de Clases del Dominio", "clases_dominio"),
      architecture: mapDiagram(archDiag, "architecture", "Arquitectura de Software", "arquitectura_software"),
      systemArchitecture: mapDiagram(systemArchDiag, "systemArchitecture", "Arquitectura del Sistema", "arquitectura_sistema"),
      designClassDiagram: mapDiagram(designClassDiag, "designClassDiagram", "Diagrama de Clases de Diseño", "clases_diseno"),
      navigationTree: mapDiagram(navDiag, "navigationTree", "Árbol de Navegación del Sistema", "arbol_navegacion")
    }).filter(([, diagram]) => Boolean(diagram)));
  }

  return { reqs, diags };
};

export default function ProjectWorkspace({
  project: rawProject,
  user,
  onLogout,
  onUpdateProject,
  onBackToDashboard
}) {
  const defaultEmptyProject = {
    id: "draft-" + Date.now(),
    name: "Proyecto sin nombre",
    description: "",
    currentPhase: 0,
    isProcessed: false,
    isAnalysisApproved: false,
    isDiagramsApproved: false,
    isMockupsApproved: false,
    sources: [],
    requirements: { functional: [], nonFunctional: [] },
    diagrams: {}
  };

  const project = rawProject || defaultEmptyProject;

  const [isProcessing, setIsProcessing] = useState(false);
  const [resilientRequirements, setResilientRequirements] = useState(false);
  const [requirementJob, setRequirementJob] = useState(null);
  const [initialState, setInitialState] = useState(null);
  const [showInitial, setShowInitial] = useState(false);
  const [initialBusy, setInitialBusy] = useState(false);
  const [initialDirty, setInitialDirty] = useState(false);
  const canLeaveInitial = () => !showInitial || !initialDirty || window.confirm('Hay cambios del análisis sin guardar. ¿Salir sin guardarlos?');
  React.useEffect(() => {
    if (!initialDirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [initialDirty]);
  const [initialProposal, setInitialProposal] = useState(null);
  const projectBackendId = project.backendId || (/^[a-f\d]{24}$/i.test(project.id || '') ? project.id : null);
  const loadInitial = async () => {
    if (!projectBackendId) return null;
    const state = await fetchInitialAnalysisApi(projectBackendId); setInitialState(state); return state;
  };
  React.useEffect(() => {
    let active = true; setInitialState(null); setShowInitial(false); setInitialProposal(null);
    if (projectBackendId) fetchInitialAnalysisApi(projectBackendId).then(state => {
      if (!active) return; setInitialState(state);
      if (state.version_flujo === 2 && !project.isProcessed && (state.borrador || state.aprobado)) setShowInitial(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [projectBackendId]);
  const initialAction = async action => { setInitialBusy(true); try { return await action(); } finally { setInitialBusy(false); } };
  const appliedRequirementJobs = React.useRef(new Set());
  const [processProgress, setProcessProgress] = useState(0);
  const [processStage, setProcessStage] = useState("");
  const { toasts, addToast, removeToast } = useToasts();
  const [alertModal, setAlertModal] = useState(null);
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const [diagramJob, setDiagramJob] = useState(null);
  const handledDiagramJobs = React.useRef(new Set());
  const diagramPollingFailures = React.useRef(0);
  const [selectedAiProvider, setSelectedAiProvider] = useState("auto");
  const [availableProviders, setAvailableProviders] = useState([]);
  const [isRequirementsSidebarOpen, setIsRequirementsSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const [isManagingSources, setIsManagingSources] = useState(false);
  const [progressHidden, setProgressHidden] = useState(false);
  const progressScroll = React.useRef({ target: null, top: 0, movement: 0, until: 0 });
  React.useEffect(() => {
    setProgressHidden(false);
    progressScroll.current = { target: null, top: 0, movement: 0, until: 0 };
  }, [project.id, project.currentPhase, showInitial, isManagingSources]);
  const handleProgressScroll = event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('textarea, input, pre, dialog, [role="dialog"]') || target.scrollHeight - target.clientHeight < 80) return;
    const previous = progressScroll.current;
    const top = target.scrollTop;
    const delta = top - (previous.target === target ? previous.top : 0);
    const movement = Math.sign(delta) === Math.sign(previous.movement) ? previous.movement + delta : delta;
    progressScroll.current = { ...previous, target, top, movement };
    if (Date.now() < previous.until) return;
    const hide = top > 80 && movement > 20;
    const reveal = top <= 2;
    if (hide || reveal) {
      const next = hide && !reveal;
      if (next !== progressHidden && !event.currentTarget.querySelector('nav:focus-within')) {
        setProgressHidden(next);
        progressScroll.current.until = Date.now() + 220;
        progressScroll.current.movement = 0;
      }
    }
  };
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isReviewingRequirements, setIsReviewingRequirements] = useState(false);

  const cleanProjectTitle = (name) => {
    if (!name || name === "Proyecto sin nombre") return "Nuevo Proyecto";
    const cleaned = name
      .replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de)\s+/i, "")
      .trim();
    return cleaned ? (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) : name;
  };

  const handleStartEditName = () => {
    setEditedName(cleanProjectTitle(project.name));
    setIsEditingName(true);
  };

  const handleSaveEditName = () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== project.name) {
      handleUpdateProjectName(trimmed);
    }
    setIsEditingName(false);
  };

  const applyDiagramJobResponse = React.useCallback((response) => {
    const job = response?.trabajo;
    if (!job) return;
    diagramPollingFailures.current = 0;
    setDiagramJob(job);
    setIsGeneratingDiagrams(['encolado', 'procesando'].includes(job.estado));
    if (job.estado === 'completado' && response.resultado && !handledDiagramJobs.current.has(job.id)) {
      handledDiagramJobs.current.add(job.id);
      const current = project;
      if (completedDiagramAlreadyLoaded(job, response.resultado, current.diagrams, DIAGRAM_KEY_BY_TYPE)) return;
      const { diags } = transformAiOutput(response.resultado, current.name, current.diagrams || {});
      onUpdateProject({
        ...current,
        isAnalysisApproved: true,
        diagrams: diags,
        diagramFlow: response.resultado.flujoDiagramas || current.diagramFlow,
        currentPhase: 2
      });
    }
  }, [onUpdateProject, project]);

  React.useEffect(() => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return undefined;
    let cancelled = false;
    fetchLatestDiagramJobApi(backendId)
      .then((response) => { if (!cancelled) applyDiagramJobResponse(response); })
      .catch((error) => console.warn('[Workspace] No se pudo recuperar el trabajo de diagrama:', error.message));
    return () => { cancelled = true; };
  }, [project.backendId, project.id, applyDiagramJobResponse]);

  React.useEffect(() => {
    if (!diagramJob?.id || !['encolado', 'procesando'].includes(diagramJob.estado)) return undefined;
    const timer = setInterval(() => {
      fetchDiagramJobApi(diagramJob.id)
        .then(applyDiagramJobResponse)
        .catch((error) => {
          diagramPollingFailures.current += 1;
          console.warn('[Workspace] Error consultando trabajo de diagrama:', error.message);
          if (diagramPollingFailures.current >= 3) {
            setIsGeneratingDiagrams(false);
            setDiagramJob((current) => current ? {
              ...current,
              mensaje: 'No se pudo consultar el avance. La tarea continúa en el servidor; recarga para recuperar su estado.'
            } : current);
          }
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [diagramJob?.id, diagramJob?.estado, applyDiagramJobResponse]);

  React.useEffect(() => {
    fetchAiModelsApi(project.isAnalysisApproved ? null : 'requisitos')
      .then((data) => {
        if (data?.proveedores?.length) {
          setResilientRequirements(data.requisitos_resilientes === true);
          setAvailableProviders(data.proveedores);
          const defaultProvId = data.provider_defecto || "auto";
          const matchProv = data.proveedores.find((p) => p.id === defaultProvId && p.disponible !== false);
          setSelectedAiProvider(matchProv ? matchProv.id : "auto");
        }
      })
      .catch((err) => {
        console.warn("[Workspace] Error consultando modelos de IA:", err);
      });
  }, [project.isAnalysisApproved]);

  React.useEffect(() => {
    const id = project.backendId || (project.id?.length === 24 ? project.id : null);
    if ((!resilientRequirements && project.analysisFlowVersion !== 2) || !id) return;
    let active = true;
    fetchLatestRequirementJobApi(id).then(job => { if (active) setRequirementJob(job); }).catch(() => {});
    return () => { active = false; };
  }, [resilientRequirements, project.backendId, project.id, project.isAnalysisApproved]);

  React.useEffect(() => {
    if (!requirementJob?.id || String(requirementJob.proyecto_id) !== String(project.backendId || project.id)) return;
    if (requirementJob.operacion === 'analisis_respuesta') return;
    if (project.isAnalysisApproved && !['analisis_inicial', 'correccion_analisis_inicial', 'revision_calidad'].includes(requirementJob.operacion)) return;
    if (requirementJob.estado === 'completado') {
      if (!appliedRequirementJobs.current.has(requirementJob.id)) {
        appliedRequirementJobs.current.add(requirementJob.id);
        if (['analisis_inicial', 'correccion_analisis_inicial', 'revision_calidad'].includes(requirementJob.operacion)) {
          if (['correccion_analisis_inicial', 'revision_calidad'].includes(requirementJob.operacion)) setInitialProposal({ ...requirementJob.resultado_analisis_inicial, trabajo_id: requirementJob.id });
          loadInitial().then(() => { setShowInitial(true); setIsManagingSources(false); }).catch(error => setAlertModal({ title: 'No se pudo cargar el análisis', message: error.message }));
          return;
        }
        const result = requirementJob.resultado_requisitos;
        if (result) {
          const { reqs } = transformAiOutput(result, project.name, project.diagrams);
          onUpdateProject({ ...project, requirements: reqs, requirementAudit: result.auditoria_requisitos, isProcessed: true,
            currentPhase: 1, isAnalysisApproved: false, isDiagramsApproved: false, isMockupsApproved: false,
            diagrams: project.analysisFlowVersion === 2 ? project.diagrams : {}, mockups: project.analysisFlowVersion === 2 ? project.mockups : [], name: result.nombre_proyecto || project.name });
          setShowInitial(false);
          setIsManagingSources(false);
        }
      }
      return;
    }
    if (!['encolado', 'procesando'].includes(requirementJob.estado)) return;
    let active = true, polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try { const next = await fetchRequirementJobApi(requirementJob.id); if (active) setRequirementJob(next); }
      catch { if (active) setProcessStage('No se pudo consultar el avance; el trabajo sigue guardado.'); }
      finally { polling = false; }
    }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [requirementJob, project, onUpdateProject]);

  const resumeRequirements = async () => {
    try {
      const next = await resumeRequirementJobApi(requirementJob.id);
      setRequirementJob({ ...next, estado: ['esperando_proveedor', 'interrumpido'].includes(next.estado) ? 'encolado' : next.estado });
    } catch (error) { setAlertModal({ title: 'No se pudo reanudar', message: error.message }); }
  };

  // Subida / Eliminación de fuentes
  const handleAddSource = async (newSource) => {
    const currentSources = project.sources || [];
    
    // Evitar fuentes duplicadas en la lista comparando por nombre de archivo
    const existingIndex = currentSources.findIndex((s) => s.name === newSource.name);
    let updatedSources;
    if (existingIndex >= 0) {
      updatedSources = [...currentSources];
      updatedSources[existingIndex] = { ...currentSources[existingIndex], ...newSource, isUploading: true };
    } else {
      updatedSources = [{ ...newSource, isUploading: true }, ...currentSources];
    }

    let updatedName = project.name;
    if (!updatedName || updatedName === "Proyecto sin nombre") {
      const cleanName = newSource.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      updatedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    let backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);

    // 1. Notificar inmediatamente la fuente para que aparezca en pantalla sin demoras
    onUpdateProject({
      ...project,
      id: backendId || project.id,
      backendId,
      name: updatedName,
      sources: updatedSources
    });

    let uploadError = null;
    // 2. Si no existe ID en backend, crearlo para poder asociar y procesar fuentes de inmediato
    if (!backendId) {
      try {
        const created = await createProjectApi({
          nombre: updatedName,
          descripcion: project.description || "Especificación generada por I-CASE asistida por IA"
        });
        if (created && (created.id || created._id)) {
          backendId = created.id || created._id;
          // Actualizar inmediatamente con el nuevo backendId
          onUpdateProject({
            ...project,
            id: backendId,
            backendId,
            name: updatedName,
            sources: updatedSources
          });
        }
      } catch (errCreate) {
        console.warn("[Workspace] Error inicializando proyecto en backend:", errCreate);
        uploadError = errCreate;
      }
    }

    // 3. Si viene archivo real, subir al backend para que extraiga el texto (PDF o Audio)
    if (backendId && newSource.rawFile) {
      try {
        const uploaded = await uploadFuenteApi(backendId, newSource.rawFile);
        if (uploaded) {
          if (!(uploaded.id || uploaded._id)) throw new Error("El servidor no confirmó el guardado de la fuente.");
          const finalSources = updatedSources.map((s) => {
            if (s.name === newSource.name || s.id === newSource.id) {
              return {
                ...s,
                id: uploaded.id || uploaded._id || s.id,
                uploaded: true,
                uploadError: null,
                isUploading: false,
                rawFile: null,
                contentSnippet: uploaded.texto_transcrito || s.contentSnippet,
                category: uploaded.categoria || s.category,
                contentType: uploaded.tipo_contenido || s.contentType || "",
                description: uploaded.descripcion || s.description || "",
                authorOrigin: uploaded.autor_origen || s.authorOrigin || "",
                documentDate: uploaded.fecha_documento || s.documentDate || "",
                documentDateSource: uploaded.fecha_documento_origen || s.documentDateSource || "",
                tags: Array.isArray(uploaded.etiquetas) ? uploaded.etiquetas : (s.tags || []),
                transcriptionVerified: Boolean(uploaded.transcripcion_verificada)
              };
            }
            return s;
          });

          onUpdateProject({
            ...project,
            id: backendId,
            backendId,
            name: updatedName,
            sources: finalSources
          });
          return finalSources.find((source) => source.name === newSource.name || source.id === newSource.id);
        }
        uploadError = new Error("El servidor no confirmó el guardado de la fuente.");
      } catch (err) {
        console.warn("[Workspace] Error subiendo fuente al backend:", err);
        uploadError = err;
      }
    }

    const failureMessage = (uploadError || new Error("No se pudo guardar la fuente en el servidor. Vuelve a subir el archivo.")).message;
    // Conservar el archivo para reintentar, pero nunca presentarlo como persistido.
    const finalizedSources = updatedSources.map((s) =>
      s.name === newSource.name || s.id === newSource.id
        ? { ...s, isUploading: false, uploaded: false, uploadError: failureMessage }
        : s
    );
    onUpdateProject({
      ...project,
      id: backendId || project.id,
      backendId: backendId || project.backendId,
      name: updatedName,
      sources: finalizedSources
    });
    throw new Error(failureMessage);
  };

  const handleDeleteSource = async (sourceId) => {
    const sourceToDelete = (project.sources || []).find((s) => s.id === sourceId);
    const updatedSources = (project.sources || []).filter((s) => s.id !== sourceId);

    // Actualizar estado local inmediatamente para respuesta instantánea de UI
    onUpdateProject({
      ...project,
      sources: updatedSources
    });

    // Eliminar de MongoDB y disco en el backend para no dejar registros sucios
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    const targetId = sourceToDelete?.backendId || sourceToDelete?.id || sourceId;
    const targetName = sourceToDelete?.name;

    if (backendId || (targetId && targetId.length === 24)) {
      try {
        console.log(`[Workspace] Eliminando fuente de MongoDB: ${targetName || targetId}`);
        await deleteFuenteApi(targetId, backendId, targetName);
      } catch (err) {
        console.warn("[Workspace] Error al borrar fuente en backend:", err);
      }
    }
  };

  const handleUpdateProjectName = (newName) => {
    onUpdateProject({
      ...project,
      name: newName
    });
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (backendId) {
      updateProjectApi(backendId, { nombre: newName }).catch((err) => {
        console.warn("[Workspace] Error persistiendo nombre de proyecto:", err);
      });
    }
  };

  // Botón "Procesar con IA" (Conectado con Backend y n8n)
  const handleProcess = async (targetProvider) => {
    const providerToUse = targetProvider || selectedAiProvider || 'auto';
    setIsProcessing(true);
    setProcessProgress(8);
    setProcessStage("");

    let progressVal = 8;
    const progressTimer = setInterval(() => {
      progressVal = Math.min(95, progressVal + (progressVal < 30 ? 4 : progressVal < 60 ? 3 : progressVal < 85 ? 2 : 1));
      setProcessProgress(progressVal);
    }, 600);

    try {
      let updatedName = project.name;
      if ((!updatedName || updatedName === "Proyecto sin nombre") && project.sources?.length) {
        const first = project.sources[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        updatedName = first.charAt(0).toUpperCase() + first.slice(1);
      }

      // Asegurar que el proyecto esté registrado en el backend
      let backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
      if (!backendId) {
        const created = await createProjectApi({
          nombre: updatedName,
          descripcion: project.description || "Especificación generada por I-CASE asistida por IA"
        });
        if (created && (created.id || created._id)) {
          backendId = created.id || created._id;
        }
      }

      // Si hay fuentes con archivo físico y aún no subidas al backend, subirlas
      if (backendId && project.sources?.length) {
        for (const s of project.sources) {
          if (s.rawFile && !s.uploaded) {
            try {
              const res = await uploadFuenteApi(backendId, s.rawFile);
              if (res) {
                s.uploaded = true;
                s.rawFile = null;
                if (res.texto_transcrito) {
                  s.contentSnippet = res.texto_transcrito;
                  console.log(`[Workspace] Texto sincronizado para "${s.name}":`, res.texto_transcrito.slice(0, 100));
                }
              }
            } catch (e) {
              console.warn("[Workspace] Error al subir fuente:", e);
            }
          }
        }
      }

      // Compilar el insumo bruto de todas las fuentes disponibles
      let insumoBruto = await extractInsumoBruto(project.sources || []);

      // Si el insumo local está vacío pero hay backendId, recuperar las fuentes ya procesadas en MongoDB
      if (!insumoBruto && backendId) {
        try {
          const remoteFuentes = await fetchFuentesApi(backendId);
          if (remoteFuentes && remoteFuentes.length > 0) {
            insumoBruto = remoteFuentes
              .filter((f) => f.texto_transcrito)
              .map((f) => `[Fuente: ${f.nombre_archivo} (${f.tipo})]\n${f.texto_transcrito}`)
              .join("\n\n");
            console.log(`[Workspace] Insumo recuperado de fuentes en backend (${insumoBruto.length} chars)`);
          }
        } catch (errSync) {
          console.warn("[Workspace] Error recuperando fuentes de backend:", errSync);
        }
      }

      console.log(`[Workspace] Enviando a procesar con IA (${providerToUse}). Insumo length: ${insumoBruto.length}, backendId: ${backendId}`);

      // Invocación al endpoint de IA del backend enviando el insumo completo y el proveedor seleccionado
      let aiResult = null;
      if (backendId) {
        try {
          if (resilientRequirements || project.analysisFlowVersion === 2) {
            onUpdateProject({ ...project, backendId, id: backendId });
            const job = await startRequirementJobApi(backendId, { insumo_bruto: insumoBruto, provider: providerToUse });
            setRequirementJob(job);
            return;
          }
          aiResult = await processWithAiApi(backendId, insumoBruto, '', providerToUse, null, 'requisitos');
        } catch (errAi) {
          console.error("[Workspace] Error en procesamiento con IA:", errAi.message);
          setAlertModal({
            title: "Error al procesar con IA",
            message: errAi.message
          });
          setIsProcessing(false);
          return;
        }
      }

      console.log("[Workspace] Resultado recibido de la IA:", aiResult);

      // Adopción automática del título del sistema detectado por la IA según el dominio del sistema (sin prefijo Sistema de)
      const aiDetectedName = aiResult?.nombre_proyecto || aiResult?.proyecto_info?.nombre || aiResult?.nombre;
      if (aiDetectedName && aiDetectedName.trim()) {
        const cleanedName = aiDetectedName
          .trim()
          .replace(/^(Sistema de|Sistema para|Sistema|Software de|Software para|Aplicación de|Plataforma de)\s+/i, "")
          .trim();
        updatedName = cleanedName ? (cleanedName.charAt(0).toUpperCase() + cleanedName.slice(1)) : aiDetectedName.trim();
        console.log("[Workspace] Título asignado automáticamente por IA:", updatedName);
      } else {
        const sampleText = `${insumoBruto} ${(aiResult?.requerimientos || []).map(r => r.nombre + ' ' + r.descripcion).join(' ')}`;
        if (/hormig[oó]n|concretera|mixer|dosificaci/i.test(sampleText)) {
          updatedName = "Control Operativo y Dosificación para Planta de Hormigón";
        } else if (/hospital|cl[ií]nic|m[eé]dic|paciente/i.test(sampleText)) {
          updatedName = "Gestión Hospitalaria y Clínica";
        } else if (/facturaci[oó]n|punto de venta|inventario/i.test(sampleText)) {
          updatedName = "Gestión Comercial y Facturación";
        }
      }

      let { reqs } = transformAiOutput(aiResult, updatedName, project.diagrams);

      if (!reqs?.functional?.length) {
        throw new Error("La IA no devolvió requisitos funcionales trazables. No se generaron requisitos de contingencia; vuelve a intentarlo o revisa el insumo.");
      }

      // Deduplicar las fuentes por nombre para garantizar que nunca se repita la tarjeta
      const seenNames = new Set();
      const uniqueSources = (project.sources || []).filter((s) => {
        const fname = s.name;
        if (!fname || seenNames.has(fname)) return false;
        seenNames.add(fname);
        return true;
      });

      clearInterval(progressTimer);
      setProcessProgress(100);
      setProcessStage("¡Especificación completada con éxito!");
      await new Promise((r) => setTimeout(r, 450));

      onUpdateProject({
        ...project,
        id: backendId,
        backendId,
        name: updatedName,
        sources: uniqueSources,
        isProcessed: true,
        currentPhase: 1, // Desbloquea la Fase 1
        isAnalysisApproved: false,
        isDiagramsApproved: false,
        isMockupsApproved: false,
        requirements: reqs,
        requirementAudit: aiResult?.auditoria_requisitos || null,
        diagrams: {},
        mockups: []
      });
      setIsManagingSources(false);

      addToast({
        type: "success",
        title: "Especificación Generada",
        message: "Los requerimientos funcionales y no funcionales se estructuraron correctamente."
      });
    } catch (err) {
      clearInterval(progressTimer);
      console.error("[Workspace] Error procesando con IA:", err);
      addToast({
        type: "error",
        title: "Error de Generación",
        message: err.message || "No se pudo generar una especificación trazable."
      });
    } finally {
      clearInterval(progressTimer);
      setIsProcessing(false);
      setProcessProgress(0);
      setProcessStage("");
    }
  };

  const handleRequirementReview = async (payload) => {
    const backendId = project.backendId || (project.id?.length === 24 ? project.id : null);
    if (!backendId) throw new Error('El proyecto todavía no está guardado.');
    const seenIds = new Set();
    let rfCount = 1;
    let rnfCount = 1;

    const list = [
      ...(project.requirements?.functional || []).map(item => {
        let id = String(item.identificador || item.id || '').trim();
        if (!id || seenIds.has(id)) {
          id = `RF-${String(rfCount++).padStart(2, '0')}`;
          while (seenIds.has(id)) id = `RF-${String(rfCount++).padStart(2, '0')}`;
        }
        seenIds.add(id);
        return { ...item, tipo: 'RF', identificador: id, id };
      }),
      ...(project.requirements?.nonFunctional || []).map(item => {
        let id = String(item.identificador || item.id || '').trim();
        if (!id || seenIds.has(id)) {
          id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
          while (seenIds.has(id)) id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
        }
        seenIds.add(id);
        return { ...item, tipo: 'RNF', identificador: id, id };
      })
    ];
    if (!project.isAnalysisApproved) await syncProjectRequirementsApi(backendId, list);
    const result = payload.scope === 'necesidad'
      ? await resolveRequirementNeedApi(backendId, payload.id, payload.data)
      : await reviewRequirementsApi(backendId, payload);
    const actorKey = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
    const replacements = payload.accion?.endsWith('_actor') ? result.auditoria_requisitos?.cambios_actores || [] : [];
    const updateActors = row => ({ ...row, actors: [...new Set((row.actors || row.actores || []).map(name => replacements.find(([old]) => actorKey(old) === actorKey(name))?.[1] || name))] });
    onUpdateProject({ ...project, requirementAudit: result.auditoria_requisitos, requirements: replacements.length ? {
      ...project.requirements, functional: (project.requirements?.functional || []).map(updateActors), nonFunctional: (project.requirements?.nonFunctional || []).map(updateActors)
    } : project.requirements });
    return result;
  };

  const handleApproveAnalysis = async () => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) {
      setAlertModal({
        title: "Proyecto no persistido",
        message: "No se encontró el proyecto persistido. Guarda o reprocesa las fuentes antes de aprobar los requisitos."
      });
      return { success: false, error: "Proyecto no persistido" };
    }
    let approvalCompleted = Boolean(project.isAnalysisApproved);
    try {
      const seenIds = new Set();
      let rfCount = 1;
      let rnfCount = 1;
      const latestRequirements = [
        ...(project.requirements?.functional || []).map((requirement) => {
          let id = String(requirement.identificador || requirement.id || '').trim();
          if (!id || seenIds.has(id)) {
            id = `RF-${String(rfCount++).padStart(2, '0')}`;
            while (seenIds.has(id)) id = `RF-${String(rfCount++).padStart(2, '0')}`;
          }
          seenIds.add(id);
          return {
            ...requirement,
            tipo: 'RF',
            identificador: id,
            id
          };
        }),
        ...(project.requirements?.nonFunctional || []).map((requirement) => {
          let id = String(requirement.identificador || requirement.id || '').trim();
          if (!id || seenIds.has(id)) {
            id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
            while (seenIds.has(id)) id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
          }
          seenIds.add(id);
          return {
            ...requirement,
            tipo: 'RNF',
            identificador: id,
            id
          };
        })
      ];
      const syncResult = await syncProjectRequirementsApi(backendId, latestRequirements);
      if (!syncResult) throw new Error("No se pudo guardar la versión final de los requisitos antes de aprobar.");
      const approveResult = await approvePhaseApi(backendId, "analisis");
      approvalCompleted = true;
      const workflow = approveResult?.flujoDiagramas || await fetchDiagramWorkflowApi(backendId).catch(() => null);
      onUpdateProject({
        ...project,
        isAnalysisApproved: true,
        currentPhase: 2,
        diagramFlow: workflow || project.diagramFlow,
        diagrams: project.diagrams || {}
      });
      return { success: true };
    } catch (e) {
      console.warn("[Workspace] Error al aprobar requisitos:", e);
      onUpdateProject({
        ...project,
        isAnalysisApproved: approvalCompleted,
        currentPhase: approvalCompleted ? 2 : 1,
        diagrams: project.diagrams || {},
        requirementAudit: e.controlRequisitos ? { ...project.requirementAudit, control_aprobacion: e.controlRequisitos } : project.requirementAudit
      });
      setAlertModal({
        title: approvalCompleted ? "Requisitos aprobados con observaciones" : "No se pudieron aprobar los requisitos",
        message: `${approvalCompleted ? "Los requisitos fueron aprobados." : "No se pudieron aprobar los requisitos. Puedes reintentar desde esta pantalla."}\n\n${e.message}`
      });
      return { success: false, error: e.message };
    }
  };

  const handleGenerateDiagram = async (diagramType, { regenerar = false } = {}) => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return { success: false, error: "Proyecto no persistido" };
    setIsGeneratingDiagrams(true);
    try {
      const response = await startDiagramJobApi(
        backendId,
        diagramType,
        '',
        '',
        selectedAiProvider || 'auto',
        null,
        regenerar
      );
      applyDiagramJobResponse(response);
      return {
        success: true,
        pending: ['encolado', 'procesando'].includes(response.trabajo?.estado),
        job: response.trabajo,
        diagramKey: DIAGRAM_KEY_BY_TYPE[diagramType]
      };
    } catch (error) {
      setIsGeneratingDiagrams(false);
      return { success: false, error: error.message };
    }
  };

  const handleApproveDiagram = async (diagramType) => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return { success: false, error: "Proyecto no persistido" };
    try {
      const result = await approveDiagramApi(backendId, diagramType);
      if (result.flujoDiagramas?.todos_aprobados) setIsSourcesCollapsed(true);
      const key = DIAGRAM_KEY_BY_TYPE[diagramType];
      const updatedDiagrams = {
        ...(project.diagrams || {}),
        ...(key && project.diagrams?.[key] ? {
          [key]: {
            ...project.diagrams[key],
            approved: true,
            status: "aprobado",
            stale: false
          }
        } : {})
      };
      onUpdateProject({
        ...project,
        diagrams: updatedDiagrams,
        diagramFlow: result.flujoDiagramas,
        isDiagramsApproved: Boolean(result.flujoDiagramas?.todos_aprobados),
        currentPhase: 2
      });
      return { success: true, flow: result.flujoDiagramas };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleRejectDiagram = async (diagramType, observations) => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return { success: false, error: "Proyecto no persistido" };
    try {
      const result = await rejectDiagramApi(backendId, diagramType, observations);
      const key = DIAGRAM_KEY_BY_TYPE[diagramType];
      const updatedDiagrams = {
        ...(project.diagrams || {}),
        ...(key && project.diagrams?.[key] ? {
          [key]: {
            ...project.diagrams[key],
            approved: false,
            status: "rechazado",
            reviewHistory: result.diagrama?.revisiones || project.diagrams[key].reviewHistory || []
          }
        } : {})
      };
      onUpdateProject({
        ...project,
        diagrams: updatedDiagrams,
        diagramFlow: result.flujoDiagramas,
        isDiagramsApproved: false,
        currentPhase: 2
      });
      return { success: true, flow: result.flujoDiagramas };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleLoadDiagramVersions = async (diagramKey) => {
    const diagramId = project.diagrams?.[diagramKey]?.id;
    if (!diagramId) throw new Error("El diagrama todavía no está persistido.");
    return fetchDiagramVersionsApi(diagramId);
  };

  const handleRestoreDiagramVersion = async (diagramKey, version) => {
    const diagram = project.diagrams?.[diagramKey];
    if (!diagram?.id) return { success: false, error: "El diagrama todavía no está persistido." };
    try {
      const restored = await restoreDiagramVersionApi(diagram.id, version);
      return { success: true, diagram: restored };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const handleUpdateSource = async (sourceId, changes) => {
    const source = (project.sources || []).find((item) => item.id === sourceId);
    if (!source) throw new Error("No se encontró la fuente que deseas actualizar.");
    const backendSourceId = source.backendId || source.id;
    if (source.uploadError) throw new Error(`La fuente no se guardó: ${source.uploadError} Vuelve a subir el archivo.`);
    if (!backendSourceId || backendSourceId.startsWith("src-")) {
      throw new Error("Espera a que la fuente termine de cargarse antes de guardar sus detalles.");
    }

    const payload = {
      categoria: changes.category,
      tipo_contenido: changes.contentType,
      descripcion: changes.description,
      autor_origen: changes.authorOrigin,
      fecha_documento: changes.documentDate,
      fecha_documento_origen: changes.documentDateSource,
      etiquetas: changes.tags,
      texto_transcrito: changes.contentSnippet,
      transcripcion_verificada: changes.transcriptionVerified,
      metadatos_generados_ia: changes.aiMetadata
    };
    const saved = await updateFuenteApi(backendSourceId, payload);
    const updatedSources = (project.sources || []).map((item) => item.id === sourceId ? {
      ...item,
      category: saved.categoria,
      contentType: saved.tipo_contenido,
      description: saved.descripcion,
      authorOrigin: saved.autor_origen,
      documentDate: saved.fecha_documento,
      documentDateSource: saved.fecha_documento_origen || "",
      tags: saved.etiquetas || [],
      contentSnippet: saved.texto_transcrito || "",
      transcriptionVerified: Boolean(saved.transcripcion_verificada),
      aiMetadata: Boolean(saved.metadatos_generados_ia)
    } : item);
    onUpdateProject({ ...project, sources: updatedSources });
    return updatedSources.find((item) => item.id === sourceId);
  };

  const handleSuggestSourceMetadata = async (sourceId) => {
    const source = (project.sources || []).find((item) => item.id === sourceId);
    const backendSourceId = source?.backendId || source?.id;
    if (source?.uploadError) throw new Error(`La fuente no se guardó: ${source.uploadError} Vuelve a subir el archivo.`);
    if (!backendSourceId || backendSourceId.startsWith("src-")) {
      throw new Error("Espera a que la fuente termine de cargarse para usar el rellenado con IA.");
    }
    const suggestion = await suggestFuenteMetadataApi(backendSourceId, selectedAiProvider);
    return {
      category: suggestion.categoria,
      contentType: suggestion.tipo_contenido,
      description: suggestion.descripcion,
      authorOrigin: suggestion.autor_origen,
      documentDate: source.documentDate || "",
      documentDateSource: source.documentDateSource || "",
      tags: suggestion.etiquetas || [],
      aiMetadata: Boolean(suggestion.generado_por_ia)
    };
  };

  const handleApproveMockups = async () => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!project.mockups?.length) {
      return { success: false, error: "Genera al menos un mockup antes de aprobar esta fase." };
    }
    if (backendId) {
      try {
        await approvePhaseApi(backendId, "mockups");
      } catch (e) {
        console.warn("[Workspace] Error aprobando mockups en backend:", e);
        return { success: false, error: e.message };
      }
    }
    onUpdateProject({
      ...project,
      isDiagramsApproved: true,
      isMockupsApproved: true,
      currentPhase: 3
    });
    return { success: true };
  };

  const handleApplyAiCorrection = async (phase, promptText, diagKey) => {
    if (!promptText || !promptText.trim()) return { success: false, error: "La instrucción no puede estar vacía." };

    let backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) {
      try {
        const created = await createProjectApi({
          nombre: project.name || "Sistema de Información",
          descripcion: "Creado para refinamiento agéntico"
        });
        if (created && (created.id || created._id)) {
          backendId = created.id || created._id;
        }
      } catch (err) {
        console.warn("[Workspace] Error registrando proyecto en backend:", err);
      }
    }

    let insumoBruto = await extractInsumoBruto(project.sources || []);
    if (!insumoBruto && backendId) {
      try {
        const remoteFuentes = await fetchFuentesApi(backendId);
        if (remoteFuentes?.length) {
          insumoBruto = remoteFuentes
            .filter((f) => f.texto_transcrito)
            .map((f) => `[Fuente: ${f.nombre_archivo} (${f.tipo})]\n${f.texto_transcrito}`)
            .join("\n\n");
        }
      } catch (e) {
        console.warn("[Workspace] Error buscando fuentes en backend:", e);
      }
    }
    if (!insumoBruto) {
      insumoBruto = project.name || "Sistema de Información";
    }

    let insumoAdicional = "";
    let targetType = null;
    if (phase === "diagrams") {
      const diagTitleMap = {
        useCase: DIAGRAM_TYPES.USE_CASES,
        architecture: DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE,
        systemArchitecture: DIAGRAM_TYPES.SYSTEM_ARCHITECTURE,
        classDiagram: DIAGRAM_TYPES.DOMAIN_CLASSES,
        designClassDiagram: DIAGRAM_TYPES.DESIGN_CLASSES,
        navigationTree: DIAGRAM_TYPES.NAVIGATION_TREE
      };
      targetType = diagTitleMap[diagKey] || diagKey || DIAGRAM_TYPES.USE_CASES;
      const curDiag = diagKey && project.diagrams?.[diagKey];
      const curPuml = curDiag ? (curDiag.plantumlCode || curDiag.code || "") : "";

      insumoAdicional = `[INSTRUCCIÓN DEL EXPERTO PARA MODIFICAR MODELADO DE ${targetType.toUpperCase()} EN PLANTUML]:\n${promptText.trim()}\n${curPuml ? `\nCÓDIGO PLANTUML ACTUAL:\n${curPuml}\n` : ""}\nOBLIGATORIO: Genera el código PlantUML ("codigo_plantuml") compilable y actualizado para este diagrama aplicando la instrucción del usuario.`;
    } else {
      insumoAdicional = `[INSTRUCCIÓN DEL EXPERTO EN ANÁLISIS DE REQUERIMIENTOS]:\n${promptText.trim()}`;
    }

    console.log(`[Workspace] Ejecutando corrección con IA en backend (${backendId}):`, promptText);

    if (backendId) {
      try {
        if (phase === "diagrams") {
          setIsGeneratingDiagrams(true);
          const response = await startDiagramJobApi(
            backendId,
            targetType,
            insumoBruto,
            insumoAdicional,
            selectedAiProvider || 'auto'
          );
          applyDiagramJobResponse(response);
          return { success: true, pending: true, job: response.trabajo };
        }
        const objetivo = phase === "diagrams" ? "diagramas" : "requisitos";
        if (objetivo === 'requisitos' && project.analysisFlowVersion === 2) {
          const state = await loadInitial();
          if (!state?.aprobado || !state.vigente) return { success: false, error: 'Revisa y aprueba primero el análisis inicial vigente.' };
          const all = [...(project.requirements?.functional || []), ...(project.requirements?.nonFunctional || [])];
          const requestedIds = new Set((promptText.match(/\b(?:RF|RNF)-\d+\b/gi) || []).map(id => id.toUpperCase()));
          const ids = all.map(r => r.identificador || r.id).filter(id => requestedIds.has(String(id).toUpperCase()));
          if (!ids.length) return { success: false, error: 'Indica los IDs de los requisitos a corregir, por ejemplo RF-01. Para añadir necesidades o cambiar el alcance, revisa el análisis inicial.' };
          const job = await startRequirementJobApi(backendId, { operacion: 'redaccion_requisitos', analisis_id: state.aprobado.id, actualizar_ids: ids, instruccion: promptText, provider: selectedAiProvider || 'auto' });
          setRequirementJob(job); return { success: true, pending: true, job };
        }
        if (objetivo === "requisitos" && !project.isAnalysisApproved) {
          const seenIds = new Set();
          let rfCount = 1;
          let rnfCount = 1;
          const currentRequirements = [
            ...(project.requirements?.functional || []).map((item) => {
              let id = String(item.identificador || item.id || '').trim();
              if (!id || seenIds.has(id)) {
                id = `RF-${String(rfCount++).padStart(2, '0')}`;
                while (seenIds.has(id)) id = `RF-${String(rfCount++).padStart(2, '0')}`;
              }
              seenIds.add(id);
              return { ...item, tipo: 'RF', identificador: id, id };
            }),
            ...(project.requirements?.nonFunctional || []).map((item) => {
              let id = String(item.identificador || item.id || '').trim();
              if (!id || seenIds.has(id)) {
                id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
                while (seenIds.has(id)) id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
              }
              seenIds.add(id);
              return { ...item, tipo: 'RNF', identificador: id, id };
            })
          ];
          if (currentRequirements.length > 0) {
            await syncProjectRequirementsApi(backendId, currentRequirements);
          }
        }
        const aiResult = await processWithAiApi(backendId, insumoBruto, insumoAdicional, selectedAiProvider || 'auto', null, objetivo, phase === "diagrams" ? targetType : null);
        if (aiResult && (aiResult.requerimientos?.length || aiResult.diagramas?.length)) {
          const { reqs, diags } = transformAiOutput(aiResult, project.name, project.diagrams);

          // Limpiar cualquier requerimiento residual espurio previo
          const cleanedRNF = (reqs?.nonFunctional || []).filter(
            (r) => !r.category?.includes("Ajuste Validado por Experto") && !r.description?.includes("Requisito incorporado por corrección")
          );

          onUpdateProject({
            ...project,
            id: backendId,
            backendId,
            requirements: {
              functional: reqs?.functional || project.requirements?.functional || [],
              nonFunctional: cleanedRNF
            },
            diagrams: phase === "diagrams" ? (diags || project.diagrams) : {},
            diagramFlow: phase === "diagrams" ? (aiResult.flujoDiagramas || project.diagramFlow) : null,
            requirementAudit: phase === "diagrams" ? project.requirementAudit : (aiResult.auditoria_requisitos || null),
            ...(phase === "diagrams" ? {} : {
              isAnalysisApproved: false,
              isDiagramsApproved: false,
              isMockupsApproved: false,
              mockups: []
            })
          });
          return { success: true };
        } else {
          return {
            success: false,
            error: "La IA no pudo estructurar nuevos requerimientos para esta instrucción. Intente reformular su petición."
          };
        }
      } catch (err) {
        if (phase === "diagrams") setIsGeneratingDiagrams(false);
        console.error("[Workspace] Error en corrección agéntica:", err);
        return {
          success: false,
          error: `Error al conectar con la IA: ${err.message}`
        };
      }
    }

    return {
      success: false,
      error: "No se pudo identificar el proyecto en el servidor para enviar la instrucción a la IA."
    };
  };

  const handleUpdateMockups = async (nombrePantalla, previewCode) => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return null;

    try {
      // Direct mockups array update
      if (Array.isArray(nombrePantalla)) {
        onUpdateProject({
          ...project,
          mockups: nombrePantalla
        });
        return { mockups: nombrePantalla };
      }

      // Special signal to refresh mockups from backend
      if (nombrePantalla === '__refresh__') {
        const result = await fetchMockupsApi(backendId);
        if (result && result.mockups) {
          onUpdateProject({
            ...project,
            mockups: result.mockups
          });
        }
        return result;
      }

      const result = await updateMockupApi(backendId, nombrePantalla, previewCode);
      if (result) {
        onUpdateProject({
          ...project,
          mockups: project.mockups.map(m =>
            m.nombre_pantalla === nombrePantalla ? result : m
          )
        });
      }
      return result;
    } catch (err) {
      console.warn("[Workspace] Error actualizando mockup:", err.message);
      return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* HEADER SUPERIOR OSCURO: Izquierda Logo RBIX | Centro Título Grande del Proyecto | Derecha Acciones */}
      <header className="relative h-14 shrink-0 border-b border-white/10 bg-[#171425] px-6 flex items-center justify-between gap-4 z-20 select-none">
        {/* Izquierda: Volver + Logo del Equipo */}
        <div className="flex items-center gap-3 z-10">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="p-1.5 -ml-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Volver a Mis Proyectos"
          >
            <ArrowLeft size={18} />
          </button>
          <div
            onClick={onBackToDashboard}
            className="cursor-pointer flex items-center hover:opacity-90 transition-opacity"
            title="RBIX - Volver a Mis Proyectos"
          >
            <RbixLogo size="sm" isDark={true} />
          </div>
        </div>

        {/* Centro: Título del proyecto grande y centrado */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none px-44">
          <div className="pointer-events-auto max-w-full">
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveEditName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEditName();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
                className="text-base sm:text-lg font-bold text-white text-center bg-white/10 border border-violet-400 rounded-lg px-3 py-1 outline-none ring-2 ring-violet-500/40 w-72 sm:w-96"
              />
            ) : (
              <button
                type="button"
                onClick={handleStartEditName}
                className="group flex items-center justify-center gap-2 rounded-lg px-3 py-1 text-base sm:text-lg font-bold text-white tracking-tight hover:bg-white/10 transition-colors cursor-pointer max-w-[320px] sm:max-w-[480px] md:max-w-[600px]"
                title="Clic para renombrar el proyecto"
              >
                <span className="truncate">{cleanProjectTitle(project.name)}</span>
                <Pencil size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Derecha: Ver documento actual + Acceso a Insumos cuando el proyecto ya fue procesado */}
        <div className="flex items-center gap-2.5 min-w-0 z-10">
          {project.isAnalysisApproved && !isManagingSources && (
            <button type="button" onClick={() => setIsRequirementsSidebarOpen(open => !open)} aria-expanded={isRequirementsSidebarOpen} aria-controls="approved-requirements-sidebar" title={isRequirementsSidebarOpen ? "Ocultar requisitos aprobados" : "Mostrar requisitos aprobados"} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/15">
              <PanelLeft size={14} /><span>{isRequirementsSidebarOpen ? "Ocultar requisitos" : "Mostrar requisitos"}</span>
            </button>
          )}
          {project.isProcessed && (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsManagingSources(false);
                  setIsReviewingRequirements(false);
                  onUpdateProject({
                    ...project,
                    currentPhase: project.currentPhase === 4 ? 3 : 4
                  });
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  project.currentPhase === 4 && !isManagingSources
                    ? "border-violet-400 bg-violet-600/30 text-white"
                    : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                }`}
                title="Ver documento consolidado actual"
              >
                <FileText size={13} />
                <span>Ver documento actual</span>
              </button>

              <button
                type="button"
                onClick={() => setIsManagingSources((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  isManagingSources
                    ? "border-violet-400 bg-violet-600/30 text-white"
                    : "border-white/15 bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                }`}
                title="Ver o cargar archivos de insumo"
              >
                <Files size={13} />
                <span>Insumos ({(project.sources || []).length})</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL A PANTALLA COMPLETA (100% ANCHO) */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {project.isAnalysisApproved && !isManagingSources && (
        <RequirementsReferencePanel open={isRequirementsSidebarOpen} onToggle={() => setIsRequirementsSidebarOpen(open => !open)} side={project.currentPhase === 3 && !isReviewingRequirements ? 'right' : 'left'} requirements={project.requirements} audit={project.requirementAudit} />
      )}
      <main onScrollCapture={handleProgressScroll} className="flex-1 overflow-hidden bg-white flex flex-col min-h-0 min-w-0">
        <RequirementJobStatus job={requirementJob} onResume={resumeRequirements} />
        {projectBackendId && <AnalysisFlowProgress
          collapsed={progressHidden} onReveal={() => { setProgressHidden(false); progressScroll.current.until = Date.now() + 220; }}
          current={showInitial ? 'analysis' : isManagingSources || !project.isProcessed ? 'sources' : project.currentPhase > 1 && !isReviewingRequirements ? null : 'requirements'}
          completed={{ sources: Boolean(project.sources?.length), analysis: Boolean(initialState?.aprobado), requirements: Boolean(project.isAnalysisApproved) }}
          requirementsAvailable={Boolean(project.isProcessed)}
          laterPhase={!showInitial && !isManagingSources && !isReviewingRequirements && project.currentPhase > 1 ? ({ 2: 'Diseño', 3: 'Codificación', 4: 'Documento' }[project.currentPhase]) : null}
          onNavigate={key => {
            if (key === 'analysis') { if (showInitial) return; loadInitial().then(() => { setShowInitial(true); setIsManagingSources(false); }).catch(error => setAlertModal({ title: 'Análisis inicial', message: error.message })); return; }
            if (!canLeaveInitial()) return;
            setShowInitial(false); setIsManagingSources(key === 'sources');
            if (key === 'requirements') { if (project.isAnalysisApproved) setIsReviewingRequirements(true); else onUpdateProject({ ...project, currentPhase: 1 }); }
          }} />}
        {isProcessing ? (
          /* Barra Dinámica Minimalista con Porcentaje */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="w-full flex flex-col items-center">
              <div className="w-56 h-56 rounded-full gemini-aura-glow absolute -z-10 pointer-events-none"></div>

              <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                {project.isProcessed ? "Reprocesando especificación de requisitos..." : "Generando especificación de requisitos..."}
              </h3>

              {/* Barra de progreso limpia sin contenedor de tarjeta ni textos redundantes */}
              <div className="w-full mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-600">
                    Progreso
                  </span>
                  <span className="text-violet-700 font-bold text-sm bg-violet-50 px-2.5 py-0.5 rounded-md border border-violet-200">
                    {processProgress}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    className="h-full bg-linear-to-r from-violet-600 via-indigo-600 to-purple-500 rounded-full transition-all duration-300 ease-out shadow-xs"
                    style={{ width: `${Math.max(processProgress, 4)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : showInitial && initialState ? (
          <InitialAnalysisView state={initialState} proposal={initialProposal} busy={initialBusy || ['encolado', 'procesando'].includes(requirementJob?.estado)} provider={selectedAiProvider}
            onReviewQuality={() => initialAction(async () => { const job = await startRequirementJobApi(projectBackendId, { operacion: 'revision_calidad', analisis_id: initialState.borrador.id, provider: selectedAiProvider }); setRequirementJob(job); })}
            onAnalyzeAnswer={async (questionId, answer, resumeId) => {
              let job = resumeId ? await resumeRequirementJobApi(resumeId) : await startRequirementJobApi(projectBackendId, { operacion: 'analisis_respuesta', analisis_id: initialState.borrador.id, pregunta_id: questionId, respuesta: answer, provider: selectedAiProvider });
              while (['encolado', 'procesando'].includes(job.estado)) { await new Promise(resolve => setTimeout(resolve, 900)); job = await fetchRequirementJobApi(job.id); }
              if (job.estado !== 'completado' || !job.resultado_analisis_inicial?.elementos) throw Object.assign(new Error(job.mensaje || 'Propuesta pendiente. Puedes reanudar o introducir elementos manualmente.'), { trabajoId: job.id });
              return { ...job.resultado_analisis_inicial, trabajo_id: job.id };
            }}
            onDirtyChange={setInitialDirty}
            onViewVersion={async id => (await fetchInitialAnalysisApi(projectBackendId, id)).version_consultada}
            onExtract={id => initialAction(async () => { const job = await startRequirementJobApi(projectBackendId, { operacion: 'analisis_inicial', analisis_id: id, regenerar: true, desde_cero: true, provider: selectedAiProvider }); setRequirementJob(job); })}
            onBack={() => { if (!canLeaveInitial()) return; setShowInitial(false); setIsManagingSources(true); }}
            onRequirements={() => { if (!canLeaveInitial()) return; setShowInitial(false); setIsManagingSources(false); if (project.isAnalysisApproved) setIsReviewingRequirements(true); else if (project.isProcessed) onUpdateProject({ ...project, currentPhase: 1 }); }}
            onSave={body => initialAction(async () => { await initialAnalysisActionApi(projectBackendId, '', body); await loadInitial(); })}
            onReopen={() => initialAction(async () => { if (initialState.version_flujo !== 2 && !window.confirm('¿Adoptar el flujo separado? No se regenerarán ni borrarán tus requisitos o diagramas.')) return; await initialAnalysisActionApi(projectBackendId, 'reabrir', { adoptar: true }); onUpdateProject({ ...project, analysisFlowVersion: 2 }); await loadInitial(); })}
            onApprove={version => initialAction(async () => {
              const result = await initialAnalysisActionApi(projectBackendId, 'aprobar', { version_esperada: version, aceptar_advertencias: true, provider: selectedAiProvider });
              await loadInitial(); if (result.trabajo) setRequirementJob(result.trabajo);
              if (result.generacion_pendiente) setAlertModal({ title: 'Análisis aprobado; generación pendiente', message: result.mensaje });
            })}
            onProposal={(instruction, ids) => initialAction(async () => { const job = await startRequirementJobApi(projectBackendId, { operacion: 'correccion_analisis_inicial', instruccion: instruction, elementos_ids: ids, provider: selectedAiProvider }); setRequirementJob(job); })}
            onApplyProposal={() => initialAction(async () => { await initialAnalysisActionApi(projectBackendId, '', { accion: 'aplicar_propuesta', trabajo_id: initialProposal.trabajo_id, version_esperada: initialState.borrador.id, justificacion: 'Propuesta de IA revisada y aceptada por el usuario.' }); setInitialProposal(null); await loadInitial(); })}
            onUpdateRequirements={() => initialAction(async () => {
              const state = await loadInitial();
              if (state.impacto.requisitos_existentes && !window.confirm(`¿Actualizar explícitamente ${state.impacto.requisitos_afectados.join(', ') || 'las necesidades nuevas'}? Se conservarán las versiones anteriores y los requisitos no afectados.`)) return;
              const job = await startRequirementJobApi(projectBackendId, { operacion: 'redaccion_requisitos', analisis_id: state.aprobado.id, actualizar_ids: state.impacto.requisitos_afectados, provider: selectedAiProvider }); setRequirementJob(job);
            })}
          />
        ) : !project.isProcessed || isManagingSources ? (
          /* PANTALLA 0 (Inicial al crear proyecto): Cargar Insumos */
          <SourcesPanel
            sources={project.sources || []}
            onAddSource={handleAddSource}
            onUpdateSource={handleUpdateSource}
            onSuggestSourceMetadata={handleSuggestSourceMetadata}
            onDeleteSource={handleDeleteSource}
            onProcess={(prov) => handleProcess(prov)}
            selectedProvider={selectedAiProvider}
            onSelectProvider={setSelectedAiProvider}
            availableProviders={availableProviders}
            isProcessing={isProcessing || isGeneratingDiagrams || ['encolado', 'procesando'].includes(requirementJob?.estado)}
            isProcessed={project.isProcessed}
            onContinueToProject={project.isProcessed ? () => setIsManagingSources(false) : null}
          />
        ) : isReviewingRequirements ? (
          <RequirementsView
            requirements={project.requirements}
            audit={project.requirementAudit}
            onReview={handleRequirementReview}
            isApproved={project.isAnalysisApproved}
            readOnly
            onBackToDesign={() => setIsReviewingRequirements(false)}
          />
        ) : project.currentPhase === 1 ? (
          /* FASE 1: Análisis (Requerimientos en texto estructurado limpio) */
          <RequirementsView
            requirements={project.requirements}
            audit={project.requirementAudit}
            onReview={handleRequirementReview}
            onUpdateRequirements={(newReqs) => {
              const staleDiagrams = Object.fromEntries(Object.entries(project.diagrams || {}).map(([key, diagram]) => [
                key,
                {
                  ...diagram,
                  approved: false,
                  status: "desactualizado",
                  stale: true,
                  staleReasons: ["Cambió la especificación de requisitos."]
                }
              ]));
              onUpdateProject({
                ...project,
                requirements: newReqs,
                diagrams: staleDiagrams,
                diagramFlow: null,
                isAnalysisApproved: false,
                isDiagramsApproved: false,
                isMockupsApproved: false,
                currentPhase: 1
              });
              const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
              if (backendId) {
                const seenIds = new Set();
                let rfCount = 1;
                let rnfCount = 1;
                const flatList = [
                  ...(newReqs.functional || []).map((r) => {
                    let id = String(r.identificador || r.id || '').trim();
                    if (!id || seenIds.has(id)) {
                      id = `RF-${String(rfCount++).padStart(2, '0')}`;
                      while (seenIds.has(id)) id = `RF-${String(rfCount++).padStart(2, '0')}`;
                    }
                    seenIds.add(id);
                    return { ...r, tipo: 'RF', identificador: id, id };
                  }),
                  ...(newReqs.nonFunctional || []).map((r) => {
                    let id = String(r.identificador || r.id || '').trim();
                    if (!id || seenIds.has(id)) {
                      id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
                      while (seenIds.has(id)) id = `RNF-${String(rnfCount++).padStart(2, '0')}`;
                    }
                    seenIds.add(id);
                    return { ...r, tipo: 'RNF', identificador: id, id };
                  })
                ];
                syncProjectRequirementsApi(backendId, flatList).catch((err) => {
                  console.warn("[Workspace] Error persistiendo requerimientos editados:", err);
                });
              }
            }}
            onApprovePhase={handleApproveAnalysis}
            isApproved={project.isAnalysisApproved}
            regenerating={requirementJob?.operacion === 'redaccion_requisitos' && ['encolado', 'procesando'].includes(requirementJob?.estado)}
            onRegenerate={project.analysisFlowVersion === 2 ? async () => {
              if (!window.confirm('Se reemplazarán los requisitos actuales con una nueva redacción del análisis inicial aprobado.')) return;
              try {
                const state = await loadInitial();
                if (!state?.aprobado?.id) { setAlertModal({ title: 'Análisis inicial', message: 'Aprueba el análisis inicial antes de regenerar los requisitos.' }); return; }
                const job = await startRequirementJobApi(projectBackendId, { operacion: 'redaccion_requisitos', analisis_id: state.aprobado.id, regenerar: true, provider: selectedAiProvider || 'auto' });
                setRequirementJob(job);
              } catch (error) { setAlertModal({ title: 'No se pudo regenerar', message: error.message }); }
            } : undefined}
            onApplyAiCorrection={(prompt) => handleApplyAiCorrection("analysis", prompt)}
          />
        ) : project.currentPhase === 2 ? (
          /* FASE 2: Modelado (Diagramas PlantUML puros con máxima amplitud) */
          <DiagramsView
            diagrams={project.diagrams}
            mockups={project.mockups || []}
            onUpdateMockups={handleUpdateMockups}
            onUpdateDiagramCode={async (key, newCode) => {
              const diagId = project.diagrams?.[key]?.id;
              if (diagId && diagId.length === 24) {
                const updated = await updateDiagramApi(diagId, {
                  version_esperada: Number(project.diagrams[key].version || 1),
                  codigo_plantuml: newCode,
                  codigo_mermaid: newCode
                });
                if (!updated) return { success: false, error: "No se pudo guardar el diagrama." };
                onUpdateProject({
                  ...project,
                  diagrams: {
                    ...project.diagrams,
                    [key]: {
                      ...project.diagrams[key],
                      plantumlCode: newCode,
                      code: newCode,
                      version: Number(updated.version || project.diagrams[key].version || 1),
                      approved: false,
                      status: updated.estado || "pendiente_revision"
                    }
                  }
                });
                return { success: true, diagram: updated };
              }
              return { success: false, error: "El diagrama todavía no está persistido." };
            }}
            onLoadDiagramVersions={handleLoadDiagramVersions}
            onRestoreDiagramVersion={handleRestoreDiagramVersion}
            onGenerateDiagram={handleGenerateDiagram}
            onApproveDiagram={handleApproveDiagram}
            onRejectDiagram={handleRejectDiagram}
            onApproveMockups={handleApproveMockups}
            isDiagramsApproved={Boolean(project.isDiagramsApproved)}
            diagramFlow={project.diagramFlow}
            isGeneratingDiagram={isGeneratingDiagrams}
            diagramJob={diagramJob}
            onBackToAnalysis={() => {
              setIsReviewingRequirements(true);
            }}
            onApplyAiCorrection={(prompt, diagKey) => handleApplyAiCorrection("diagrams", prompt, diagKey)}
            projectId={project.backendId || (project.id && project.id.length === 24 ? project.id : null)}
            requirements={project.requirements}
          />
        ) : project.currentPhase === 3 ? (
          /* FASE 3: decisiones previas a la generación de código */
          <CodePlanningView
            projectId={project.backendId || (project.id && project.id.length === 24 ? project.id : null)}
            projectName={project.name}
            onBackToDiagrams={() => onUpdateProject({ ...project, currentPhase: 2 })}
            onOpenDocument={() => onUpdateProject({ ...project, currentPhase: 4 })}
          />
        ) : (
          /* FASE 4: Documento Consolidado */
          <DocumentViewer
            project={project}
            onBackToDiagrams={() => onUpdateProject({ ...project, currentPhase: 3 })}
          />
        )}
      </main>
      </div>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Modal sobrio y sencillo para avisos del sistema (sin gradientes ni colores estridentes) */}
      {alertModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setAlertModal(null)}
        >
          <div
            className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {alertModal.title && (
              <h4 className="text-sm font-semibold text-slate-900 mb-2">
                {alertModal.title}
              </h4>
            )}
            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
              {alertModal.message}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
