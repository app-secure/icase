import React, { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { X, Maximize2, Minimize2, Loader2, Download } from "lucide-react";
import { getPlantUMLPngUrl } from "../utils/plantumlEncoder";
import { prepareMockupHtml } from "../utils/mockupHtml";

// Los diagramas conservan PNG para mantener líneas y texto nítidos. Los
// mockups son capturas fotográficas de pantalla y se comprimen mucho mejor en
// JPEG sin una pérdida visual apreciable dentro de una página A4.
const MOCKUP_CAPTURE_SCALE = 1;
const MOCKUP_JPEG_QUALITY = 0.82;

const copyComputedStyles = (source, target, view) => {
  const computed = view?.getComputedStyle(source);
  if (!computed) return;
  for (const property of computed) {
    target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  }
};

const normalizeFormControlsForCapture = (clonedDocument) => {
  const view = clonedDocument.defaultView;
  const textInputTypes = new Set([
    "text", "search", "email", "tel", "url", "number", "password",
    "date", "time", "datetime-local", "month", "week"
  ]);

  clonedDocument.querySelectorAll("input, textarea").forEach((control) => {
    const isTextarea = control.tagName === "TEXTAREA";
    const type = String(control.getAttribute("type") || "text").toLowerCase();
    if (!isTextarea && !textInputTypes.has(type)) return;

    const replacement = clonedDocument.createElement("div");
    copyComputedStyles(control, replacement, view);
    const rawValue = control.value || control.getAttribute("value") || control.getAttribute("placeholder") || "";
    replacement.textContent = type === "password" && rawValue ? "•".repeat(rawValue.length) : rawValue;
    replacement.style.display = "flex";
    replacement.style.alignItems = isTextarea ? "flex-start" : "center";
    replacement.style.whiteSpace = isTextarea ? "pre-wrap" : "nowrap";
    replacement.style.overflow = "hidden";
    replacement.style.lineHeight = "normal";
    if (!control.value && control.getAttribute("placeholder")) {
      replacement.style.color = "#94a3b8";
    }
    control.replaceWith(replacement);
  });
};

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

// Helpers de formato y capitalización para títulos y etiquetas (IEEE / APA)
const formatScreenName = (str) => {
  if (!str) return "";
  return str
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const capitalizeFirst = (text) => {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default function PdfPreviewModal({ project, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let blobUrl = null;

    async function generatePdfBlob() {
      try {
        setLoading(true);

        // 1. Cargar las imágenes de los diagramas en paralelo
        const softDiag = project.diagrams?.softwareArchitecture || project.diagrams?.architecture;
        const sysDiag = project.diagrams?.systemArchitecture;

        const [useCaseImg, classImg, designClassImg, navImg, softImg, sysImg] = await Promise.all([
          fetchPngDataUrl(project.diagrams?.useCase?.plantumlCode || project.diagrams?.useCase?.code),
          fetchPngDataUrl(project.diagrams?.classDiagram?.plantumlCode || project.diagrams?.classDiagram?.code),
          fetchPngDataUrl(project.diagrams?.designClasses?.plantumlCode || project.diagrams?.designClasses?.code),
          fetchPngDataUrl(project.diagrams?.navigationTree?.plantumlCode || project.diagrams?.navigationTree?.code),
          fetchPngDataUrl(softDiag?.plantumlCode || softDiag?.code),
          fetchPngDataUrl(sysDiag?.plantumlCode || sysDiag?.code)
        ]);

        const doc = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
          compress: true,
          putOnlyUsedFonts: true
        });        const margin = 18;
        let y = margin;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxLineWidth = pageWidth - margin * 2;

        const checkPageBreak = (neededHeight) => {
          if (y + neededHeight > pageHeight - margin - 12) {
            doc.addPage();
            // Encabezado formal IEEE de página
            const headerTextY = 11;
            const headerLineY = 13.5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text(
              `ISO/IEC/IEEE 29148:2018 • ${project.name || "Sistema de Información"} • Especificación Técnica`,
              margin,
              headerTextY
            );
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.25);
            doc.line(margin, headerLineY, pageWidth - margin, headerLineY);

            // Espaciado adecuado para que el encabezado no quede pegado al contenido
            y = 22;
          }
        };

        // Paleta formal neutra de ingeniería (estilo IEEE Transactions / Entregable de Consultoría)
        const COLOR_TITLE = [15, 23, 42];        // #0f172a Slate 900
        const COLOR_HEADING = [30, 41, 59];      // #1e293b Slate 800
        const COLOR_TEXT = [51, 65, 85];         // #334155 Slate 700 (Legible y nítido)
        const COLOR_MUTED = [100, 116, 139];     // #64748b Slate 500
        const COLOR_LINE = [203, 213, 225];      // #cbd5e1 Slate 300
        const COLOR_TABLE_HEADER = [30, 41, 59];  // #1e293b
        const COLOR_PRIMARY = [11, 87, 208];     // #0b57d0 Azul formal IEEE

        // --- HELPERS DE TIPOGRAFÍA Y FORMATO PROFESIONAL ---

        // Título de Sección Principal (Nivel 1)
        const drawSectionHeader = (titleText) => {
          checkPageBreak(25);
          if (y > margin + 5) {
            y += 4; // Espacio previo de separación entre secciones
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13.5);
          doc.setTextColor(...COLOR_TITLE);
          doc.text(titleText, margin, y);
          y += 3;
          doc.setDrawColor(...COLOR_LINE);
          doc.setLineWidth(0.3);
          doc.line(margin, y, pageWidth - margin, y);
          y += 5.5;
        };

        // Título de Subsección (Nivel 2)
        const drawSubSectionHeader = (subTitleText) => {
          checkPageBreak(18);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...COLOR_HEADING);
          doc.text(subTitleText, margin, y);
          y += 4.5;
        };

        // Párrafo estándar con interlineado confortable a escala 100%
        const drawParagraph = (text) => {
          if (!text) return;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(...COLOR_TEXT);
          const lines = doc.splitTextToSize(text, maxLineWidth);
          checkPageBreak(lines.length * 4.8 + 3);
          doc.text(lines, margin, y);
          y += lines.length * 4.8 + 3.5;
        };

        // Viñeta ideal con Sangría Francesa (Hanging Indent)
        // El punto queda a la izquierda y el texto nunca se mete debajo del punto
        const drawBulletItem = (text, indent = 4) => {
          if (!text) return;
          const bulletX = margin + indent;
          const textX = bulletX + 5;
          const textW = maxLineWidth - indent - 5;
          const lineHeight = 4.8;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.8);
          const lines = doc.splitTextToSize(text, textW);
          checkPageBreak(lines.length * lineHeight + 2);

          // Punto de viñeta
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...COLOR_PRIMARY);
          doc.text("•", bulletX, y);

          // Texto sangrado línea por línea
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.8);
          doc.setTextColor(...COLOR_TEXT);
          for (let i = 0; i < lines.length; i++) {
            doc.text(lines[i], textX, y + i * lineHeight);
          }

          y += lines.length * lineHeight + 2.5;
        };

        // Viñeta estructurada con prefijo en negrita (ej: "• Componentes: ...")
        const drawStructuredBullet = (prefix, text, indent = 4) => {
          if (!prefix && !text) return;
          const bulletX = margin + indent;
          const textX = bulletX + 5;
          const textW = maxLineWidth - indent - 5;
          const lineHeight = 4.8;

          if (!text) {
            drawBulletItem(prefix, indent);
            return;
          }

          const prefixStr = `${prefix}: `;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.8);
          const prefixW = doc.getTextWidth(prefixStr);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.8);

          // Si el prefijo cabe en la primera línea con espacio razonable para texto:
          if (prefixW < textW - 35) {
            const words = text.split(/\s+/).filter(Boolean);
            let firstLineWords = [];
            let remainingWords = [];
            let currentFirstLineStr = "";

            for (let i = 0; i < words.length; i++) {
              const candidate = currentFirstLineStr ? `${currentFirstLineStr} ${words[i]}` : words[i];
              if (prefixW + doc.getTextWidth(candidate) <= textW - 2) {
                currentFirstLineStr = candidate;
                firstLineWords.push(words[i]);
              } else {
                remainingWords = words.slice(i);
                break;
              }
            }

            const restText = remainingWords.join(" ");
            const remainingLines = restText ? doc.splitTextToSize(restText, textW) : [];
            const totalLinesCount = 1 + remainingLines.length;

            checkPageBreak(totalLinesCount * lineHeight + 2);

            // Viñeta
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...COLOR_PRIMARY);
            doc.text("•", bulletX, y);

            // Prefijo en negrita
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.8);
            doc.setTextColor(...COLOR_HEADING);
            doc.text(prefixStr, textX, y);

            // Texto continuado de primera línea
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.8);
            doc.setTextColor(...COLOR_TEXT);
            if (currentFirstLineStr) {
              doc.text(currentFirstLineStr, textX + prefixW, y);
            }

            // Siguientes líneas
            for (let i = 0; i < remainingLines.length; i++) {
              doc.text(remainingLines[i], textX, y + (i + 1) * lineHeight);
            }

            y += totalLinesCount * lineHeight + 2.5;
          } else {
            // Si el prefijo es largo, imprimirlo y luego el texto
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.8);
            const prefixLines = doc.splitTextToSize(prefixStr, textW);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.8);
            const textLines = doc.splitTextToSize(text, textW);

            const totalLinesCount = prefixLines.length + textLines.length;
            checkPageBreak(totalLinesCount * lineHeight + 2);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...COLOR_PRIMARY);
            doc.text("•", bulletX, y);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.8);
            doc.setTextColor(...COLOR_HEADING);
            for (let i = 0; i < prefixLines.length; i++) {
              doc.text(prefixLines[i], textX, y + i * lineHeight);
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.8);
            doc.setTextColor(...COLOR_TEXT);
            const startYText = y + prefixLines.length * lineHeight;
            for (let i = 0; i < textLines.length; i++) {
              doc.text(textLines[i], textX, startYText + i * lineHeight);
            }

            y += totalLinesCount * lineHeight + 2.5;
          }
        };

        // Función para tablas formales de especificación (IEEE / APA)
        const drawSpecificationTable = (tableTitle, rows) => {
          const col1W = 50;
          const col2W = maxLineWidth - col1W;
          const rowPadding = 2.8;
          const lineHeight = 4.4;

          let estimatedTableH = 8;
          const preparedRows = rows.map(([label, val]) => {
            const valStr = String(val || "N/A");
            const wrapped = doc.splitTextToSize(valStr, col2W - 6);
            const rowH = Math.max(7.5, wrapped.length * lineHeight + rowPadding * 2);
            estimatedTableH += rowH;
            return { label, wrapped, rowH };
          });

          checkPageBreak(Math.min(estimatedTableH, 50));

          // Encabezado de la tabla estilo IEEE
          doc.setFillColor(...COLOR_TABLE_HEADER);
          doc.rect(margin, y, maxLineWidth, 7.5, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(255, 255, 255);
          doc.text(tableTitle.toUpperCase(), margin + 4, y + 5.2);
          y += 7.5;

          doc.setDrawColor(...COLOR_LINE);
          doc.setLineWidth(0.25);

          preparedRows.forEach(({ label, wrapped, rowH }, idx) => {
            checkPageBreak(rowH + 2);

            // Celda etiqueta (gris neutro alternado)
            doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
            doc.rect(margin, y, col1W, rowH, "FD");

            // Celda valor (blanco)
            doc.setFillColor(255, 255, 255);
            doc.rect(margin + col1W, y, col2W, rowH, "FD");

            // Texto etiqueta
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(...COLOR_HEADING);
            doc.text(label, margin + 3.5, y + 5);

            // Texto valor (9.5pt legible al 100%)
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9.5);
            doc.setTextColor(...COLOR_TEXT);
            doc.text(wrapped, margin + col1W + 3.5, y + 4.8);

            y += rowH;
          });

          y += 5.5;
        };

        // Redimensionamiento inteligente de diagramas sin deformación y con explicación operativa
        const drawDiagramWithJerarquia = async (imgData, title, caption, descripcionTexto, jerarquia) => {
          if (!imgData) return;
          const size = await getImageSize(imgData);

          // Escalar proporcionalmente cubriendo el ancho útil y con altura generosa y equilibrada
          const maxW = maxLineWidth;
          const maxAllowedH = 115;
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
          checkPageBreak(h + 30);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...COLOR_HEADING);
          doc.text(title, margin, y);
          y += 5;

          const tieneNarrativa = descripcionTexto && typeof descripcionTexto === "string" && descripcionTexto.trim().length > 10;
          if (tieneNarrativa) {
            drawParagraph(descripcionTexto);
          }

          const x = margin + (maxLineWidth - w) / 2;
          try {
            doc.addImage(imgData, "PNG", x, y, w, h, undefined, "FAST");
            y += h + 4;

            // Epígrafe formal IEEE / APA (9pt centrado)
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(...COLOR_HEADING);
            doc.text(caption, pageWidth / 2, y, { align: "center" });
            y += 6.5;

            // Explicación operativa generada por la IA
            const listItems = Array.isArray(jerarquia) && jerarquia.length > 0 ? jerarquia : null;

            if (listItems) {
              checkPageBreak(25);
              const cleanDiagramTitle = title.replace(/^\d+(\.\d+)*\s*/, "").trim();
              const explanationTitle = `Descripción Operativa del ${cleanDiagramTitle}:`;

              doc.setFont("helvetica", "bold");
              doc.setFontSize(10);
              doc.setTextColor(...COLOR_HEADING);
              doc.text(explanationTitle, margin, y);
              y += 5;

              listItems.forEach((item) => {
                if (typeof item === "string" && item.includes(":")) {
                  const [prefix, ...rest] = item.split(":");
                  drawStructuredBullet(prefix.trim(), rest.join(":").trim());
                } else if (typeof item === "string") {
                  drawBulletItem(item.trim());
                }
              });
              y += 3;
            }
          } catch (e) {
            console.warn("Error incrustando imagen en PDF:", e);
          }
        };

        // --- 1. PORTADA / CABECERA TÉCNICA ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16.5);
        doc.setTextColor(...COLOR_TITLE);
        const titleLines = doc.splitTextToSize(
          `1. Especificación de Requisitos de Software (SRS): ${project.name || "Sistema de Información"}`,
          maxLineWidth
        );
        doc.text(titleLines, margin, y);
        y += titleLines.length * 6.8 + 2.5;

        // Metadatos formales IEEE
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(
          `Fecha de Emisión: ${new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}   |   Normativa: ISO/IEC/IEEE 29148:2018   |   Estado: Aprobado`,
          margin,
          y
        );
        y += 5.5;

        // Línea divisoria formal única y limpia
        doc.setDrawColor(...COLOR_LINE);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6.5;

        // --- 2. OBJETIVOS ---
        drawSectionHeader("2. Objetivos del Proyecto");

        drawSubSectionHeader("2.1 Objetivo General:");
        const objGenText = project.objetivos?.general ||
          `Definir y documentar la arquitectura y especificación técnica del sistema ${project.name || "institucional"} a partir de los requisitos y decisiones aprobadas.`;
        drawParagraph(objGenText);

        drawSubSectionHeader("2.2 Objetivos Específicos:");
        const objEsp = Array.isArray(project.objetivos?.especificos) && project.objetivos.especificos.length > 0
          ? project.objetivos.especificos
          : [
              `Levantar y formalizar los requerimientos funcionales y no funcionales cuantificables para ${project.name || "el sistema"}.`,
              "Diseñar la arquitectura lógica en capas delimitando responsabilidades de frontera, negocio y persistencia.",
              "Modelar los casos de uso nucleares, entidades del modelo de datos y el mapa de pantallas y rutas de navegación del sistema."
            ];
        objEsp.forEach((item) => {
          drawBulletItem(item);
        });
        y += 3;

        // --- 3. RESUMEN EJECUTIVO ---
        drawSectionHeader("3. Resumen Ejecutivo");
        const resumenText =
          project.resumen_ejecutivo || project.resumenEjecutivo || project.description ||
          `El proyecto ${project.name || "Sistema"} contempla la implementación de una solución informática para la automatización, gestión y control operativo de sus procesos fundamentales. La presente especificación establece las bases analíticas y arquitectónicas para su desarrollo e integración técnica.`;
        drawParagraph(resumenText);

        // --- 4. PALABRAS CLAVE DEL NEGOCIO / DOMINIO ---
        drawSectionHeader("4. Palabras Clave del Negocio / Dominio");

        const cleanFunctional = (project.requirements?.functional || []).filter(
          (rf) => !rf.name?.includes("Ajuste Validado por Experto")
        );

        let domainKeywords = Array.isArray(project.palabras_clave) && project.palabras_clave.length > 0
          ? project.palabras_clave
          : cleanFunctional.slice(0, 6).map((rf) => rf.name.replace(/^(Gestión de|Control de|Registro de|Módulo de)\s*/i, ""));

        domainKeywords = domainKeywords.filter((k) => !/case|plantuml|mermaid|uml|clean architecture|upper/i.test(k));
        if (domainKeywords.length === 0) {
          domainKeywords = ["Especificación", "Requisitos", "Diseño", "Trazabilidad"];
        }

        domainKeywords.forEach((kw) => {
          drawBulletItem(kw);
        });
        y += 3;

        // --- 5. INTRODUCCIÓN ---
        drawSectionHeader("5. Introducción");
        const introText =
          project.introduccion ||
          "Una especificación formal permite detectar inconsistencias antes de la implementación. El presente documento estructura los requisitos a partir de los insumos provistos y conserva su trazabilidad hacia los modelos de arquitectura, diseño e interfaz.";
        drawParagraph(introText);

        // --- 6. FUENTES E INSUMOS ANALIZADOS ---
        drawSectionHeader("6. Fuentes e Insumos Analizados");
        const sources = project.sources || [];
        if (sources.length > 0) {
          sources.forEach((s) => {
            drawBulletItem(`${s.name} (${s.type || "Documento"})`);
          });
        } else {
          drawParagraph("Insumos de requerimientos provistos directamente durante la sesión de análisis técnico.");
        }
        y += 3;

        // --- 7. ANÁLISIS DE REQUERIMIENTOS ---
        drawSectionHeader("7. Especificación de Requisitos del Sistema (ISO/IEC/IEEE 29148:2018)");

        // 7.1 Requerimientos Funcionales
        drawSubSectionHeader("7.1 Requerimientos Funcionales (RF)");

        if (cleanFunctional.length > 0) {
          cleanFunctional.forEach((rf, i) => {
            const rfId = rf.identificador || rf.id || `RF-0${i + 1}`;
            const tableTitle = `Requerimiento Funcional: [${rfId}] ${rf.name}`;

            const rows = [
              ["ID del requerimiento", rfId],
              ["Nombre del requerimiento", rf.name],
              ["Descripción", rf.description || "Sin descripción"],
              ["Dependencias", rf.dependencies || "Ninguna"],
              ["Prioridad", rf.priority || "No especificada"],
              ["Actores", Array.isArray(rf.actors) ? rf.actors.join(", ") : rf.actors || "No especificados"],
              ["Precondiciones", rf.precondition || "No especificadas en los insumos"],
              ["Postcondiciones", rf.postcondition || "No especificadas en los insumos"]
            ];

            drawSpecificationTable(tableTitle, rows);
          });
        }

        // 7.2 Requisitos No Funcionales
        drawSubSectionHeader("7.2 Requerimientos No Funcionales (RNF)");

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
              ["Criterio / Métrica", rnf.metric || rnf.metrica_medible || "Por confirmar con el usuario"],
              ["Prioridad", rnf.priority || "No especificada"]
            ];

            drawSpecificationTable(tableTitle, rows);
          });
        }

        // --- 8. MODELADO Y DIAGRAMAS DE SOFTWARE ---
        drawSectionHeader("8. Modelado y Diagramas de Software");

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

        // 8.3 Clases de Diseño
        if (designClassImg) {
          await drawDiagramWithJerarquia(
            designClassImg,
            "8.3 Diagrama de Clases de Diseño",
            "Figura 8.3: Diagrama de Clases de Diseño en Capas",
            project.diagrams?.designClasses?.description,
            project.diagrams?.designClasses?.descripcion_jerarquica
          );
        }

        // 8.4 Árbol de Navegación del Sistema
        if (navImg) {
          await drawDiagramWithJerarquia(
            navImg,
            "8.4 Árbol de Navegación",
            "Figura 8.4: Jerarquía Estructurada de Pantallas y Módulos de Navegación",
            project.diagrams?.navigationTree?.description,
            project.diagrams?.navigationTree?.descripcion_jerarquica
          );
        }

        // 8.5 Arquitectura de Software
        if (softImg) {
          await drawDiagramWithJerarquia(
            softImg,
            "8.5 Diagrama de Arquitectura de Software",
            "Figura 8.5: Arquitectura de Software en Capas (C4 Container)",
            softDiag?.description,
            softDiag?.descripcion_jerarquica
          );
        }

        // 8.6 Arquitectura de Sistema e Infraestructura
        if (sysImg) {
          await drawDiagramWithJerarquia(
            sysImg,
            "8.6 Diagrama de Arquitectura de Sistema",
            "Figura 8.6: Arquitectura de Despliegue e Infraestructura (C4 Deployment)",
            sysDiag?.description,
            sysDiag?.descripcion_jerarquica
          );
        }

        // --- 9. WIREFRAMES Y MOCKUPS DE INTERFAZ ---
        if (project.mockups && project.mockups.length > 0) {
          drawSectionHeader("9. Wireframes y Prototipos de Interfaz");

          for (let i = 0; i < project.mockups.length; i++) {
            const mockup = project.mockups[i];
            if (!mockup.preview_code) continue;

            checkPageBreak(45);
            const formattedScreen = formatScreenName(mockup.nombre_pantalla);
            drawSubSectionHeader(`9.${i + 1} ${formattedScreen} (${capitalizeFirst(mockup.tipo || "interfaz")})`);

            if (mockup.descripcion) {
              drawParagraph(capitalizeFirst(mockup.descripcion));
            }

            // Renderizar mockup HTML en iframe (para que Tailwind CDN y CSS ejecuten correctamente)
            let mockupImgData = null;
            try {
              const platform = String(mockup.plataforma || mockup.platform || "web").toLowerCase();
              const isMobile = /mobile|móvil|movil/.test(platform);
              const isTablet = /tablet/.test(platform);
              // Debe coincidir con ScaledMockupPreview. Cambiar el viewport al
              // exportar activa otros breakpoints y deforma botones y textos.
              const captureWidth = isMobile ? 390 : isTablet ? 820 : 1440;
              const captureHeight = isMobile ? 844 : isTablet ? 900 : 820;
              mockupImgData = await new Promise((resolve) => {
                const iframe = document.createElement("iframe");
                iframe.style.position = "fixed";
                iframe.style.left = "-9999px";
                iframe.style.top = "0";
                iframe.style.width = `${captureWidth}px`;
                iframe.style.height = `${captureHeight}px`;
                iframe.style.border = "none";
                iframe.style.visibility = "hidden";
                iframe.style.pointerEvents = "none";
                iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
                document.body.appendChild(iframe);

                const timeout = setTimeout(() => {
                  try { document.body.removeChild(iframe); } catch {}
                  resolve(null);
                }, 12000);

                const tryCapture = async (attempts) => {
                  if (attempts <= 0) {
                    clearTimeout(timeout);
                    try { document.body.removeChild(iframe); } catch {}
                    resolve(null);
                    return;
                  }

                  const iDoc = iframe.contentDocument;
                  if (!iDoc) {
                    setTimeout(() => tryCapture(attempts - 1), 300);
                    return;
                  }

                  // El probe solo queda oculto cuando Tailwind ya generó y aplicó
                  // sus reglas. La comprobación anterior podía aprobar cualquier
                  // elemento aunque el CDN siguiera procesando las clases.
                  const tailwindScript = iDoc.querySelector('script[src*="tailwindcss"]');
                  const tailwindProbe = iDoc.getElementById("icase-tailwind-ready-probe");
                  const tailwindReady = !tailwindScript || (
                    tailwindProbe && iframe.contentWindow.getComputedStyle(tailwindProbe).display === "none"
                  );

                  if (tailwindReady) {
                    try {
                      await iDoc.fonts?.ready;
                      await Promise.all([...iDoc.images].map((img) => img.complete
                        ? Promise.resolve()
                        : new Promise((done) => {
                            img.addEventListener("load", done, { once: true });
                            img.addEventListener("error", done, { once: true });
                          })));
                      // Esperar dos ciclos de pintura garantiza que las métricas
                      // de fuente y el layout final usados por Tailwind ya estén
                      // aplicados antes de que html2canvas lea las posiciones.
                      await new Promise((done) => iframe.contentWindow.requestAnimationFrame(
                        () => iframe.contentWindow.requestAnimationFrame(done)
                      ));
                    } catch {
                      // La captura sigue con las fuentes del sistema si un recurso opcional falla.
                    }
                    iDoc.documentElement.style.width = `${captureWidth}px`;
                    iDoc.documentElement.style.height = `${captureHeight}px`;
                    iDoc.documentElement.style.overflow = "hidden";
                    iDoc.body.style.width = `${captureWidth}px`;
                    iDoc.body.style.minHeight = `${captureHeight}px`;
                    iDoc.body.style.overflow = "hidden";
                    html2canvas(iDoc.body || iDoc.documentElement, {
                      scale: MOCKUP_CAPTURE_SCALE,
                      useCORS: true,
                      logging: false,
                      backgroundColor: "#ffffff",
                      width: captureWidth,
                      height: captureHeight,
                      windowWidth: captureWidth,
                      windowHeight: captureHeight,
                      scrollX: 0,
                      scrollY: 0,
                      allowTaint: false,
                      foreignObjectRendering: true,
                      onclone: normalizeFormControlsForCapture
                    }).then(canvas => {
                      clearTimeout(timeout);
                      try { document.body.removeChild(iframe); } catch {}
                      resolve(canvas.toDataURL("image/jpeg", MOCKUP_JPEG_QUALITY));
                    }).catch(() => {
                      clearTimeout(timeout);
                      try { document.body.removeChild(iframe); } catch {}
                      resolve(null);
                    });
                  } else {
                    setTimeout(() => tryCapture(attempts - 1), 400);
                  }
                };

                iframe.onload = () => {
                  // Esperar a que Tailwind procese las clases (necesita tiempo para ejecutar el script CDN)
                  setTimeout(() => tryCapture(15), 1500);
                };

                // Usar exactamente la misma transformación que la vista previa.
                // Una segunda hoja de estilos aquí alteraría paddings, alturas y
                // métricas tipográficas al convertir el mockup en imagen.
                let html = prepareMockupHtml(mockup.preview_code || "");
                const readinessProbe = '<div id="icase-tailwind-ready-probe" class="hidden" aria-hidden="true"></div>';
                html = html.includes("</body>")
                  ? html.replace(/<\/body>/i, `${readinessProbe}</body>`)
                  : `${html}${readinessProbe}`;

                const iDocObj = iframe.contentDocument || iframe.contentWindow.document;
                iDocObj.open();
                iDocObj.write(html);
                iDocObj.close();
              });
            } catch (e) {
              console.warn(`Error capturando mockup ${mockup.nombre_pantalla}:`, e);
              mockupImgData = null;
            }

            if (mockupImgData) {
              const size = await getImageSize(mockupImgData);
              const maxW = maxLineWidth;
              let w = size.width;
              let h = size.height;
              // Convertir px a mm (aprox 3.7795 px/mm a 96dpi)
              const pxToMm = (px) => px * 0.264583;
              let wMm = Math.min(pxToMm(w), maxW);
              let hMm = (wMm / pxToMm(w)) * pxToMm(h);
              const maxAllowedH = 130;
              if (hMm > maxAllowedH) {
                hMm = maxAllowedH;
                wMm = hMm * (pxToMm(w) / pxToMm(h));
              }
              checkPageBreak(hMm + 15);
              const xMm = margin + (maxLineWidth - wMm) / 2;
              doc.addImage(mockupImgData, "JPEG", xMm, y, wMm, hMm, undefined, "FAST");
              y += hMm + 4;

              // Epígrafe formal IEEE / APA (9pt centrado)
              doc.setFont("helvetica", "bold");
              doc.setFontSize(9);
              doc.setTextColor(...COLOR_HEADING);
              doc.text(`Figura 9.${i + 1}. Prototipo de Interfaz: ${formattedScreen}.`, pageWidth / 2, y, { align: "center" });
              y += 6;

              // Trazabilidad RF
              if (mockup.rf_trazabilidad && mockup.rf_trazabilidad.length > 0) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8.5);
                doc.setTextColor(...COLOR_MUTED);
                doc.text(`Trazabilidad RF: ${mockup.rf_trazabilidad.join(", ")}`, margin, y);
                y += 5;
              }
            } else {
              // Fallback: tabla de especificación textual IEEE
              const rows = [
                ["Pantalla", formattedScreen],
                ["Tipo", capitalizeFirst(mockup.tipo || "interfaz")],
                ["Descripción", capitalizeFirst(mockup.descripcion || "N/A")],
                ["Elementos visibles", (mockup.elementos_visibles || []).join(", ") || "N/A"],
                ["Campos formulario", (mockup.campos_formulario || []).map(c => c.nombre || c).join(", ") || "N/A"],
                ["Acciones principales", (mockup.acciones_principales || []).join(", ") || "N/A"],
                ["RF trazabilidad", (mockup.rf_trazabilidad || []).join(", ") || "N/A"],
                ["Estado", capitalizeFirst(mockup.estado || "generado")],
                ["Versión", String(mockup.version || 1)]
              ];
              drawSpecificationTable(`Mockup: ${formattedScreen}`, rows);
            }
          }
        }

        // --- 10. CERTIFICACIÓN Y APROBACIÓN TÉCNICA ---
        checkPageBreak(45);
        drawSectionHeader("10. Certificación y Aprobación Técnica");

        const certText =
          "El presente documento técnico de especificación de requisitos y diseño preliminar ha sido formalmente estructurado y validado conforme a los estándares internacionales de ingeniería de software ISO/IEC/IEEE 29148:2018 para especificaciones formales y modelado de sistemas.";
        drawParagraph(certText);
        y += 10;

        // Firmas formales
        const signW = 65;
        const sign1X = margin + 12;
        const sign2X = pageWidth - margin - signW - 12;

        doc.setDrawColor(...COLOR_LINE);
        doc.setLineWidth(0.3);
        doc.line(sign1X, y, sign1X + signW, y);
        doc.line(sign2X, y, sign2X + signW, y);
        y += 4.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("Analista de Requisitos", sign1X + signW / 2, y, { align: "center" });
        doc.text("Arquitecto / Diseñador de Software", sign2X + signW / 2, y, { align: "center" });
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_MUTED);
        doc.text("Equipo de Ingeniería de Software", sign1X + signW / 2, y, { align: "center" });
        doc.text("Firma de Aprobación Formal", sign2X + signW / 2, y, { align: "center" });

        // --- NUMERACIÓN DE PÁGINAS FORMAL AL PIE CON LÍNEA DIVISORIA IEEE ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(148, 163, 184);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.25);
          doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
          doc.text(
            "ICASE CASE Tool • Documentación Técnica Oficial ISO/IEC/IEEE 29148:2018",
            margin,
            pageHeight - 7.5
          );
          doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 7.5, { align: "right" });
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
