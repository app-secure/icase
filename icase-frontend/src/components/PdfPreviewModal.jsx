import React, { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
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
            // Encabezado formal de página con espaciado equilibrado y línea ploma
            const headerTextY = 11.5;
            const headerLineY = 14.5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(120, 120, 120);
            doc.text(
              `${project.name || "Sistema de Información"} • Documento de Especificación y Diseño`,
              margin,
              headerTextY
            );
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.2);
            doc.line(margin, headerLineY, pageWidth - margin, headerLineY);

            // Espaciado adecuado para que el encabezado y la línea ploma no queden pegados al contenido
            y = 23.5;
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
          checkPageBreak(h + 25);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(...COLOR_HEADING);
          doc.text(title, margin, y);
          y += 4.5;

          const tieneNarrativa = descripcionTexto && typeof descripcionTexto === "string" && descripcionTexto.trim().length > 10;
          if (tieneNarrativa) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            doc.setTextColor(...COLOR_TEXT);
            const descLines = doc.splitTextToSize(descripcionTexto, maxLineWidth);
            doc.text(descLines, margin, y);
            y += descLines.length * 3.8 + 2.5;
          }

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

            if (listItems) {
              checkPageBreak(22);
              const cleanDiagramTitle = title.replace(/^\d+(\.\d+)*\s*/, "").trim();
              const explanationTitle = `Descripción del ${cleanDiagramTitle}:`;

              doc.setFont("helvetica", "bold");
              doc.setFontSize(8.5);
              doc.setTextColor(...COLOR_HEADING);
              doc.text(explanationTitle, margin, y);
              y += 4.5;

              listItems.forEach((item) => {
                if (typeof item === "string" && item.includes(":")) {
                  const [prefix, ...rest] = item.split(":");
                  const fullText = `• ${prefix.trim()}: ${rest.join(":")}`;
                  const splitLines = doc.splitTextToSize(fullText, maxLineWidth);
                  checkPageBreak(splitLines.length * 3.8 + 1.5);
                  doc.setFont("helvetica", "normal");
                  doc.setFontSize(8.5);
                  doc.setTextColor(...COLOR_TEXT);
                  doc.text(splitLines, margin, y);
                  y += splitLines.length * 3.8;
                } else if (typeof item === "string") {
                  const splitLines = doc.splitTextToSize(`• ${item}`, maxLineWidth);
                  checkPageBreak(splitLines.length * 3.8 + 1.5);
                  doc.setFont("helvetica", "normal");
                  doc.setFontSize(8.5);
                  doc.setTextColor(...COLOR_TEXT);
                  doc.text(splitLines, margin, y);
                  y += splitLines.length * 3.8;
                }
              });
              y += 3;
            }
          } catch (e) {
            console.warn("Error incrustando imagen en PDF:", e);
          }
        };

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

        // Metadatos
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(
          `Fecha de Emisión: ${new Date().toLocaleDateString("es-ES")}`,
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

        domainKeywords.forEach((kw) => {
          checkPageBreak(5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...COLOR_TEXT);
          const splitKw = doc.splitTextToSize(`• ${kw}`, maxLineWidth);
          doc.text(splitKw, margin + 2, y);
          y += splitKw.length * 3.8;
        });
        y += 4;

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
        doc.text("7. Especificación de Requerimientos del Sistema", margin, y);
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

        // --- 9. WIREFRAMES Y MOCKUPS DE INTERFAZ ---
        if (project.mockups && project.mockups.length > 0) {
          checkPageBreak(30);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...COLOR_TITLE);
          doc.text("9. Wireframes y Mockups de Interfaz", margin, y);
          y += 5.5;

          for (let i = 0; i < project.mockups.length; i++) {
            const mockup = project.mockups[i];
            if (!mockup.preview_code) continue;

            checkPageBreak(40);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            doc.setTextColor(...COLOR_HEADING);
            doc.text(`9.${i + 1} ${mockup.nombre_pantalla}`, margin, y);
            y += 4.5;

            if (mockup.descripcion) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(8);
              doc.setTextColor(...COLOR_TEXT);
              const descLines = doc.splitTextToSize(mockup.descripcion, maxLineWidth);
              doc.text(descLines, margin, y);
              y += descLines.length * 3.6 + 3;
            }

            // Renderizar mockup HTML en iframe (para que Tailwind CDN y CSS ejecuten correctamente)
            let mockupImgData = null;
            try {
              mockupImgData = await new Promise((resolve) => {
                const iframe = document.createElement("iframe");
                iframe.style.position = "fixed";
                iframe.style.left = "-9999px";
                iframe.style.top = "0";
                iframe.style.width = "1280px";
                iframe.style.height = "900px";
                iframe.style.border = "none";
                iframe.style.visibility = "hidden";
                iframe.style.pointerEvents = "none";
                iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
                document.body.appendChild(iframe);

                const timeout = setTimeout(() => {
                  try { document.body.removeChild(iframe); } catch(_) {}
                  resolve(null);
                }, 12000);

                const tryCapture = (attempts) => {
                  if (attempts <= 0) {
                    clearTimeout(timeout);
                    try { document.body.removeChild(iframe); } catch(_) {}
                    resolve(null);
                    return;
                  }

                  const iDoc = iframe.contentDocument;
                  if (!iDoc) {
                    setTimeout(() => tryCapture(attempts - 1), 300);
                    return;
                  }

                  // Verificar si Tailwind ya compiló (buscar elementos con estilos aplicados)
                  const tailwindReady = !iDoc.querySelector('script[src*="tailwindcss"]') ||
                    (iDoc.body && window.getComputedStyle(iDoc.body).fontFamily !== '' &&
                     iDoc.body.children.length > 0 &&
                     (iDoc.querySelector('[class]') ? window.getComputedStyle(iDoc.querySelector('[class]')).padding !== undefined : true));

                  if (tailwindReady) {
                    html2canvas(iDoc.body || iDoc.documentElement, {
                      scale: 1.8,
                      useCORS: true,
                      logging: false,
                      backgroundColor: "#ffffff",
                      width: 1280,
                      height: 900,
                      windowWidth: 1280,
                      windowHeight: 900,
                      allowTaint: false
                    }).then(canvas => {
                      clearTimeout(timeout);
                      try { document.body.removeChild(iframe); } catch(_) {}
                      resolve(canvas.toDataURL("image/png", 0.92));
                    }).catch(() => {
                      clearTimeout(timeout);
                      try { document.body.removeChild(iframe); } catch(_) {}
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

                // Escribir el HTML con garantía de Tailwind CDN
                let html = mockup.preview_code || "";
                // Si no tiene CDN de Tailwind, agregarlo
                if (!html.includes("cdn.tailwindcss.com")) {
                  html = html.replace(/<head>/i, '<head>\n<script src="https://cdn.tailwindcss.com"><\/script>');
                }
                // Si no tiene configuración de colores, agregarla
                if (!html.includes("tailwind.config")) {
                  html = html.replace(/<\/head>/i, `
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
      colors: {
        primary: { 50:'#eff6ff',100:'#dbeafe',500:'#0b57d0',600:'#0947a8',700:'#073d8c' },
        secondary: { 500:'#64748b',600:'#475569' }
      }
    }
  }
}
<\/script>
</head>`);
                }
                // Estilos de respaldo (CSS plano) por si Tailwind tarda demasiado
                const fallbackCss = `
<style id="icase-fallback">
*, *::before, *::after { box-sizing: border-box; }
html, body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
.flex { display: flex; } .flex-col { flex-direction: column; } .flex-1 { flex: 1 1 0%; }
.items-center { align-items: center; } .justify-center { justify-content: center; } .justify-between { justify-content: space-between; }
.min-h-screen { min-height: 100vh; } .h-full { height: 100%; } .w-full { width: 100%; }
.p-4 { padding: 1rem; } .p-6 { padding: 1.5rem; } .p-8 { padding: 2rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; } .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.px-5 { padding-left: 1.25rem; padding-right: 1.25rem; } .py-2\\.5 { padding-top: 0.625rem; padding-bottom: 0.625rem; }
.px-4.py-2\\.5 { padding: 0.625rem 1rem; }
.mb-1 { margin-bottom: 0.25rem; } .mb-2 { margin-bottom: 0.5rem; } .mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; } .mb-8 { margin-bottom: 2rem; } .mt-1 { margin-top: 0.25rem; }
.mt-6 { margin-top: 1.5rem; } .mx-auto { margin-left: auto; margin-right: auto; }
.space-y-5 > * + * { margin-top: 1.25rem; }
.text-center { text-align: center; } .text-xs { font-size: 0.75rem; } .text-sm { font-size: 0.875rem; }
.text-2xl { font-size: 1.5rem; } .text-xl { font-size: 1.25rem; } .text-3xl { font-size: 1.875rem; }
.font-semibold { font-weight: 600; } .font-medium { font-weight: 500; } .font-bold { font-weight: 700; }
.text-white { color: #ffffff; } .text-slate-900 { color: #0f172a; } .text-slate-800 { color: #1e293b; }
.text-slate-700 { color: #334155; } .text-slate-600 { color: #475569; } .text-slate-500 { color: #64748b; }
.text-slate-400 { color: #94a3b8; } .text-primary-600 { color: #0947a8; }
.bg-white { background-color: #ffffff; } .bg-slate-50 { background-color: #f8fafc; }
.bg-slate-100 { background-color: #f1f5f9; } .bg-slate-200 { background-color: #e2e8f0; }
.bg-primary-600 { background-color: #0947a8; } .bg-primary-500 { background-color: #0b57d0; }
.bg-primary-700 { background-color: #073d8c; }
.bg-gradient-to-br { background-image: linear-gradient(to bottom right, var(--tw-gradient-stops)); }
.from-primary-500 { --tw-gradient-from: #0b57d0; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgba(11,87,208,0)); }
.to-primary-700 { --tw-gradient-to: #073d8c; }
.from-blue-500 { --tw-gradient-from: #3b82f6; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgba(59,130,246,0)); }
.to-blue-700 { --tw-gradient-to: #1d4ed8; }
.from-slate-700 { --tw-gradient-from: #334155; } .to-slate-900 { --tw-gradient-to: #0f172a; }
.border { border-width: 1px; border-style: solid; } .border-slate-200 { border-color: #e2e8f0; }
.border-slate-300 { border-color: #cbd5e1; } .border-slate-100 { border-color: #f1f5f9; }
.rounded { border-radius: 0.25rem; } .rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; } .rounded-2xl { border-radius: 1rem; }
.rounded-full { border-radius: 9999px; }
.shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1); }
.shadow-md { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); }
.shadow-sm { box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
.w-full { width: 100%; } .max-w-md { max-width: 28rem; } .max-w-lg { max-width: 32rem; }
.max-w-6xl { max-width: 72rem; } .max-w-7xl { max-width: 80rem; }
.w-16 { width: 4rem; } .h-16 { height: 4rem; } .w-8 { width: 2rem; } .h-8 { height: 2rem; }
.w-5 { width: 1.25rem; } .h-5 { height: 1.25rem; } .w-4 { width: 1rem; } .h-4 { height: 1rem; }
.w-10 { width: 2.5rem; } .h-10 { height: 2.5rem; } .w-12 { width: 3rem; } .h-12 { height: 3rem; }
.w-20 { width: 5rem; } .h-20 { height: 5rem; } .w-24 { width: 6rem; } .h-24 { height: 6rem; }
.overflow-hidden { overflow: hidden; } .overflow-x-auto { overflow-x: auto; }
.relative { position: relative; } .absolute { position: absolute; } .sticky { position: sticky; }
.top-0 { top: 0; } .right-0 { right: 0; } .inset-0 { inset: 0; }
.z-10 { z-index: 10; } .z-50 { z-index: 50; }
.gap-1 { gap: 0.25rem; } .gap-2 { gap: 0.5rem; } .gap-3 { gap: 0.75rem; } .gap-4 { gap: 1rem; }
.grid { display: grid; } .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.col-span-2 { grid-column: span 2 / span 2; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uppercase { text-transform: uppercase; } .capitalize { text-transform: capitalize; }
.tracking-wider { letter-spacing: 0.05em; } .leading-relaxed { line-height: 1.625; }
.opacity-60 { opacity: 0.6; } .opacity-80 { opacity: 0.8; }
.aspect-video { aspect-ratio: 16 / 9; }
.table { display: table; } .table-auto { table-layout: auto; }
.border-collapse { border-collapse: collapse; }
input, select, textarea {
  border: 1px solid #cbd5e1; border-radius: 0.75rem; padding: 0.625rem 1rem;
  font-size: 0.875rem; color: #0f172a; background: #fff; width: 100%;
  box-sizing: border-box; font-family: inherit;
}
button {
  border-radius: 0.75rem; padding: 0.625rem 1.25rem; font-weight: 600;
  font-family: inherit; cursor: pointer; display: inline-flex; align-items: center;
}
button.bg-primary-600, button.bg-primary-500 {
  background-color: #0947a8; color: white; border: none;
}
.bg-emerald-100 { background-color: #d1fae5; } .text-emerald-700 { color: #065f46; }
.bg-amber-100 { background-color: #fef3c7; } .text-amber-700 { color: #92400e; }
.bg-red-100 { background-color: #fee2e2; } .text-red-700 { color: #b91c1c; }
.bg-blue-100 { background-color: #dbeafe; } .text-blue-700 { color: #1d4ed8; }
.ring-2 { box-shadow: 0 0 0 2px; }
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
nav, header { background: white; border-bottom: 1px solid #e2e8f0; padding: 0.75rem 1.5rem; }
table { width: 100%; border-collapse: collapse; }
th { background: #f8fafc; padding: 0.75rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; }
td { padding: 0.75rem; font-size: 0.875rem; color: #334155; border-bottom: 1px solid #f1f5f9; }
tr:hover td { background: #f8fafc; }
sidebar, .sidebar { background: #1e293b; color: white; }
</style>`;
                html = html.replace(/<\/head>/i, `${fallbackCss}\n</head>`);

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
              const ratio = w / h;
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
              doc.addImage(mockupImgData, "PNG", xMm, y, wMm, hMm);
              y += hMm + 4;

              // Epígrafe
              doc.setFont("helvetica", "italic");
              doc.setFontSize(7.5);
              doc.setTextColor(...COLOR_MUTED);
              doc.text(`Figura 9.${i + 1}: Mockup de ${mockup.nombre_pantalla} (${mockup.tipo || "pantalla"})`, pageWidth / 2, y, { align: "center" });
              y += 5;

              // Trazabilidad RF
              if (mockup.rf_trazabilidad && mockup.rf_trazabilidad.length > 0) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.5);
                doc.setTextColor(...COLOR_MUTED);
                doc.text(`Trazabilidad RF: ${mockup.rf_trazabilidad.join(", ")}`, margin, y);
                y += 4;
              }
            } else {
              // Fallback: tabla de especificación textual
              const rows = [
                ["Pantalla", mockup.nombre_pantalla],
                ["Tipo", mockup.tipo || "N/A"],
                ["Descripción", mockup.descripcion || "N/A"],
                ["Elementos visibles", (mockup.elementos_visibles || []).join(", ") || "N/A"],
                ["Campos formulario", (mockup.campos_formulario || []).map(c => c.nombre || c).join(", ") || "N/A"],
                ["Acciones principales", (mockup.acciones_principales || []).join(", ") || "N/A"],
                ["RF trazabilidad", (mockup.rf_trazabilidad || []).join(", ") || "N/A"],
                ["Estado", mockup.estado || "generado"],
                ["Versión", String(mockup.version || 1)]
              ];
              drawSpecificationTable(`Mockup: ${mockup.nombre_pantalla}`, rows);
            }
          }
        }

        // --- 10. CERTIFICACIÓN Y APROBACIÓN TÉCNICA ---
        checkPageBreak(35);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(...COLOR_HEADING);
        doc.text("10. Certificación y Aprobación Técnica", margin, y);
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
        doc.text("Firma de Aprobación", sign2X + signW / 2, y, { align: "center" });

        // --- NUMERACIÓN DE PÁGINAS FORMAL AL PIE ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          doc.text(
            `Página ${p} de ${totalPages}  •  Documento Técnico de Especificación y Diseño del Sistema`,
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
