import React, { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { X, Maximize2, Minimize2, Loader2, Download } from "lucide-react";
import { getPlantUMLPngUrl } from "../utils/plantumlEncoder";

async function fetchPngDataUrl(plantumlCode) {
  if (!plantumlCode || !plantumlCode.trim() || plantumlCode.includes("No hay diagrama disponible")) return null;
  const url = getPlantUMLPngUrl(plantumlCode);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Error cargando imagen PlantUML para PDF:", e);
    return null;
  }
}

function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 800, height: 500 });
    img.src = dataUrl;
  });
}

export default function PdfPreviewModal({ project, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let blobUrl = null;

    async function generatePdfBlob() {
      try {
        setLoading(true);

        // 1. Cargar las imágenes de los 4 diagramas en paralelo
        const [useCaseImg, classImg, navImg, archImg] = await Promise.all([
          fetchPngDataUrl(project.diagrams?.useCase?.plantumlCode || project.diagrams?.useCase?.code),
          fetchPngDataUrl(project.diagrams?.classDiagram?.plantumlCode || project.diagrams?.classDiagram?.code),
          fetchPngDataUrl(project.diagrams?.navigationTree?.plantumlCode || project.diagrams?.navigationTree?.code),
          fetchPngDataUrl(project.diagrams?.architecture?.plantumlCode || project.diagrams?.architecture?.code)
        ]);

        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4"
        });

        const margin = 18;
        let y = margin;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxLineWidth = pageWidth - margin * 2;

        const checkPageBreak = (neededHeight) => {
          if (y + neededHeight > pageHeight - margin - 12) {
            doc.addPage();
            y = margin;
            // Encabezado formal de página
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(120, 120, 120);
            doc.text(
              `${project.name || "Sistema de Información"} • Documento de Especificación y Diseño`,
              margin,
              y - 4
            );
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.2);
            doc.line(margin, y - 2, pageWidth - margin, y - 2);
          }
        };

        // Paleta formal neutra (sin azules informales, estilo entregable de consultoría)
        const COLOR_TITLE = [17, 24, 39];      // #111827 Charcoal profundo
        const COLOR_HEADING = [31, 41, 55];    // #1f2937 Gris muy oscuro
        const COLOR_TEXT = [55, 65, 81];        // #374151 Texto principal
        const COLOR_MUTED = [107, 114, 128];    // #6b7280 Metadatos
        const COLOR_LINE = [209, 213, 219];     // #d1d5db Líneas divisorias
        const COLOR_TABLE_HEADER = [31, 41, 55];

        // Función para tablas formales de especificación (IEEE 830)
        const drawSpecificationTable = (tableTitle, rows) => {
          const col1W = 46;
          const col2W = maxLineWidth - col1W;
          const rowPadding = 2;
          const lineHeight = 3.6;

          let estimatedTableH = 7;
          const preparedRows = rows.map(([label, val]) => {
            const valStr = String(val || "N/A");
            const wrapped = doc.splitTextToSize(valStr, col2W - 4);
            const rowH = Math.max(6.5, wrapped.length * lineHeight + rowPadding * 2);
            estimatedTableH += rowH;
            return { label, wrapped, rowH };
          });

          checkPageBreak(Math.min(estimatedTableH, 45));

          // Encabezado de la tabla
          doc.setFillColor(...COLOR_TABLE_HEADER);
          doc.rect(margin, y, maxLineWidth, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.text(tableTitle, margin + 3, y + 4.2);
          y += 6;

          doc.setDrawColor(...COLOR_LINE);
          doc.setLineWidth(0.2);

          preparedRows.forEach(({ label, wrapped, rowH }) => {
            checkPageBreak(rowH + 2);

            // Celda etiqueta (gris claro neutro)
            doc.setFillColor(249, 250, 251);
            doc.rect(margin, y, col1W, rowH, "FD");

            // Celda valor (blanco)
            doc.setFillColor(255, 255, 255);
            doc.rect(margin + col1W, y, col2W, rowH, "FD");

            // Texto etiqueta
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(...COLOR_HEADING);
            doc.text(label, margin + 2.5, y + 4.2);

            // Texto valor
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(wrapped, margin + col1W + 2.5, y + 4);

            y += rowH;
          });

          y += 4;
        };

        // Redimensionamiento inteligente de diagramas sin deformación y con explicación operativa
        const drawDiagramWithJerarquia = async (imgData, title, caption, descripcionTexto, jerarquia) => {
          if (!imgData) return;
          const size = await getImageSize(imgData);

          // Escalar proporcionalmente garantizando que quepa en el ancho útil y altura moderada
          const maxW = maxLineWidth;
          const maxAllowedH = 82; // Altura máxima para permitir que la explicación entre en la misma página
          let w = size.width;
          let h = size.height;
          const ratio = w / h;

          if (w > maxW) {
            w = maxW;
            h = w / ratio;
          }
          if (h > maxAllowedH) {
            h = maxAllowedH;
            w = h * ratio;
          }

          // Salto de página antes si el bloque gráfico no cabe
          checkPageBreak(h + 20);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...COLOR_HEADING);
          doc.text(title, margin, y);
          y += 4.5;

          const x = margin + (maxLineWidth - w) / 2;
          try {
            doc.addImage(imgData, "PNG", x, y, w, h);
            y += h + 3.5;

            // Epígrafe formal
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7.5);
            doc.setTextColor(...COLOR_MUTED);
            doc.text(caption, pageWidth / 2, y, { align: "center" });
            y += 5.5;

            // Explicación operativa generada por la IA
            const listItems = Array.isArray(jerarquia) && jerarquia.length > 0 ? jerarquia : null;
            const tieneNarrativa = descripcionTexto && typeof descripcionTexto === "string" && descripcionTexto.trim().length > 15;

            if (listItems || tieneNarrativa) {
              checkPageBreak(20);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(8);
              doc.setTextColor(...COLOR_HEADING);
              doc.text("Explicación del Funcionamiento del Sistema:", margin, y);
              y += 4;

              if (tieneNarrativa) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.5);
                doc.setTextColor(...COLOR_TEXT);
                const descLines = doc.splitTextToSize(descripcionTexto, maxLineWidth);
                checkPageBreak(descLines.length * 3.4 + 2);
                doc.text(descLines, margin, y);
                y += descLines.length * 3.4 + 2.5;
              }

              if (listItems) {
                listItems.forEach((item) => {
                  if (typeof item === "string" && item.includes(":")) {
                    const [prefix, ...rest] = item.split(":");
                    const fullText = `• ${prefix.trim()}: ${rest.join(":")}`;
                    const splitLines = doc.splitTextToSize(fullText, maxLineWidth);
                    checkPageBreak(splitLines.length * 3.4 + 1.5);
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7.5);
                    doc.setTextColor(...COLOR_TEXT);
                    doc.text(splitLines, margin, y);
                    y += splitLines.length * 3.4;
                  } else if (typeof item === "string") {
                    const splitLines = doc.splitTextToSize(`• ${item}`, maxLineWidth);
                    checkPageBreak(splitLines.length * 3.4 + 1.5);
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7.5);
                    doc.setTextColor(...COLOR_TEXT);
                    doc.text(splitLines, margin, y);
                    y += splitLines.length * 3.4;
                  }
                });
                y += 3;
              }
            }
          } catch (e) {
            console.warn("Error incrustando imagen en PDF:", e);
          }
        };

        // --- ENCABEZADO FORMAL DEL DOCUMENTO ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_MUTED);
        doc.text("DOCUMENTACIÓN TÉCNICA FORMAL • ESPECIFICACIÓN Y DISEÑO DE SOFTWARE (IEEE 830)", margin, y);
        y += 6;

        // --- 1. TÍTULO DEL PROYECTO ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...COLOR_TITLE);
        const titleLines = doc.splitTextToSize(
          `1. ${project.name || "Sistema de Información y Control Operativo"}`,
          maxLineWidth
        );
        doc.text(titleLines, margin, y);
        y += titleLines.length * 6 + 1.5;

        // Metadatos y certificación
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(
          `Fecha de Emisión: ${new Date().toLocaleDateString("es-ES")}   |   Estado: REVISADO Y VALIDADO TÉCNICAMENTE`,
          margin,
          y
        );
        y += 4.5;

        // Línea divisoria formal
        doc.setDrawColor(...COLOR_LINE);
        doc.setLineWidth(0.25);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;

        // --- 2. OBJETIVOS ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("2. Objetivos del Proyecto", margin, y);
        y += 4.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("2.1 Objetivo General:", margin, y);
        y += 3.5;

        doc.setFont("helvetica", "normal");
        const objGenText = project.objetivos?.general ||
          `Desarrollar y formalizar la arquitectura y especificación del sistema ${project.name || "institucional"}, asegurando integridad transaccional, alta disponibilidad y cumplimiento estricto de las necesidades del negocio.`;
        const objGen = doc.splitTextToSize(objGenText, maxLineWidth);
        doc.text(objGen, margin, y);
        y += objGen.length * 3.6 + 3;

        doc.setFont("helvetica", "bold");
        doc.text("2.2 Objetivos Específicos:", margin, y);
        y += 3.5;
        doc.setFont("helvetica", "normal");
        const objEsp = Array.isArray(project.objetivos?.especificos) && project.objetivos.especificos.length > 0
          ? project.objetivos.especificos
          : [
              `Levantar y especificar los requerimientos funcionales y no funcionales cuantificables para ${project.name || "el sistema"}.`,
              "Diseñar la arquitectura lógica en capas delimitando responsabilidades de frontera, negocio y persistencia.",
              "Modelar los casos de uso nucleares, entidades del modelo de datos y el flujo de navegación modular."
            ];
        objEsp.forEach((item) => {
          const splitItem = doc.splitTextToSize(`• ${item}`, maxLineWidth);
          doc.text(splitItem, margin, y);
          y += splitItem.length * 3.5;
        });
        y += 4;

        // --- 3. RESUMEN EJECUTIVO ---
        checkPageBreak(25);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("3. Resumen Ejecutivo", margin, y);
        y += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_TEXT);
        const resumenText = doc.splitTextToSize(
          project.resumen_ejecutivo || project.resumenEjecutivo || project.description ||
            `El proyecto ${project.name} contempla la implementación de una solución informática para la automatización, gestión y control operativo de sus procesos fundamentales. La presente especificación establece las bases analíticas y arquitectónicas para su desarrollo e integración técnica.`,
          maxLineWidth
        );
        doc.text(resumenText, margin, y);
        y += resumenText.length * 3.6 + 4;

        // --- 4. PALABRAS CLAVE DEL NEGOCIO / DOMINIO ---
        checkPageBreak(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("4. Palabras Clave del Negocio / Dominio", margin, y);
        y += 4.5;

        const cleanFunctional = (project.requirements?.functional || []).filter(
          (rf) => !rf.name?.includes("Ajuste Validado por Experto")
        );

        // Palabras clave del negocio (nunca de herramientas CASE)
        let domainKeywords = Array.isArray(project.palabras_clave) && project.palabras_clave.length > 0
          ? project.palabras_clave
          : cleanFunctional.slice(0, 6).map((rf) => rf.name.replace(/^(Gestión de|Control de|Registro de|Módulo de)\s*/i, ""));

        domainKeywords = domainKeywords.filter((k) => !/case|plantuml|mermaid|uml|clean architecture|upper/i.test(k));
        if (domainKeywords.length === 0) {
          domainKeywords = ["Control Operacional", "Gestión de Procesos", "Trazabilidad de Datos", "Seguridad Transaccional"];
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_TEXT);
        const kwText = doc.splitTextToSize(domainKeywords.join("  •  "), maxLineWidth);
        doc.text(kwText, margin, y);
        y += kwText.length * 3.6 + 4;

        // --- 5. INTRODUCCIÓN ---
        checkPageBreak(25);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("5. Introducción", margin, y);
        y += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_TEXT);
        const introText = doc.splitTextToSize(
          project.introduccion ||
            "En el desarrollo formal de software de misión crítica, una adecuada especificación formal previene desviaciones presupuestarias, fallos de integración y cuellos de botella. El presente documento técnico estructura los requerimientos a partir de los insumos provistos por los expertos del dominio, asegurando consistencia, trazabilidad y conformidad.",
          maxLineWidth
        );
        doc.text(introText, margin, y);
        y += introText.length * 3.6 + 4;

        // --- 6. FUENTES E INSUMOS ANALIZADOS ---
        checkPageBreak(25);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("6. Fuentes e Insumos Analizados", margin, y);
        y += 4.5;

        const sources = project.sources || [];
        if (sources.length > 0) {
          sources.forEach((s) => {
            checkPageBreak(6);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(`• ${s.name} (${s.type || "Documento"})`, margin + 2, y);
            y += 4;
          });
        } else {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...COLOR_MUTED);
          doc.text("Insumos de requerimientos provistos directamente durante la sesión de análisis técnico.", margin, y);
          y += 4;
        }
        y += 4;

        // --- 7. ANÁLISIS DE REQUERIMIENTOS ---
        checkPageBreak(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...COLOR_TITLE);
        doc.text("7. Especificación de Requerimientos del Sistema (IEEE 830)", margin, y);
        y += 5.5;

        // 7.1 Requerimientos Funcionales
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("7.1 Requerimientos Funcionales (RF)", margin, y);
        y += 4.5;

        if (cleanFunctional.length > 0) {
          cleanFunctional.forEach((rf, i) => {
            const rfId = rf.identificador || rf.id || `RF-0${i + 1}`;
            const tableTitle = `Requerimiento Funcional: [${rfId}] ${rf.name}`;

            const rows = [
              ["ID del requerimiento", rfId],
              ["Nombre del requerimiento", rf.name],
              ["Descripción", rf.description || "Sin descripción"],
              ["Dependencias", rf.dependencies || "Ninguna"],
              ["Prioridad", rf.priority || "Alta"],
              ["Actores", Array.isArray(rf.actors) ? rf.actors.join(", ") : rf.actors || "Operador Principal"],
              ["Precondiciones", rf.precondition || "Usuario autenticado en el sistema"],
              ["Postcondiciones", rf.postcondition || "Registro confirmado y almacenado en la base de datos"]
            ];

            drawSpecificationTable(tableTitle, rows);
          });
        }

        // 7.2 Requisitos No Funcionales
        checkPageBreak(25);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("7.2 Requerimientos No Funcionales (RNF)", margin, y);
        y += 4.5;

        const cleanNonFunctional = (project.requirements?.nonFunctional || []).filter(
          (rnf) =>
            !rnf.category?.includes("Ajuste Validado por Experto") &&
            !rnf.description?.includes("Requisito incorporado por corrección")
        );

        if (cleanNonFunctional.length > 0) {
          cleanNonFunctional.forEach((rnf, i) => {
            const rnfId = rnf.identificador || rnf.id || `RNF-0${i + 1}`;
            const rnfName = rnf.category || rnf.nombre || "Criterio de Calidad";
            const tableTitle = `Requerimiento No Funcional: [${rnfId}] ${rnfName}`;

            const rows = [
              ["ID del requerimiento", rnfId],
              ["Nombre del requerimiento", rnfName],
              ["Categoría", rnf.category || "Atributo de Calidad"],
              ["Descripción", rnf.description || "N/A"],
              ["Criterio / Métrica", rnf.metric || rnf.metrica_medible || "Cumplimiento normativo"],
              ["Prioridad", rnf.priority || "Alta"]
            ];

            drawSpecificationTable(tableTitle, rows);
          });
        }

        // --- 8. MODELADO Y DIAGRAMAS DE SOFTWARE ---
        checkPageBreak(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...COLOR_TITLE);
        doc.text("8. Modelado y Diagramas de Software", margin, y);
        y += 5.5;

        // 8.1 Casos de Uso
        if (useCaseImg) {
          await drawDiagramWithJerarquia(
            useCaseImg,
            "8.1 Diagrama de Casos de Uso",
            "Figura 8.1: Diagrama de Casos de Uso del Sistema (Procesos Fundamentales)",
            project.diagrams?.useCase?.description,
            project.diagrams?.useCase?.descripcion_jerarquica
          );
        }

        // 8.2 Clases de Dominio
        if (classImg) {
          await drawDiagramWithJerarquia(
            classImg,
            "8.2 Diagrama de Clases de Dominio",
            "Figura 8.2: Diagrama de Clases del Dominio y Entidades Relacionales",
            project.diagrams?.classDiagram?.description,
            project.diagrams?.classDiagram?.descripcion_jerarquica
          );
        }

        // 8.3 Árbol de Navegación del Sistema
        if (navImg) {
          await drawDiagramWithJerarquia(
            navImg,
            "8.3 Árbol de Navegación",
            "Figura 8.3: Jerarquía Estructurada de Pantallas y Módulos de Navegación",
            project.diagrams?.navigationTree?.description,
            project.diagrams?.navigationTree?.descripcion_jerarquica
          );
        }

        // 8.4 Arquitectura del Sistema
        if (archImg) {
          await drawDiagramWithJerarquia(
            archImg,
            "8.4 Diagrama de Arquitectura",
            "Figura 8.4: Arquitectura Técnica en Capas (C4 Container)",
            project.diagrams?.architecture?.description,
            project.diagrams?.architecture?.descripcion_jerarquica
          );
        }

        // --- 9. CERTIFICACIÓN Y APROBACIÓN TÉCNICA ---
        checkPageBreak(35);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("9. Certificación y Aprobación Técnica", margin, y);
        y += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR_TEXT);
        const certText = doc.splitTextToSize(
          "El presente documento técnico de especificación de requisitos y diseño preliminar ha sido generado y validado conforme a los estándares de ingeniería de software para especificaciones formales y modelado de procesos.",
          maxLineWidth
        );
        doc.text(certText, margin, y);
        y += certText.length * 3.5 + 12;

        // Firmas formales
        const signW = 60;
        const sign1X = margin + 15;
        const sign2X = pageWidth - margin - signW - 15;

        doc.setDrawColor(...COLOR_LINE);
        doc.line(sign1X, y, sign1X + signW, y);
        doc.line(sign2X, y, sign2X + signW, y);
        y += 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("Analista de Requisitos", sign1X + signW / 2, y, { align: "center" });
        doc.text("Arquitecto / Diseñador de Software", sign2X + signW / 2, y, { align: "center" });
        y += 3.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_MUTED);
        doc.text("Equipo de Ingeniería de Software", sign1X + signW / 2, y, { align: "center" });
        doc.text("Validación Técnica Certificada", sign2X + signW / 2, y, { align: "center" });

        // --- NUMERACIÓN DE PÁGINAS FORMAL AL PIE ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Página ${p} de ${totalPages}  •  Documento Técnico de Especificación y Diseño de Software (IEEE 830)`,
            pageWidth / 2,
            pageHeight - 7,
            { align: "center" }
          );
        }

        // Finalizar y crear URL del Blob
        const pdfOutput = doc.output("blob");
        blobUrl = URL.createObjectURL(pdfOutput);
        setPdfUrl(blobUrl);
      } catch (err) {
        console.error("Error generando PDF completo:", err);
      } finally {
        setLoading(false);
      }
    }

    generatePdfBlob();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [project]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Especificacion_${(project.name || "Sistema").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div
        className={`bg-[#2c2d30] border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col transition-all duration-200 ${
          isFullscreen ? "w-full h-full rounded-none" : "w-full max-w-5xl h-[90vh]"
        }`}
      >
        {/* Top Window Header */}
        <div className="h-10 bg-[#1f1f23] border-b border-slate-700 px-4 flex items-center justify-between text-xs text-slate-300 select-none">
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-400 font-mono font-bold">[PDF]</span>
            <span className="font-medium text-slate-100 truncate">
              {project.name ? `Especificacion_${project.name.replace(/\s+/g, "_")}.pdf` : "Especificacion_Sistema.pdf"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            {pdfUrl && (
              <button
                onClick={handleDownload}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Descargar documento PDF"
              >
                <Download size={13} />
                <span>Descargar PDF</span>
              </button>
            )}

            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors cursor-pointer"
              title={isFullscreen ? "Restaurar" : "Maximizar"}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-red-600 hover:text-white rounded transition-colors cursor-pointer"
              title="Cerrar visor PDF"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* PDF Preview Frame */}
        <div className="flex-1 bg-[#525659] relative flex items-center justify-center overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-slate-300 text-xs">
              <Loader2 size={28} className="animate-spin text-slate-300" />
              <span>Generando documento PDF formal...</span>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=1`}
              title="Previsualización PDF"
              className="w-full h-full border-none"
            />
          ) : (
            <div className="text-white text-xs">Error al cargar la previsualización del PDF.</div>
          )}
        </div>
      </div>
    </div>
  );
}
