import React, { useState } from "react";
import SourcesPanel from "./SourcesPanel";
import RequirementsView from "./RequirementsView";
import DiagramsView from "./DiagramsView";
import DocumentViewer from "./DocumentViewer";
import { Sparkles, ArrowRight, Layers, GitBranch, FileText, CheckCircle2 } from "lucide-react";
import {
  createProjectApi,
  updateProjectApi,
  uploadFuenteApi,
  deleteFuenteApi,
  fetchFuentesApi,
  processWithAiApi,
  approvePhaseApi,
  updateDiagramApi
} from "../services/api";
import { sanitizePlantUML } from "../utils/plantumlEncoder";

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
      insumoBruto += `[Fuente: ${s.name} (${s.type})]\n${text.trim()}\n\n`;
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
      return `@startwbs
* ${safeName}
** Acceso y Seguridad
*** Inicio de Sesión
*** Recuperación de Contraseña
** Operaciones Principales
*** Módulo de Control y Registro
*** Módulo de Despacho y Logística
*** Control de Calidad y Pruebas
** Liquidación y Finanzas
*** Emisión de Comprobantes
*** Reporte de Cierre de Caja
** Auditoría y Configuración
*** Consolidado Diario de Métricas
*** Gestión de Roles y Usuarios
@endwbs`;

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

    const ucDiag = (aiResult.diagramas || []).find(d => (d.tipo || "").toLowerCase().includes("caso"));
    const archDiag = (aiResult.diagramas || []).find(d => (d.tipo || "").toLowerCase().includes("arqui"));
    const classDiag = (aiResult.diagramas || []).find(d => (d.tipo || "").toLowerCase().includes("clase") || (d.tipo || "").toLowerCase().includes("entidad") || (d.tipo || "").toLowerCase().includes("dominio"));
    const navDiag = (aiResult.diagramas || []).find(d => (d.tipo || "").toLowerCase().includes("arbol") || (d.tipo || "").toLowerCase().includes("nav") || (d.tipo || "").toLowerCase().includes("wbs"));

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

    diags = {
      useCase: {
        id: "diag-uc",
        title: (ucDiag?.titulo || "Diagrama de Casos de Uso").replace(/\s*\([^)]*\)/g, '').trim(),
        type: "casos_uso",
        code: extractPuml(ucDiag, "useCase"),
        plantumlCode: extractPuml(ucDiag, "useCase"),
        description: ucDiag?.descripcion || "",
        descripcion_jerarquica: Array.isArray(ucDiag?.descripcion_jerarquica) && ucDiag.descripcion_jerarquica.length > 0
          ? ucDiag.descripcion_jerarquica
          : []
      },
      architecture: {
        id: "diag-arch",
        title: (archDiag?.titulo || "Diagrama de Arquitectura (C4 Container)").replace(/\s*\([^)]*\)/g, '').trim(),
        type: "arquitectura",
        code: extractPuml(archDiag, "architecture"),
        plantumlCode: extractPuml(archDiag, "architecture"),
        description: archDiag?.descripcion || "",
        descripcion_jerarquica: Array.isArray(archDiag?.descripcion_jerarquica) && archDiag.descripcion_jerarquica.length > 0
          ? archDiag.descripcion_jerarquica
          : []
      },
      classDiagram: {
        id: "diag-class",
        title: (classDiag?.titulo || "Diagrama de Clases del Dominio").replace(/\s*\([^)]*\)/g, '').trim(),
        type: "clases",
        code: extractPuml(classDiag, "classDiagram"),
        plantumlCode: extractPuml(classDiag, "classDiagram"),
        description: classDiag?.descripcion || "",
        descripcion_jerarquica: Array.isArray(classDiag?.descripcion_jerarquica) && classDiag.descripcion_jerarquica.length > 0
          ? classDiag.descripcion_jerarquica
          : []
      },
      navigationTree: {
        id: "diag-nav",
        title: (navDiag?.titulo || "Árbol de Navegación del Sistema (WBS)").replace(/\s*\([^)]*\)/g, '').trim(),
        type: "navegacion",
        code: extractPuml(navDiag, "navigationTree"),
        plantumlCode: extractPuml(navDiag, "navigationTree"),
        description: navDiag?.descripcion || "",
        descripcion_jerarquica: Array.isArray(navDiag?.descripcion_jerarquica) && navDiag.descripcion_jerarquica.length > 0
          ? navDiag.descripcion_jerarquica
          : []
      }
    };
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
    sources: [],
    requirements: { functional: [], nonFunctional: [] },
    diagrams: {}
  };

  const project = rawProject || defaultEmptyProject;

  const [isProcessing, setIsProcessing] = useState(false);

  // Subida / Eliminación de fuentes
  const handleAddSource = async (newSource) => {
    const currentSources = project.sources || [];
    
    // Evitar fuentes duplicadas en la lista comparando por nombre de archivo
    const existingIndex = currentSources.findIndex((s) => s.name === newSource.name);
    let updatedSources;
    if (existingIndex >= 0) {
      updatedSources = [...currentSources];
      updatedSources[existingIndex] = { ...currentSources[existingIndex], ...newSource };
    } else {
      updatedSources = [newSource, ...currentSources];
    }

    let updatedName = project.name;
    if (!updatedName || updatedName === "Proyecto sin nombre") {
      const cleanName = newSource.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
      updatedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    // Si no existe ID en backend, crearlo para poder asociar y procesar fuentes de inmediato
    let backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (!backendId) {
      try {
        const created = await createProjectApi({
          nombre: updatedName,
          descripcion: project.description || "Especificación generada por I-CASE asistida por IA"
        });
        if (created && (created.id || created._id)) {
          backendId = created.id || created._id;
        }
      } catch (errCreate) {
        console.warn("[Workspace] Error inicializando proyecto en backend:", errCreate);
      }
    }

    // Si viene archivo real, subir al backend para que extraiga el texto (PDF o Audio)
    if (backendId && newSource.rawFile) {
      try {
        const uploaded = await uploadFuenteApi(backendId, newSource.rawFile);
        if (uploaded) {
          newSource.uploaded = true;
          newSource.rawFile = null; // No volver a subir en handleProcess
          if (uploaded.texto_transcrito) {
            newSource.contentSnippet = uploaded.texto_transcrito;
            console.log(`[Workspace] Texto de fuente "${newSource.name}" extraído en backend (${uploaded.texto_transcrito.length} caracteres)`);
          }
        }
      } catch (err) {
        console.warn("[Workspace] Error subiendo fuente al backend:", err);
      }
    }

    onUpdateProject({
      ...project,
      backendId,
      name: updatedName,
      sources: updatedSources
    });
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
  const handleProcess = async () => {
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

      console.log("[Workspace] Enviando a procesar con IA. Insumo length:", insumoBruto.length, "backendId:", backendId);

      // Invocación al endpoint de IA del backend enviando el insumo completo
      let aiResult = null;
      if (backendId) {
        aiResult = await processWithAiApi(backendId, insumoBruto);
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

      let { reqs, diags } = transformAiOutput(aiResult, updatedName, project.diagrams);

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

      if (!diags?.useCase) {
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
            title: "Árbol de Navegación del Sistema (WBS)",
            type: "navegacion",
            plantumlCode: generateDefaultPuml("navigationTree", updatedName),
            code: `graph TD
    Inicio["Login / Autenticación"] --> Dashboard["Tablero Principal"]
    Dashboard --> ModOperativo["Módulo de Operación"]
    Dashboard --> ModDespacho["Módulo de Despacho"]
    Dashboard --> ModCaja["Módulo de Liquidación"]
    Dashboard --> ModReportes["Módulo de Auditoría"]
`,
            description: "Estructura jerárquica de pantallas del sistema en WBS."
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
        requirements: reqs,
        diagrams: diags
      });
    } catch (err) {
      console.error("[Workspace] Error procesando con IA:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveAnalysis = async () => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (backendId) {
      try {
        await approvePhaseApi(backendId, "analisis");
      } catch (e) {
        console.warn("[Workspace] Error aprobando análisis en backend:", e);
      }
    }
    onUpdateProject({
      ...project,
      isAnalysisApproved: true,
      currentPhase: 2 // Avanza a Fase 2 (Diagramas)
    });
  };

  const handleApproveDiagrams = async () => {
    const backendId = project.backendId || (project.id && project.id.length === 24 ? project.id : null);
    if (backendId) {
      try {
        await approvePhaseApi(backendId, "diseno");
      } catch (e) {
        console.warn("[Workspace] Error aprobando diseño en backend:", e);
      }
    }
    onUpdateProject({
      ...project,
      isDiagramsApproved: true,
      currentPhase: 3 // Avanza a Fase 3 (Documento)
    });
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
        useCase: "casos_de_uso",
        architecture: "arquitectura",
        classDiagram: "clases",
        navigationTree: "arbol_navegacion"
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
        const aiResult = await processWithAiApi(backendId, insumoBruto, insumoAdicional);
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
            diagrams: diags || project.diagrams
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

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-white">
      {/* SECCIÓN IZQUIERDA: Fuentes y Chat de Ajustes a la IA */}
      <SourcesPanel
        sources={project.sources || []}
        onAddSource={handleAddSource}
        onDeleteSource={handleDeleteSource}
        onProcess={handleProcess}
        isProcessing={isProcessing}
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
        {isProcessing ? (
          /* Efecto Gemini en procesamiento */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="w-full flex flex-col items-center space-y-4">
              <div className="w-48 h-48 rounded-full gemini-aura-glow absolute -z-10 pointer-events-none"></div>
              <h3 className="text-base font-semibold gemini-gradient-text tracking-normal">
                {project.isProcessed ? "Reprocesando insumos y actualizando especificación..." : "Generando especificación y modelado..."}
              </h3>
              <div className="w-56 h-1.5 rounded-full gemini-wave-bar shadow-xs"></div>
              <p className="text-xs text-slate-400 font-normal">
                {project.isProcessed
                  ? "Analizando nuevos insumos y actualizando requerimientos y modelado con IA"
                  : "Extrayendo requerimientos del sistema y modelando diagramas"}
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
            onApprovePhase={handleApproveAnalysis}
            isApproved={project.isAnalysisApproved}
            onApplyAiCorrection={(prompt) => handleApplyAiCorrection("analysis", prompt)}
          />
        ) : project.currentPhase === 2 ? (
          /* FASE 2: Modelado (Diagramas PlantUML puros con máxima amplitud) */
          <DiagramsView
            diagrams={project.diagrams}
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
            onApprovePhase={handleApproveDiagrams}
            onBackToAnalysis={() => onUpdateProject({ ...project, currentPhase: 1 })}
            onApplyAiCorrection={(prompt, diagKey) => handleApplyAiCorrection("diagrams", prompt, diagKey)}
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
