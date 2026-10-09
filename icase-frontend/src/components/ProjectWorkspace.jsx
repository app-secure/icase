import React, { useState } from "react";
import SourcesPanel from "./SourcesPanel";
import RequirementsView from "./RequirementsView";
import DiagramsView from "./DiagramsView";
import DocumentViewer from "./DocumentViewer";
import {
  createProjectApi,
  updateProjectApi,
  uploadFuenteApi,
  updateFuenteApi,
  suggestFuenteMetadataApi,
  deleteFuenteApi,
  fetchFuentesApi,
  processWithAiApi,
  approvePhaseApi,
  approveDiagramApi,
  rejectDiagramApi,
  updateDiagramApi,
  fetchAiModelsApi,
  fetchMockupsApi,
  updateMockupApi,
  syncProjectRequirementsApi
} from "../services/api";
import { sanitizePlantUML } from "../utils/plantumlEncoder";
import { DIAGRAM_TYPES } from "../constants/diagramTypes";

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
        s.description ? `Descripción aportada por el usuario: ${s.description}` : "",
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
!include <C4/C4_Container>
title Arquitectura Técnica Integral - ${safeName}

Person(operador, "Operador Principal", "Personal autorizado del sistema")
Person(supervisor, "Supervisor / Administrador", "Gestión y auditoría")

System_Ext(ext_auth, "Servidor de Identidad / SSO", "OAuth2 / JWT")
System_Ext(ext_notif, "Servidor de Notificaciones", "SMTP / WebPush")
System_Ext(ext_ext, "Servicios Externos / APIs", "Integración y telemetría")

System_Boundary(sys, "${safeName}") {
  Container(webApp, "Portal Web y Móvil PWA", "React.js / TypeScript", "Frontend interactivo")
  Container(reverseProxy, "Proxy Inverso y Gateway", "Nginx", "Terminación TLS/HTTPS y Rate Limiting")
  Container(seguridadFilter, "Control de Acceso y Sesión", "Node.js Middleware", "Tokens JWT y RBAC")
  Container(srv_1, "Servicio de Operaciones y Procesamiento", "Node.js / Express", "Lógica operativa del negocio")
  Container(srv_2, "Servicio de Verificación y Control", "Node.js / Express", "Validaciones de calidad y reglas")
  Container(srv_3, "Motor de Reportes y Liquidación", "Node.js / Express", "Métricas consolidadas y facturación")
  Container(adp_ext, "Adaptador de Servicios Externos", "Node.js Client", "Conexión con APIs externas")
  ContainerDb(dbRelacional, "Base de Datos del Sistema", "PostgreSQL", "Persistencia transaccional ACID")
  ContainerDb(cacheMem, "Memoria Caché", "Redis", "Caché de latencia < 0.8s")
  Container(auditStorage, "Almacén de Auditoría", "Elasticsearch / Audit Log", "Trazabilidad inmutable")
  Container(pipelineDevOps, "Automatización CI/CD", "GitHub Actions + Docker", "Pipeline de despliegue continuo")
}

Rel(operador, webApp, "Opera vía navegador", "HTTPS")
Rel(supervisor, webApp, "Supervisa y consulta", "HTTPS")
Rel(webApp, reverseProxy, "Transacciones API", "JSON / HTTPS")
Rel(reverseProxy, seguridadFilter, "Inspección de peticiones")
Rel(seguridadFilter, srv_1, "Delega solicitud autorizada")
Rel(seguridadFilter, srv_2, "Delega solicitud autorizada")
Rel(seguridadFilter, srv_3, "Delega solicitud autorizada")
Rel(srv_1, dbRelacional, "Lectura / Escritura ACID", "TCP/SQL")
Rel(srv_2, dbRelacional, "Lectura / Escritura ACID", "TCP/SQL")
Rel(srv_3, dbRelacional, "Lectura / Escritura ACID", "TCP/SQL")
Rel(srv_1, cacheMem, "Caché de alto rendimiento", "TCP")
Rel(srv_1, auditStorage, "Registra trazabilidad", "REST")
Rel(srv_2, auditStorage, "Registra trazabilidad", "REST")
Rel(seguridadFilter, ext_auth, "Verifica token", "HTTPS")
Rel(adp_ext, ext_ext, "Consume API externa", "REST")
Rel(srv_3, ext_notif, "Emite avisos y reportes", "SMTP")
Rel(pipelineDevOps, webApp, "Despliega SPA")
Rel(pipelineDevOps, reverseProxy, "Aplica configuración")
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
    const funcReqs = (aiResult.requerimientos || [])
      .filter(r => (r.tipo || "").toUpperCase() === "RF")
      .map((r, i) => ({
        id: r.identificador || `RF-${String(i + 1).padStart(2, "0")}`,
        name: r.nombre || "Requerimiento Funcional",
        description: r.descripcion || "",
        dependencies: r.dependencias || "Ninguna",
        actors: Array.isArray(r.actores) && r.actores.length ? r.actores : ["Operador Principal"],
        priority: r.prioridad || "Alta",
        precondition: r.precondiciones || "El usuario debe autenticarse en el sistema.",
        postcondition: r.poscondiciones || "Transacción registrada en base de datos.",
        approved: Boolean(r.aprobado)
      }));

    const nonFuncReqs = (aiResult.requerimientos || [])
      .filter(r => (r.tipo || "").toUpperCase() === "RNF")
      .map((r, i) => ({
        id: r.identificador || `RNF-${String(i + 1).padStart(2, "0")}`,
        category: r.nombre || "Requisito No Funcional",
        description: r.descripcion || "",
        dependencies: r.dependencias || "Ninguna",
        priority: r.prioridad || "Alta",
        metric: r.metrica_medible || "Métrica cuantitativa verificable según especificación formal",
        compliance: "Validado por Auditor QA/QC",
        approved: Boolean(r.aprobado)
      }));

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
      return sanitizePlantUML(generateDefaultPuml(typeKey, fallbackName));
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
        reviewHistory: source.revisiones || source.reviewHistory || []
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
  const [isGeneratingDiagrams, setIsGeneratingDiagrams] = useState(false);
  const [selectedAiProvider, setSelectedAiProvider] = useState("auto");
  const [availableProviders, setAvailableProviders] = useState([]);
  const [isSourcesCollapsed, setIsSourcesCollapsed] = useState(project.currentPhase >= 2);

  React.useEffect(() => {
    fetchAiModelsApi()
      .then((data) => {
        if (data?.proveedores?.length) {
          setAvailableProviders(data.proveedores);
          const defaultProvId = data.provider_defecto || "auto";
          const matchProv = data.proveedores.find((p) => p.id === defaultProvId && p.disponible !== false);
          setSelectedAiProvider(matchProv ? matchProv.id : "auto");
        }
      })
      .catch((err) => {
        console.warn("[Workspace] Error consultando modelos de IA:", err);
      });
  }, []);

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
      }
    }

    // 3. Si viene archivo real, subir al backend para que extraiga el texto (PDF o Audio)
    if (backendId && newSource.rawFile) {
      try {
        const uploaded = await uploadFuenteApi(backendId, newSource.rawFile);
        if (uploaded) {
          const finalSources = updatedSources.map((s) => {
            if (s.name === newSource.name || s.id === newSource.id) {
              return {
                ...s,
                id: uploaded.id || uploaded._id || s.id,
                uploaded: true,
                isUploading: false,
                rawFile: null,
                contentSnippet: uploaded.texto_transcrito || s.contentSnippet,
                category: uploaded.categoria || s.category,
                contentType: uploaded.tipo_contenido || s.contentType || "",
                description: uploaded.descripcion || s.description || "",
                authorOrigin: uploaded.autor_origen || s.authorOrigin || "",
                documentDate: uploaded.fecha_documento || s.documentDate || "",
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
      } catch (err) {
        console.warn("[Workspace] Error subiendo fuente al backend:", err);
      }
    }

    // En caso de que no requiera upload de archivo o falle, quitar bandera isUploading
    const finalizedSources = updatedSources.map((s) =>
      s.name === newSource.name || s.id === newSource.id
        ? { ...s, isUploading: false }
        : s
    );
    onUpdateProject({
      ...project,
      id: backendId || project.id,
      backendId: backendId || project.backendId,
      name: updatedName,
      sources: finalizedSources
    });
    return finalizedSources.find((source) => source.name === newSource.name || source.id === newSource.id);
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
          aiResult = await processWithAiApi(backendId, insumoBruto, '', providerToUse, null, 'requisitos');
        } catch (errAi) {
          console.error("[Workspace] Error en procesamiento con IA:", errAi.message);
          alert(`⚠️ ${errAi.message}`);
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
      let diags = {};

      if (!reqs?.functional?.length) {
        reqs = {
          functional: [
            {
              id: "RF-01",
              name: "Control y Registro Operativo Central",
              description: `Permite a los operadores registrar las transacciones y órdenes principales de ${updatedName} con validación en tiempo real y asignación de identificador único.`,
              actors: ["Operador Principal", "Supervisor"],
              priority: "Alta",
              precondition: "El usuario debe contar con turno operativo abierto.",
              postcondition: "Transacción confirmada en base de datos y visible en panel de control."
            },
            {
              id: "RF-02",
              name: "Módulo de Despacho y Actualización de Estados",
              description: "Sincroniza en tiempo real los estados de atención entre estaciones de trabajo conectadas, notificando alertas de retraso o prioridad.",
              actors: ["Personal Operativo", "Jefe de Área"],
              priority: "Alta",
              precondition: "Existen registros en estado pendiente de despacho.",
              postcondition: "El estado del pedido pasa a 'Completado' y se genera aviso acústico/visual."
            },
            {
              id: "RF-03",
              name: "Liquidación de Cuenta y Emisión de Comprobantes",
              description: "Efectúa el cálculo de subtotales, recargos, impuestos legales y emite la factura o comprobante con soporte para múltiples métodos de cobro.",
              actors: ["Cajero", "Administrador"],
              priority: "Alta",
              precondition: "Todos los ítems de la orden han sido verificados.",
              postcondition: "Se cierra la transacción financiera y se actualizan los saldos de caja."
            },
            {
              id: "RF-04",
              name: "Auditoría Diaria y Reporte de Métricas",
              description: "Genera el consolidado diario de operaciones por turnos, productos más demandados y tiempos medios de atención para evaluación de calidad.",
              actors: ["Administrador"],
              priority: "Media",
              precondition: "Cierre de jornada fiscal.",
              postcondition: "Archivo exportado en formato estándar para contabilidad."
            }
          ],
          nonFunctional: [
            {
              id: "RNF-01",
              category: "Rendimiento y Latencia",
              description: "El tiempo de respuesta al consultar órdenes y registros no debe superar los 0.65 segundos bajo concurrencia de hasta 120 peticiones simultáneas.",
              metric: "Latencia <= 0.65s (Percentil 95)",
              compliance: "Verificable con pruebas de carga K6 / JMeter"
            },
            {
              id: "RNF-02",
              category: "Alta Disponibilidad y Tolerancia a Fallos",
              description: "Disponibilidad del 99.95% con conmutación automática (failover) a servidor réplica esclavo en un tiempo menor a 3.0 segundos ante fallas del nodo primario.",
              metric: "Uptime 99.95% y Conmutación Failover <= 3.0s",
              compliance: "Simulación de caída de nodo primario bajo monitor continuo"
            },
            {
              id: "RNF-03",
              category: "Usabilidad y Ergonomía Visual",
              description: "La interfaz gráfica debe ser legible a una distancia de 60 cm con contraste tipográfico adecuado para estaciones táctiles.",
              metric: "Lectura contrastada a distancia >= 60 cm (Fuente >= 16px)",
              compliance: "Test ergonómico de interfaz con operario a 60 cm"
            },
            {
              id: "RNF-04",
              category: "Persistencia Transaccional ACID",
              description: "Persistencia estricta en base de datos relacional con respaldos incrementales automáticos cada 120 minutos sin caída del servicio.",
              metric: "RPO <= 120 minutos, integridad transaccional ACID",
              compliance: "Auditoría de consistencia de transacciones y réplica WAL"
            }
          ]
        };
      }

      if (aiResult?.objetivo !== "requisitos" && !diags?.useCase) {
        diags = {
          useCase: {
            id: "diag-uc",
            title: "Diagrama de Casos de Uso (UML Estándar)",
            type: "casos_uso",
            plantumlCode: generateDefaultPuml("useCase", updatedName),
            code: `graph LR
    subgraph "${updatedName}"
        UC1(["Control y Registro Operativo"])
        UC2(["Despacho y Coordinación"])
        UC3(["Liquidación y Facturación"])
        UC4(["Auditoría y Reportes Diarios"])
    end

    ActorOp[Operador] --> UC1
    ActorOp --> UC2
    ActorCaja[Cajero] --> UC3
    ActorAdmin[Administrador] --> UC4

    UC1 -.->|include| UC2
    UC3 -.->|include| UC1
`,
            description: "Actores con silueta humana (muñequito), módulo delimitado y casos de uso en elipse."
          },
          architecture: {
            id: "diag-arch",
            title: "Diagrama de Arquitectura (Structurizr C4)",
            type: "arquitectura",
            plantumlCode: generateDefaultPuml("architecture", updatedName),
            code: `graph TD
    Client["Terminales Cliente (Web / Táctil)"] --> LB["Balanceador de Carga NGINX (Failover)"]
    LB -->|Peticiones Primarias| Master["Servidor de Aplicación Maestro"]
    LB -.->|Conmutación <= 3s| Slave["Servidor Réplica Esclavo (Hot Standby)"]
    Master --> DB[("PostgreSQL Maestro")]
    Slave --> DBReplica[("PostgreSQL Replica Standby")]
    DB -.->|Replicación WAL| DBReplica
`,
            description: "Modelo de contenedores C4 con balanceador y réplica failover."
          },
          classDiagram: {
            id: "diag-class",
            title: "Diagrama de Clases del Dominio (PlantUML)",
            type: "clases",
            plantumlCode: generateDefaultPuml("classDiagram", updatedName),
            code: `classDiagram
    class OrdenOperativa {
        +int idOrden
        +DateTime fechaHora
        +String estado
        +float total
        +procesar()
    }
    class DetalleItem {
        +int idDetalle
        +int cantidad
        +float precioUnitario
    }
    class Usuario {
        +int idUsuario
        +String nombre
        +String rol
    }
    Usuario "1" -- "*" OrdenOperativa : registra
    OrdenOperativa "1" *-- "1..*" DetalleItem : contiene
`,
            description: "Entidades del modelo de datos con tipado y relaciones."
          },
          navigationTree: {
            id: "diag-nav",
            title: "Árbol de Navegación del Sistema",
            type: "navegacion",
            plantumlCode: generateDefaultPuml("navigationTree", updatedName),
            code: `graph TD
    Inicio["Inicio de Sesión"] --> Recuperacion["Recuperación de Contraseña"]
    Inicio --> Dashboard["Panel Principal"]
    Dashboard --> ModPedidos["Módulo de Pedidos"]
    ModPedidos --> ListadoPedidos["Listado de Pedidos"]
    ModPedidos --> DetallePedido["Detalle de Pedido"]
    Dashboard --> ModDespacho["Módulo de Despacho"]
    ModDespacho --> ListadoDespachos["Listado de Despachos"]
    Dashboard --> Administracion["Administración"]
    Administracion --> Usuarios["Gestión de Usuarios"]
    Administracion --> Configuracion["Configuración del Sistema"]
`,
            description: "Mapa jerárquico de pantallas y rutas de navegación del sistema."
          }
        };
      }

      // Deduplicar las fuentes por nombre para garantizar que nunca se repita la tarjeta
      const seenNames = new Set();
      const uniqueSources = (project.sources || []).filter((s) => {
        const fname = s.name;
        if (!fname || seenNames.has(fname)) return false;
        seenNames.add(fname);
        return true;
      });

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
        diagrams: {},
        mockups: []
      });
    } catch (err) {
      console.error("[Workspace] Error procesando con IA:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveAnalysis = async () => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) {
      alert("No se encontró el proyecto persistido. Guarda o reprocesa las fuentes antes de aprobar los requisitos.");
      return { success: false, error: "Proyecto no persistido" };
    }
    setIsGeneratingDiagrams(true);
    let approvalCompleted = Boolean(project.isAnalysisApproved);
    try {
      const latestRequirements = [
        ...(project.requirements?.functional || []).map((requirement, index) => ({
          ...requirement,
          tipo: 'RF',
          identificador: requirement.identificador || requirement.id || `RF-${String(index + 1).padStart(2, '0')}`
        })),
        ...(project.requirements?.nonFunctional || []).map((requirement, index) => ({
          ...requirement,
          tipo: 'RNF',
          identificador: requirement.identificador || requirement.id || `RNF-${String(index + 1).padStart(2, '0')}`
        }))
      ];
      const syncResult = await syncProjectRequirementsApi(backendId, latestRequirements);
      if (!syncResult) throw new Error("No se pudo guardar la versión final de los requisitos antes de generar los diagramas.");
      await approvePhaseApi(backendId, "analisis");
      approvalCompleted = true;
      const aiResult = await processWithAiApi(backendId, '', '', selectedAiProvider || 'auto', null, 'diagramas', DIAGRAM_TYPES.USE_CASES);
      const { diags } = transformAiOutput(aiResult, project.name, {});
      if (!diags?.useCase) {
        throw new Error("La generación no devolvió el diagrama de casos de uso.");
      }
      onUpdateProject({
        ...project,
        isAnalysisApproved: true,
        currentPhase: 2,
        diagrams: diags,
        diagramFlow: aiResult.flujoDiagramas || null
      });
      return { success: true };
    } catch (e) {
      console.warn("[Workspace] Error generando diagramas después de aprobar requisitos:", e);
      onUpdateProject({ ...project, isAnalysisApproved: approvalCompleted, currentPhase: 1, diagrams: {} });
      alert(`${approvalCompleted ? "Los requisitos fueron aprobados, pero no se pudieron generar los diagramas." : "No se pudieron aprobar los requisitos."} Puedes reintentar desde esta pantalla.\n\n${e.message}`);
      return { success: false, error: e.message };
    } finally {
      setIsGeneratingDiagrams(false);
    }
  };

  const handleGenerateDiagram = async (diagramType) => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) return { success: false, error: "Proyecto no persistido" };
    setIsGeneratingDiagrams(true);
    try {
      const aiResult = await processWithAiApi(
        backendId,
        '',
        '',
        selectedAiProvider || 'auto',
        null,
        'diagramas',
        diagramType
      );
      const { diags } = transformAiOutput(aiResult, project.name, project.diagrams || {});
      const key = DIAGRAM_KEY_BY_TYPE[diagramType];
      if (!key || !diags?.[key]) throw new Error(`No se recibió el diagrama ${diagramType}.`);
      onUpdateProject({
        ...project,
        diagrams: diags,
        diagramFlow: aiResult.flujoDiagramas || project.diagramFlow,
        currentPhase: 2
      });
      return { success: true, flow: aiResult.flujoDiagramas, diagramKey: key };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      setIsGeneratingDiagrams(false);
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

  const handleUpdateSource = async (sourceId, changes) => {
    const source = (project.sources || []).find((item) => item.id === sourceId);
    if (!source) throw new Error("No se encontró la fuente que deseas actualizar.");
    const backendSourceId = source.backendId || source.id;
    if (!backendSourceId || backendSourceId.startsWith("src-")) {
      throw new Error("Espera a que la fuente termine de cargarse antes de guardar sus detalles.");
    }

    const payload = {
      categoria: changes.category,
      tipo_contenido: changes.contentType,
      descripcion: changes.description,
      autor_origen: changes.authorOrigin,
      fecha_documento: changes.documentDate,
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
    if (!backendSourceId || backendSourceId.startsWith("src-")) {
      throw new Error("Espera a que la fuente termine de cargarse para usar el rellenado con IA.");
    }
    const suggestion = await suggestFuenteMetadataApi(backendSourceId, selectedAiProvider);
    return {
      category: suggestion.categoria,
      contentType: suggestion.tipo_contenido,
      description: suggestion.descripcion,
      authorOrigin: suggestion.autor_origen,
      documentDate: suggestion.fecha_documento,
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
    if (phase === "diagrams") {
      const diagTitleMap = {
        useCase: DIAGRAM_TYPES.USE_CASES,
        architecture: DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE,
        systemArchitecture: DIAGRAM_TYPES.SYSTEM_ARCHITECTURE,
        classDiagram: DIAGRAM_TYPES.DOMAIN_CLASSES,
        designClassDiagram: DIAGRAM_TYPES.DESIGN_CLASSES,
        navigationTree: DIAGRAM_TYPES.NAVIGATION_TREE
      };
      const targetType = diagTitleMap[diagKey] || diagKey || "diagramas";
      const curDiag = diagKey && project.diagrams?.[diagKey];
      const curPuml = curDiag ? (curDiag.plantumlCode || curDiag.code || "") : "";

      insumoAdicional = `[INSTRUCCIÓN DEL EXPERTO PARA MODIFICAR MODELADO DE ${targetType.toUpperCase()} EN PLANTUML]:\n${promptText.trim()}\n${curPuml ? `\nCÓDIGO PLANTUML ACTUAL:\n${curPuml}\n` : ""}\nOBLIGATORIO: Genera el código PlantUML ("codigo_plantuml") compilable y actualizado para este diagrama aplicando la instrucción del usuario.`;
    } else {
      insumoAdicional = `[INSTRUCCIÓN DEL EXPERTO EN ANÁLISIS DE REQUERIMIENTOS]:\n${promptText.trim()}`;
    }

    console.log(`[Workspace] Ejecutando corrección con IA en backend (${backendId}):`, promptText);

    if (backendId) {
      try {
        const objetivo = phase === "diagrams" ? "diagramas" : "requisitos";
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
    <div className="flex-1 flex h-full overflow-hidden bg-white">
      {/* SECCIÓN IZQUIERDA: Fuentes y Chat de Ajustes a la IA */}
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
        collapsed={isSourcesCollapsed}
        onToggleCollapsed={() => setIsSourcesCollapsed(value => !value)}
        isProcessing={isProcessing || isGeneratingDiagrams}
        isProcessed={project.isProcessed}
        projectName={project.name}
        onUpdateProjectName={handleUpdateProjectName}
        onBackToDashboard={onBackToDashboard}
        user={user}
        onLogout={onLogout}
        onApplyAiCorrection={(prompt) => {
          const activePhase = project.currentPhase === 2 ? "diagrams" : "analysis";
          return handleApplyAiCorrection(activePhase, prompt);
        }}
      />

      {/* SECCIÓN DERECHA: Contenido Organizado con Máximo Espacio de Visualización */}
      <main className="flex-1 overflow-hidden bg-white flex flex-col min-h-0">
        {isProcessing || isGeneratingDiagrams ? (
          /* Efecto Gemini en procesamiento */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="w-full flex flex-col items-center space-y-4">
              <div className="w-48 h-48 rounded-full gemini-aura-glow absolute -z-10 pointer-events-none"></div>
              <h3 className="text-base font-semibold gemini-gradient-text tracking-normal">
                {isGeneratingDiagrams
                  ? "Requisitos aprobados. Generando diagramas..."
                  : project.isProcessed ? "Reprocesando insumos y actualizando requisitos..." : "Generando especificación de requisitos..."}
              </h3>
              <div className="w-56 h-1.5 rounded-full gemini-wave-bar shadow-xs"></div>
              <p className="text-xs text-slate-400 font-normal">
                {isGeneratingDiagrams
                  ? "Construyendo casos de uso, arquitectura, clases y árbol de navegación desde los requisitos definitivos"
                  : project.isProcessed
                    ? "Analizando nuevos insumos y actualizando únicamente los requisitos"
                    : "Extrayendo y estructurando los requisitos del sistema para su revisión"}
              </p>

              <div className="w-full max-w-sm mt-4 space-y-2.5">
                <div className="h-4 rounded-md gemini-skeleton-loader w-full"></div>
                <div className="h-4 rounded-md gemini-skeleton-loader w-4/5 mx-auto"></div>
                <div className="h-4 rounded-md gemini-skeleton-loader w-3/5 mx-auto"></div>
              </div>
            </div>
          </div>
        ) : !project.isProcessed ? (
          /* Estado Inicial: Efecto Gemini en reposo */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-24 h-1 rounded-full gemini-wave-bar mb-4 opacity-70"></div>
              <p className="text-xs text-slate-400 max-w-xs font-normal">
                Carga tus insumos en el panel izquierdo y presiona Procesar
              </p>
            </div>
          </div>
        ) : project.currentPhase === 1 ? (
          /* FASE 1: Análisis (Requerimientos en texto estructurado limpio) */
          <RequirementsView
            requirements={project.requirements}
            onUpdateRequirements={(newReqs) => {
              onUpdateProject({
                ...project,
                requirements: newReqs
              });
              const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
              if (backendId) {
                const flatList = [
                  ...(newReqs.functional || []).map((r, i) => ({ ...r, tipo: 'RF', identificador: r.identificador || r.id || `RF-0${i + 1}` })),
                  ...(newReqs.nonFunctional || []).map((r, i) => ({ ...r, tipo: 'RNF', identificador: r.identificador || r.id || `RNF-0${i + 1}` }))
                ];
                syncProjectRequirementsApi(backendId, flatList).catch((err) => {
                  console.warn("[Workspace] Error persistiendo requerimientos editados:", err);
                });
              }
            }}
            onApprovePhase={handleApproveAnalysis}
            isApproved={project.isAnalysisApproved}
            onApplyAiCorrection={(prompt) => handleApplyAiCorrection("analysis", prompt)}
          />
        ) : project.currentPhase === 2 ? (
          /* FASE 2: Modelado (Diagramas PlantUML puros con máxima amplitud) */
          <DiagramsView
            diagrams={project.diagrams}
            mockups={project.mockups || []}
            onUpdateMockups={handleUpdateMockups}
            onUpdateDiagramCode={(key, newCode) => {
              onUpdateProject({
                ...project,
                diagrams: {
                  ...project.diagrams,
                  [key]: {
                    ...project.diagrams[key],
                    plantumlCode: newCode,
                    code: newCode
                  }
                }
              });

              const diagId = project.diagrams?.[key]?.id;
              if (diagId && diagId.length === 24) {
                updateDiagramApi(diagId, {
                  codigo_plantuml: newCode,
                  codigo_mermaid: newCode
                }).catch((err) => {
                  console.warn("[Workspace] Error persistiendo código de diagrama:", err);
                });
              }
            }}
            onGenerateDiagram={handleGenerateDiagram}
            onApproveDiagram={handleApproveDiagram}
            onRejectDiagram={handleRejectDiagram}
            onApproveMockups={handleApproveMockups}
            isDiagramsApproved={Boolean(project.isDiagramsApproved)}
            diagramFlow={project.diagramFlow}
            isGeneratingDiagram={isGeneratingDiagrams}
            onBackToAnalysis={() => {
              setIsSourcesCollapsed(false);
              onUpdateProject({ ...project, currentPhase: 1 });
            }}
            onApplyAiCorrection={(prompt, diagKey) => handleApplyAiCorrection("diagrams", prompt, diagKey)}
            projectId={project.backendId || (project.id && project.id.length === 24 ? project.id : null)}
            requirements={project.requirements}
          />
        ) : (
          /* FASE 3: Documento Consolidado */
          <DocumentViewer
            project={project}
            onBackToDiagrams={() => onUpdateProject({ ...project, currentPhase: 2 })}
          />
        )}
      </main>
    </div>
  );
}
