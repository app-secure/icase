import React, { useState } from "react";
import { ChevronLeft, CheckCircle2, FileText } from "lucide-react";
import StaticDiagram from "./StaticDiagram";
import PdfPreviewModal from "./PdfPreviewModal";

export default function DocumentViewer({ project, onBackToDiagrams }) {
  const [showPdfModal, setShowPdfModal] = useState(false);

  const objetivosGenerales = project.objetivos?.general ||
    `Desarrollar e implementar el software ${project.name || "del sistema"} con arquitectura modular, garantizando la automatización de sus procesos clave, integridad y persistencia transaccional.`;

  const objetivosEspecificos = project.objetivos?.especificos && project.objetivos.especificos.length > 0
    ? project.objetivos.especificos
    : [
        `Realizar el análisis formal de requisitos funcionales y no funcionales cuantificables para ${project.name || "el sistema"}.`,
        `Diseñar los casos de uso fundamentales y el modelo de clases de dominio con tipado estricto.`,
        `Modelar la arquitectura de software de alta disponibilidad con tolerancia a fallos y el árbol jerárquico de navegación.`
      ];

  const resumenTexto = project.resumenEjecutivo || project.resumen_ejecutivo || project.description ||
    `El proyecto ${project.name || "del sistema"} busca implementar una solución tecnológica integral de software para la automatización y gestión de sus operaciones nodales, estableciendo una base analítica y arquitectónica con alta disponibilidad y persistencia transaccional.`;

  const introduccionTexto = project.introduccion ||
    `En el entorno operacional contemporáneo, la ausencia de una adecuada especificación formal suele traducirse en sobrecostos, retrasos e inconsistencias operativas. El presente documento técnico estructura los requerimientos a partir de los insumos provistos por los interesados del dominio, asegurando consistencia, trazabilidad y cumplimiento de estándares de calidad para ${project.name || "el sistema"}.`;

  const cleanFunctional = (project.requirements?.functional || []).filter(
    (rf) => !rf.name?.includes("Ajuste Validado por Experto")
  );

  const cleanNonFunctional = (project.requirements?.nonFunctional || []).filter(
    (rnf) =>
      !rnf.category?.includes("Ajuste Validado por Experto") &&
      !rnf.description?.includes("Requisito incorporado por corrección")
  );

  const palabrasClave = (
    project.palabras_clave && project.palabras_clave.length > 0
      ? project.palabras_clave
      : cleanFunctional.slice(0, 7).map((rf) => rf.name.replace(/^(Gestión de|Control de|Registro de|Módulo de)\s*/i, ""))
  ).filter((k) => !/case|plantuml|mermaid|uml|clean architecture|upper/i.test(k));

  const renderDiagramExplanation = (diag) => {
    if (!diag) return null;
    const jerarquia = Array.isArray(diag.descripcion_jerarquica) && diag.descripcion_jerarquica.length > 0
      ? diag.descripcion_jerarquica
      : null;
    const narrativa = diag.description || diag.descripcion;

    if (!jerarquia && !narrativa) return null;

    return (
      <div className="mt-3 text-xs text-slate-700 space-y-1.5">
        <p className="font-bold text-slate-900 text-xs">Explicación del Funcionamiento del Sistema:</p>
        {narrativa && (
          <p className="text-xs text-slate-600 leading-relaxed mb-2">
            {narrativa}
          </p>
        )}
        {jerarquia && (
          <ul className="list-disc pl-5 space-y-1 leading-relaxed">
            {jerarquia.map((item, idx) => {
              if (typeof item === "string" && item.includes(":")) {
                const [prefix, ...rest] = item.split(":");
                return (
                  <li key={idx}>
                    <strong className="text-slate-900">{prefix.trim()}:</strong>
                    <span>{rest.join(":")}</span>
                  </li>
                );
              }
              return <li key={idx}>{item}</li>;
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white max-w-4xl mx-auto w-full">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToDiagrams}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-600 transition-colors flex items-center gap-1 text-xs cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Volver a Modelado</span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 size={13} />
            Documento de Especificación del Sistema
          </span>
        </div>

        {/* Botón Principal: Previsualizar documento en PDF */}
        <button
          type="button"
          onClick={() => setShowPdfModal(true)}
          className="px-4 py-2 bg-[#0b57d0] hover:bg-blue-700 text-white rounded-full text-xs font-medium flex items-center gap-2 shadow-xs transition-all cursor-pointer"
        >
          <FileText size={15} />
          <span>Previsualizar documento en PDF</span>
        </button>
      </div>

      {/* Main Document Body */}
      <div className="flex-1 overflow-y-auto pr-4 space-y-8 text-slate-800 text-[15px] leading-relaxed">
        {/* Cover & Title */}
        <div className="border-b border-slate-200 pb-6">
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-1">
            DOCUMENTACIÓN TÉCNICA FORMAL • ESPECIFICACIÓN IEEE 830
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
            1. {project.name}
          </h1>
          <p className="text-sm text-slate-600">
            {project.description || `Especificación técnica formal y diseño preliminar para ${project.name || "el sistema"}.`}
          </p>
          <div className="mt-3 text-xs text-slate-400 flex items-center gap-4">
            <span>Fecha de Emisión: {new Date().toLocaleDateString("es-ES")}</span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Validado por Experto en Software</span>
          </div>
        </div>

        {/* 2. Objetivos */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">2. Objetivos</h2>
          <div className="pl-4 space-y-3 text-sm text-slate-700">
            <p>
              <strong>2.1 General:</strong> {objetivosGenerales}
            </p>
            <div>
              <strong>2.2 Específicos:</strong>
              <ul className="list-disc pl-5 mt-1.5 space-y-1">
                {objetivosEspecificos.map((obj, i) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Resumen */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">3. Resumen</h2>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {resumenTexto}
          </p>
        </section>

        {/* 4. Palabras Clave del Negocio / Dominio */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">4. Palabras Clave</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {palabrasClave.map((kw, i) => (
              <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                {kw}
              </span>
            ))}
          </div>
        </section>

        {/* 5. Introducción */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">5. Introducción</h2>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {introduccionTexto}
          </p>
        </section>

        {/* 6. Fuentes Analizadas (En Viñetas Simples) */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">6. Fuentes e Insumos Analizados</h2>
          {project.sources && project.sources.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              {project.sources.map((s) => (
                <li key={s.id}>
                  {s.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500 italic">Insumos incorporados textualmente en la sesión.</p>
          )}
        </section>

        {/* 7. Especificación de Requerimientos en Formato Tabular Formal */}
        <section className="space-y-6 pt-4 border-t border-slate-200">
          <h2 className="text-base font-bold text-slate-900">7. Especificación de Requerimientos del Sistema</h2>

          {/* 7.1 Requerimientos Funcionales */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800">
              7.1 Especificación de Requerimientos Funcionales
            </h3>
            <div className="space-y-6">
              {cleanFunctional.map((rf, idx) => (
                <div key={rf.id || idx} className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm">{rf.name}</h4>
                  <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-2xs">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="w-1/3 bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            ID del requerimiento
                          </td>
                          <td className="w-2/3 p-2.5 text-slate-800 font-mono font-bold">
                            {rf.identificador || rf.id || `RF-0${idx + 1}`}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Nombre del requerimiento
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium">
                            {rf.name}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200 align-top">
                            Descripción
                          </td>
                          <td className="p-2.5 text-slate-700 leading-relaxed whitespace-pre-line">
                            {rf.description}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Dependencias
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {rf.dependencies || "Ninguna"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Prioridad
                          </td>
                          <td className="p-2.5 text-slate-700 font-medium">
                            {rf.priority || "Alta"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Actores
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {Array.isArray(rf.actors) ? rf.actors.join(", ") : rf.actors || "Operador Principal"}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Precondiciones
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {rf.precondition || "El usuario accede a la plataforma con credenciales válidas"}
                          </td>
                        </tr>
                        <tr>
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Postcondiciones
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {rf.postcondition || "Transacción registrada y confirmada en la base de datos"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7.2 Requisitos No Funcionales Cuantificables */}
          <div className="space-y-4 pt-4">
            <h3 className="text-sm font-bold text-slate-800">
              7.2 Requisitos No Funcionales Cuantificables
            </h3>
            <div className="space-y-6">
              {cleanNonFunctional.map((rnf, idx) => (
                <div key={rnf.id || idx} className="space-y-2">
                  <h4 className="font-bold text-slate-900 text-sm">{rnf.category || rnf.nombre}</h4>
                  <div className="overflow-x-auto border border-slate-300 rounded-lg shadow-2xs">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-200">
                          <td className="w-1/3 bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            ID del requerimiento
                          </td>
                          <td className="w-2/3 p-2.5 text-slate-800 font-mono font-bold">
                            {rnf.identificador || rnf.id || `RNF-0${idx + 1}`}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Nombre / Categoría
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium">
                            {rnf.category || rnf.nombre}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200 align-top">
                            Descripción
                          </td>
                          <td className="p-2.5 text-slate-700 leading-relaxed whitespace-pre-line">
                            {rnf.description}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Criterio / Métrica Cuantitativa
                          </td>
                          <td className="p-2.5 text-blue-700 font-medium font-mono">
                            {rnf.metric || rnf.metrica_medible}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Dependencias
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {rnf.dependencies || "Ninguna"}
                          </td>
                        </tr>
                        <tr>
                          <td className="bg-slate-50/90 font-semibold p-2.5 text-slate-800 border-r border-slate-200">
                            Prioridad
                          </td>
                          <td className="p-2.5 text-slate-700 font-medium">
                            {rnf.priority || "Alta"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Modelado y Diagramas de Software */}
        <section className="space-y-8 pt-4 border-t border-slate-200">
          <h2 className="text-base font-bold text-slate-900">8. Modelado y Diagramas de Software</h2>

          {/* 8.1 Casos de Uso */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800">
              8.1 Diagrama de Casos de Uso
            </h3>
            <p className="text-xs text-slate-600">
              {project.diagrams?.useCase?.description || "Modela las interacciones directas entre actores y los procesos operativos nodales del sistema."}
            </p>
            <StaticDiagram
              code={project.diagrams?.useCase?.code}
              plantumlCode={project.diagrams?.useCase?.plantumlCode}
              caption="Figura 8.1: Diagrama de Casos de Uso del Sistema"
            />
            {renderDiagramExplanation(project.diagrams?.useCase)}
          </div>

          {/* 8.2 Clases de Dominio */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-800">
              8.2 Diagrama de Clases de Dominio
            </h3>
            <p className="text-xs text-slate-600">
              {project.diagrams?.classDiagram?.description || "Define la estructura de datos, atributos tipados, cardinalidad y relaciones del modelo operacional."}
            </p>
            <StaticDiagram
              code={project.diagrams?.classDiagram?.code}
              plantumlCode={project.diagrams?.classDiagram?.plantumlCode}
              caption="Figura 8.2: Diagrama de Clases de Dominio y Entidades"
            />
            {renderDiagramExplanation(project.diagrams?.classDiagram)}
          </div>

          {/* 8.3 Árbol de Navegación */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-800">
              8.3 Árbol de Navegación
            </h3>
            <p className="text-xs text-slate-600">
              {project.diagrams?.navigationTree?.description || "Organiza la navegación jerárquica de la solución estructurada en fases de operación y módulos de control."}
            </p>
            <StaticDiagram
              code={project.diagrams?.navigationTree?.code}
              plantumlCode={project.diagrams?.navigationTree?.plantumlCode}
              caption="Figura 8.3: Árbol de Navegación del Sistema"
            />
            {renderDiagramExplanation(project.diagrams?.navigationTree)}
          </div>

          {/* 8.4 Arquitectura del Sistema */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-800">
              8.4 Diagrama de Arquitectura
            </h3>
            <p className="text-xs text-slate-600">
              {project.diagrams?.architecture?.description || "Modelo de arquitectura técnica integral en contenedores adaptado a las necesidades operativas del sistema."}
            </p>
            <StaticDiagram
              code={project.diagrams?.architecture?.code}
              plantumlCode={project.diagrams?.architecture?.plantumlCode}
              caption="Figura 8.4: Diagrama de Arquitectura del Sistema"
            />
            {renderDiagramExplanation(project.diagrams?.architecture)}
          </div>
        </section>
      </div>

      {/* Modal de Previsualización PDF Nativo */}
      {showPdfModal && (
        <PdfPreviewModal
          project={project}
          onClose={() => setShowPdfModal(false)}
        />
      )}
    </div>
  );
}
