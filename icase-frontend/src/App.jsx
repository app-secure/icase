import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import ProjectDashboard from "./components/ProjectDashboard";
import ProjectWorkspace from "./components/ProjectWorkspace";
import { fetchProjects, createProjectApi, deleteProjectApi } from "./services/api";
import { sanitizePlantUML } from "./utils/plantumlEncoder";

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [view, setView] = useState("dashboard"); // "dashboard" | "workspace"

  // Cargar proyectos persistidos en el Backend MongoDB al iniciar
  useEffect(() => {
    async function loadBackendProjects() {
      const data = await fetchProjects();
      if (data && Array.isArray(data) && data.length > 0) {
        const mapped = data.map((p) => {
          const reqs = p.requerimientos || [];
          const diags = p.diagramas || [];
          const safePName = (p.nombre || "Sistema de Software").replace(/["“”]/g, "'");
          const cuItem = diags.find((d) => d.tipo === "casos_de_uso" || d.tipo === "casos_uso");
          const archItem = diags.find((d) => d.tipo === "arquitectura");
          const classItem = diags.find((d) => d.tipo === "clases" || d.tipo === "clases_dominio" || d.tipo === "entidad_relacion");
          const navItem = diags.find((d) => d.tipo === "arbol_navegacion" || d.tipo === "navegacion" || d.tipo === "wbs");

          // Extraer actores y clases dinámicamente de los requerimientos reales
          const rfList = reqs.filter(r => (r.tipo || '').toUpperCase() === 'RF');
          const rawActors = [];
          rfList.forEach(r => {
            if (Array.isArray(r.actores)) rawActors.push(...r.actores);
            else if (typeof r.actores === 'string') rawActors.push(r.actores);
          });
          const uniqueActors = [...new Set(rawActors.map(a => a?.trim()))].filter(Boolean).slice(0, 3);
          if (uniqueActors.length === 0) uniqueActors.push("Operador Principal", "Administrador");

          const toPascal = (str) => {
            if (!str) return 'Entidad';
            const clean = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, ' ');
            const words = clean.split(/\s+/).filter(w => w.length > 2);
            return words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Modulo';
          };

          const dynamicClasses = rfList.slice(0, 4).map(r => toPascal(r.nombre));
          if (dynamicClasses.length === 0) dynamicClasses.push("RegistroOperativo", "GestionProceso");

          const defUcPlant = `@startuml\nleft to right direction\nskinparam packageStyle rectangle\nskinparam actorStyle awesome\n` +
            uniqueActors.map((a, i) => `actor "${a}" as Act${i + 1}`).join('\n') +
            `\nrectangle "${safePName}" {\n` +
            (rfList.slice(0, 4).map((r, i) => `  usecase "${r.nombre.replace(/["“”]/g, "'")}" as UC${i + 1}`).join('\n') || `  usecase "Operación Principal" as UC1`) +
            `\n}\n` +
            (rfList.slice(0, 4).map((_, i) => `Act${(i % uniqueActors.length) + 1} --> UC${i + 1}`).join('\n') || `Act1 --> UC1`) +
            `\n@enduml`;

          const actorLines = uniqueActors.map((act, i) => `Person(actor_${i + 1}, "${act}", "Interacción y operación")`).join('\n');
          const actorRelLines = uniqueActors.map((_, i) => `Rel(actor_${i + 1}, webApp, "Opera vía navegador", "HTTPS")`).join('\n');
          const srvContainers = rfList.slice(0, 4).map((rf, i) => {
            const cleanName = (rf.nombre || `Operación ${i + 1}`).replace(/["“”]/g, "'");
            return `  Container(srv_${i + 1}, "Servicio de ${cleanName}", "Node.js / Express", "Lógica de ${cleanName}")`;
          }).join('\n') || '  Container(srv_1, "Servicio de Operaciones", "Node.js / Express", "Lógica nodal")';
          const srvRelations = rfList.slice(0, 4).map((_, i) => {
            return `Rel(seguridadFilter, srv_${i + 1}, "Delega solicitud")\nRel(srv_${i + 1}, dbRelacional, "Lectura / Escritura ACID", "TCP/SQL")\nRel(srv_${i + 1}, auditStorage, "Registra trazabilidad", "REST")`;
          }).join('\n') || 'Rel(seguridadFilter, srv_1, "Delega solicitud")\nRel(srv_1, dbRelacional, "Lectura/Escritura", "TCP/SQL")\nRel(srv_1, auditStorage, "Trazabilidad", "REST")';

          const defArchPlant = `@startuml
!include <C4/C4_Container>
title Arquitectura Técnica Integral - ${safePName}

${actorLines}

System_Ext(ext_auth, "Servidor de Identidad / SSO", "OAuth2 / JWT")
System_Ext(ext_notif, "Servidor de Notificaciones", "SMTP / WebPush")
System_Ext(ext_ext, "Servicios Externos / APIs", "Integración externa")

System_Boundary(sys, "${safePName}") {
  Container(webApp, "Portal Web y Móvil PWA", "React.js / TypeScript", "Frontend interactivo")
  Container(reverseProxy, "Proxy Inverso y Gateway", "Nginx", "Terminación TLS/HTTPS y Rate Limiting")
  Container(seguridadFilter, "Control de Acceso y Sesión", "Node.js Middleware", "Tokens JWT y RBAC")
${srvContainers}
  Container(adp_ext, "Adaptador de Servicios Externos", "Node.js Client", "Conexión con APIs externas")
  ContainerDb(dbRelacional, "Base de Datos del Sistema", "PostgreSQL", "Almacén relacional con ACID")
  ContainerDb(cacheMem, "Memoria Caché", "Redis", "Caché de latencia < 0.8s")
  Container(auditStorage, "Almacén de Auditoría", "Elasticsearch / Audit Log", "Trazabilidad inmutable")
  Container(pipelineDevOps, "Automatización CI/CD", "GitHub Actions + Docker", "Pipeline de pruebas y despliegue")
}

${actorRelLines}
Rel(webApp, reverseProxy, "Transacciones API", "JSON / HTTPS")
Rel(reverseProxy, seguridadFilter, "Inspección de peticiones")
${srvRelations}
Rel(srv_1, cacheMem, "Caché de alto rendimiento", "TCP")
Rel(seguridadFilter, ext_auth, "Verifica token", "HTTPS")
Rel(adp_ext, ext_ext, "Consume API externa", "REST")
Rel(pipelineDevOps, webApp, "Despliega SPA")
Rel(pipelineDevOps, reverseProxy, "Configura proxy")
@enduml`;

          const defClassPlant = `@startuml\nskinparam classAttributeIconSize 0\nclass Usuario {\n  +int idUsuario\n  +String nombre\n  +String rol\n  +autenticar(): boolean\n}\n` +
            dynamicClasses.map(c => `class ${c} {\n  +String id${c}\n  +DateTime fecha\n  +String estado\n  +procesar(): boolean\n}`).join('\n') +
            `\nUsuario "1" -- "*" ${dynamicClasses[0]} : gestiona\n` +
            (dynamicClasses.length > 1 ? `${dynamicClasses[0]} "1" *-- "1..*" ${dynamicClasses[1]} : incluye\n` : '') +
            `@enduml`;

          const defNavPlant = `@startwbs\n* ${safePName}\n** Acceso y Seguridad\n*** Inicio de Sesión\n** Módulos Principales\n` +
            (rfList.slice(0, 4).map(r => `*** ${r.nombre.replace(/[*_#]/g, '').trim()}`).join('\n') || `*** Panel de Control`) +
            `\n** Auditoría y Reportes\n*** Métricas del Sistema\n@endwbs`;

          // Deduplicar fuentes por nombre de archivo para evitar tarjetas repetidas
          const seenNames = new Set();
          const fuentesUnicas = (p.fuentes || [])
            .filter((f) => {
              const fname = f.nombre_archivo || f.name;
              if (!fname || seenNames.has(fname)) return false;
              seenNames.add(fname);
              return true;
            })
            .map((f) => ({
              id: f.id || f._id,
              name: f.nombre_archivo || "Archivo de entrada",
              type: f.tipo || "txt",
              size: f.tamanio || "10 KB",
              date: new Date(f.createdAt || Date.now()).toLocaleDateString("es-ES"),
              contentSnippet: f.texto_transcrito?.slice(0, 160) || ""
            }));

          return {
            id: p.id || p._id,
            backendId: p.id || p._id,
            name: pName,
            description: p.descripcion || "",
            category: "Ingeniería de Software / CASE",
            updatedAt: new Date(p.updatedAt || Date.now()).toLocaleDateString("es-ES"),
            currentPhase: p.estado_fase === "finalizado" ? 3 : (p.estado_fase === "diseno_aprobado" || p.estado_fase === "diseno_pendiente" ? 2 : (p.estado_fase === "analisis_aprobado" || p.estado_fase === "analisis_pendiente" ? 1 : 0)),
            isProcessed: p.estado_fase !== "insumos_pendientes",
            isAnalysisApproved: ["analisis_aprobado", "diseno_pendiente", "diseno_aprobado", "finalizado"].includes(p.estado_fase),
            isDiagramsApproved: ["diseno_aprobado", "finalizado"].includes(p.estado_fase),
            sources: fuentesUnicas,
              requirements: {
                functional: reqs.filter((r) => r.tipo === "RF").map((r) => ({
                  id: r.identificador,
                  name: r.nombre,
                  description: r.descripcion,
                  actors: r.actores,
                  priority: r.prioridad,
                  precondition: r.precondiciones,
                  postcondition: r.poscondiciones,
                  approved: r.aprobado
                })),
                nonFunctional: reqs
                  .filter(
                    (r) =>
                      r.tipo === "RNF" &&
                      !r.nombre?.includes("Ajuste Validado por Experto") &&
                      !r.descripcion?.includes("Requisito incorporado por corrección")
                  )
                  .map((r) => ({
                    id: r.identificador,
                    category: r.nombre,
                    description: r.descripcion,
                    metric: r.metrica_medible,
                    compliance: "Validado por Auditor QA/QC IEEE 830",
                    approved: r.aprobado
                  }))
              },
              diagrams: {
                useCase: {
                  id: "diag-uc",
                  title: cuItem?.titulo || "Diagrama de Casos de Uso (UML Estándar)",
                  type: "casos_uso",
                  code: (cuItem?.codigo_mermaid && !cuItem.codigo_mermaid.includes("@start")) ? cuItem.codigo_mermaid : "graph LR\n  Op[Operador Principal] --> UC1((Control y Registro))\n  Op --> UC2((Despacho y Coordinación))\n  Admin[Administrador] --> UC3((Liquidación y Cobro))\n  Admin --> UC4((Reporte Diario))",
                  plantumlCode: sanitizePlantUML(cuItem?.codigo_plantuml) || defUcPlant,
                  description: cuItem?.descripcion || "Actores con silueta humana (muñequito), módulo delimitador y casos de uso en elipse."
                },
                architecture: {
                  id: "diag-arch",
                  title: archItem?.titulo || "Diagrama de Arquitectura (Structurizr C4)",
                  type: "arquitectura",
                  code: (archItem?.codigo_mermaid && !archItem.codigo_mermaid.includes("@start")) ? archItem.codigo_mermaid : "graph TB\n  Web[SPA React] --> API[Backend Express]\n  API --> DB[(BD Primaria)]\n  DB -.-> DBRep[(BD Réplica Failover)]",
                  plantumlCode: sanitizePlantUML(archItem?.codigo_plantuml) || defArchPlant,
                  description: archItem?.descripcion || "Modelo de contenedores C4 con balanceador y réplica failover."
                },
                classDiagram: {
                  id: "diag-class",
                  title: classItem?.titulo || "Diagrama de Clases del Dominio",
                  type: "clases",
                  code: (classItem?.codigo_mermaid && !classItem.codigo_mermaid.includes("@start")) ? classItem.codigo_mermaid : defClassPlant,
                  plantumlCode: sanitizePlantUML(classItem?.codigo_plantuml) || defClassPlant,
                  description: classItem?.descripcion || "Entidades del modelo de datos con tipado, llaves y cardinalidad."
                },
                navigationTree: {
                  id: "diag-nav",
                  title: navItem?.titulo || "Árbol de Navegación del Sistema (WBS)",
                  type: "navegacion",
                  code: (navItem?.codigo_mermaid && !navItem.codigo_mermaid.includes("@start")) ? navItem.codigo_mermaid : "graph TD\n  Root[Sistema] --> M1[Acceso]\n  Root --> M2[Operaciones]\n  Root --> M3[Liquidación]\n  Root --> M4[Auditoría]",
                  plantumlCode: sanitizePlantUML(navItem?.codigo_plantuml) || defNavPlant,
                  description: navItem?.descripcion || "Mapa jerárquico de pantallas y módulos en WBS."
                }
              }
            };
          });

        // Mostrar únicamente proyectos reales con fuentes cargadas, requerimientos o nombre personalizado
        const validProjects = mapped.filter(p => 
          (p.sources && p.sources.length > 0) || 
          (p.requirements && (p.requirements.functional?.length > 0 || p.requirements.nonFunctional?.length > 0)) ||
          (p.name && p.name.trim() !== "Proyecto sin nombre" && p.name.trim() !== "")
        );
        setProjects(validProjects);
        if (validProjects.length > 0) {
          setActiveProjectId(validProjects[0].id);
        } else {
          setActiveProjectId(null);
        }
      } else {
        setProjects([]);
        setActiveProjectId(null);
      }
    }

    loadBackendProjects();
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleSelectProject = (projectId) => {
    setActiveProjectId(projectId);
    setView("workspace");
  };

  const handleCreateProject = async (newProject) => {
    let finalProject = { ...newProject };
    try {
      const created = await createProjectApi({
        nombre: newProject.name,
        descripcion: newProject.description || ""
      });
      if (created && (created.id || created._id)) {
        finalProject.backendId = created.id || created._id;
        finalProject.id = created.id || created._id;
      }
    } catch (e) {
      console.warn("[App] Error creando proyecto en backend:", e);
    }

    setProjects([finalProject, ...projects]);
    setActiveProjectId(finalProject.id);
    setView("workspace");
  };

  const handleDeleteProject = async (projectId) => {
    const proj = projects.find((p) => p.id === projectId);
    const targetBackendId = proj?.backendId || projectId;
    try {
      await deleteProjectApi(targetBackendId);
    } catch (e) {
      console.warn("[App] Error eliminando proyecto en backend:", e);
    }

    const filtered = projects.filter((p) => p.id !== projectId);
    setProjects(filtered);
    if (activeProjectId === projectId) {
      setActiveProjectId(filtered[0]?.id || null);
    }
  };

  const handleUpdateProject = (updatedProject) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === updatedProject.id || (p.backendId && p.backendId === updatedProject.backendId)
          ? { ...p, ...updatedProject }
          : p
      )
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#f8fafd] text-slate-900 overflow-hidden font-sans select-text">
      <Header
        activeView={view}
        projectName={view === "workspace" ? activeProject?.name : null}
        onGoToProjects={() => setView("dashboard")}
      />

      <div className="flex-1 flex overflow-hidden">
        {view === "dashboard" ? (
          <ProjectDashboard
            projects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
          />
        ) : (
          <ProjectWorkspace
            project={activeProject}
            allProjects={projects}
            onUpdateProject={handleUpdateProject}
            onSelectProject={setActiveProjectId}
            onBackToDashboard={() => setView("dashboard")}
          />
        )}
      </div>
    </div>
  );
}
