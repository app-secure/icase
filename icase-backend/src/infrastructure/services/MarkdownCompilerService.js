const {
  DIAGRAM_TYPES,
  normalizeDiagramType
} = require('../../core/constants/DiagramTypes');

function diagramTimestamp(diagram) {
  const parsed = new Date(diagram?.updatedAt || diagram?.createdAt || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestDiagram(diagrams, expectedType) {
  return (Array.isArray(diagrams) ? diagrams : [])
    .filter((diagram) => normalizeDiagramType(diagram?.tipo) === expectedType)
    .sort((left, right) => {
      const approvalDelta = Number(Boolean(right?.aprobado)) - Number(Boolean(left?.aprobado));
      if (approvalDelta !== 0) return approvalDelta;
      const versionDelta = Number(right?.version || 1) - Number(left?.version || 1);
      return versionDelta !== 0 ? versionDelta : diagramTimestamp(right) - diagramTimestamp(left);
    })[0] || null;
}

function diagramCode(diagram) {
  return diagram?.codigo_plantuml || diagram?.codigo_mermaid || '';
}

function diagramTracesRequirement(diagram, requirementId) {
  if (!diagram || !requirementId) return false;
  const expected = String(requirementId).trim().toUpperCase();
  const related = Array.isArray(diagram.requisitos_relacionados) ? diagram.requisitos_relacionados : [];
  const qualityTrace = Array.isArray(diagram.trazabilidad_rnf) ? diagram.trazabilidad_rnf : [];
  const relatedIds = [
    ...related.map((item) => typeof item === 'object' ? (item.identificador || item.id || item.rnf_id) : item),
    ...qualityTrace.map((item) => typeof item === 'object' ? (item.rnf_id || item.identificador || item.id) : item)
  ].map((item) => String(item || '').trim().toUpperCase());
  if (relatedIds.includes(expected)) return true;
  return String(diagramCode(diagram)).toUpperCase().includes(expected);
}

class MarkdownCompilerService {
  compilar({ proyecto, fuentes = [], requerimientos = [], casosDeUso = [], diseno = null, diagramas = [] }) {
    const fecha = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const rfList = requerimientos.filter((r) => r.tipo === 'RF');
    const rnfList = requerimientos.filter((r) => r.tipo === 'RNF');
    const currentDiagrams = {
      useCases: latestDiagram(diagramas, DIAGRAM_TYPES.USE_CASES),
      domainClasses: latestDiagram(diagramas, DIAGRAM_TYPES.DOMAIN_CLASSES),
      softwareArchitecture: latestDiagram(diagramas, DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE),
      systemArchitecture: latestDiagram(diagramas, DIAGRAM_TYPES.SYSTEM_ARCHITECTURE),
      designClasses: latestDiagram(diagramas, DIAGRAM_TYPES.DESIGN_CLASSES),
      navigationTree: latestDiagram(diagramas, DIAGRAM_TYPES.NAVIGATION_TREE)
    };

    let md = `# DOCUMENTACIÓN DE ESPECIFICACIÓN Y DISEÑO DE SOFTWARE\n\n`;
    md += `## 1. Título del Proyecto\n${proyecto.nombre}\n\n`;
    md += `**Estado del Proyecto:** ${proyecto.estado_fase?.replace(/_/g, ' ').toUpperCase() || 'ANALISIS APROBADO'}\n\n`;
    md += `**Fecha de Emisión:** ${fecha}\n\n`;

    // 2. Objetivos
    md += `## 2. Objetivos\n\n`;
    md += `### 2.1 General\n${proyecto.objetivo_general || `Desarrollar la especificación técnica, análisis de requisitos y diseño de software para ${proyecto.nombre}.`}\n\n`;
    md += `### 2.2 Específicos\n`;
    if (proyecto.objetivos_especificos && proyecto.objetivos_especificos.length > 0) {
      for (const obj of proyecto.objetivos_especificos) {
        md += `- ${obj}\n`;
      }
    } else {
      md += `- Realizar el levantamiento y estructuración formal de requerimientos funcionales y no funcionales cuantificables bajo estándar IEEE 830.\n`;
      md += `- Diseñar los casos de uso para los 4 procesos fundamentales con especificación de flujos básicos, alternativos y excepciones.\n`;
      md += `- Modelar la arquitectura de software y del sistema conforme a las tecnologías y restricciones expresamente aprobadas.\n`;
    }
    md += `\n`;

    // 3. Resumen
    md += `## 3. Resumen\n\n`;
    md += `${proyecto.resumen || proyecto.descripcion || `El proyecto ${proyecto.nombre} documenta sus necesidades de negocio, requisitos aprobados y decisiones de diseño con trazabilidad entre las distintas fases.`}\n\n`;

    // 4. Palabras Clave
    md += `## 4. Palabras Clave\n\n`;
    let keywords = proyecto.palabras_clave?.length
      ? proyecto.palabras_clave.filter(k => !/case|plantuml|mermaid|uml|clean architecture|upper/i.test(k))
      : [];
    if (keywords.length === 0) {
      keywords = (requerimientos || [])
        .filter(r => (r.tipo || '').toUpperCase() === 'RF')
        .slice(0, 6)
        .map(r => r.nombre.replace(/^(Gestión de|Control de|Registro de|Módulo de)\s*/i, ''));
    }
    if (keywords.length === 0) {
      keywords = ['Especificación', 'Requisitos', 'Diseño', 'Trazabilidad'];
    }
    md += keywords.map((k) => `- ${k}`).join('\n') + `\n\n`;

    // 5. Introducción
    md += `## 5. Introducción\n\n`;
    md += `${proyecto.introduccion || `La modernización tecnológica de los procesos operativos representa una ventaja competitiva fundamental. Este documento recopila la especificación formal elaborada a partir de los insumos provistos en actas de reunión, entrevistas y documentación previa del sistema.`}\n\n`;

    // 6. Insumos y Fuentes Analizadas
    md += `## 6. Fuentes e Insumos Analizados\n\n`;
    if (fuentes.length === 0) {
      md += `\`\`\`text\n${proyecto.insumo_bruto || 'Insumo de texto directo cargado para el proyecto.'}\n\`\`\`\n\n`;
    } else {
      md += `| Tipo | Nombre del Archivo | Tamaño | Estado de Transcripción |\n`;
      md += `|---|---|---|---|\n`;
      for (const f of fuentes) {
        md += `| **${f.tipo.toUpperCase()}** | ${f.nombre_archivo} | ${f.tamanio} | ✅ Procesado |\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;

    // 7. Análisis de Requerimientos
    md += `## 7. Análisis de Requerimientos\n\n`;

    // 7.1 Requerimientos Funcionales
    md += `### 7.1 Especificación de Requerimientos Funcionales (IEEE 830)\n\n`;
    if (rfList.length === 0) {
      md += `*No se registran requerimientos funcionales aprobados aún.*\n\n`;
    } else {
      md += `| ID | Nombre del Requerimiento | Prioridad | Actores | Dependencias |\n`;
      md += `|---|---|---|---|---|\n`;
      for (const rf of rfList) {
        const actores = Array.isArray(rf.actores) ? rf.actores.join(', ') : rf.actores;
        md += `| **${rf.identificador}** | ${rf.nombre} | ${rf.prioridad} | ${actores || '-'} | ${rf.dependencias || 'Ninguna'} |\n`;
      }
      md += `\n#### Fichas Técnicas Detalladas de Requerimientos Funcionales\n\n`;
      for (const rf of rfList) {
        md += `##### ${rf.identificador}: ${rf.nombre}\n`;
        md += `- **Descripción:** ${rf.descripcion}\n`;
        md += `- **Dependencias:** ${rf.dependencias || 'Ninguna'}\n`;
        md += `- **Prioridad:** ${rf.prioridad}\n`;
        md += `- **Actores:** ${Array.isArray(rf.actores) ? rf.actores.join(', ') : rf.actores}\n`;
        md += `- **Precondiciones:** ${rf.precondiciones || 'No especificadas en los insumos'}\n`;
        md += `- **Postcondiciones:** ${rf.poscondiciones || 'No especificadas en los insumos'}\n\n`;
      }
    }

    // 7.2 Requisitos No Funcionales Cuantificables
    md += `### 7.2 Requisitos No Funcionales (Métricas Numéricas Cuantificables)\n\n`;
    if (rnfList.length === 0) {
      md += `*No se registran requerimientos no funcionales aún.*\n\n`;
    } else {
      md += `| ID | Requerimiento No Funcional | Métrica Numérica Cuantificable | Prioridad |\n`;
      md += `|---|---|---|---|\n`;
      for (const rnf of rnfList) {
        md += `| **${rnf.identificador}** | ${rnf.nombre} | \`${rnf.metrica_medible}\` | ${rnf.prioridad} |\n`;
      }
      md += `\n`;
    }

    // 7.3 Casos de Uso (4 Procesos Fundamentales)
    md += `### 7.3 Casos de Uso y Procesos Fundamentales\n\n`;
    if (casosDeUso.length === 0) {
      const cuDiag = currentDiagrams.useCases;
      if (cuDiag) {
        const pCode = cuDiag.codigo_plantuml || cuDiag.codigo_mermaid;
        md += `\`\`\`plantuml\n${pCode}\n\`\`\`\n\n`;
      }
    } else {
      for (const cu of casosDeUso) {
        md += `#### Proceso: ${cu.nombre} (${cu.identificador})\n\n`;
        md += `**Descripción Textual:**\n`;
        md += `- **Actores involucrados:** ${cu.actores?.join(', ') || 'Usuario, Sistema'}\n`;
        md += `- **Precondiciones:** ${cu.precondiciones}\n`;
        md += `- **Postcondiciones:** ${cu.poscondiciones}\n\n`;

        if (cu.flujo_basico && cu.flujo_basico.length > 0) {
          md += `**Flujo Básico:**\n`;
          cu.flujo_basico.forEach((paso, idx) => {
            md += `${idx + 1}. ${paso}\n`;
          });
          md += `\n`;
        }

        if (cu.flujos_alternativos && cu.flujos_alternativos.length > 0) {
          md += `**Flujos Alternativos:**\n`;
          cu.flujos_alternativos.forEach((alt) => {
            md += `- ${alt}\n`;
          });
          md += `\n`;
        }

        if (cu.excepciones && cu.excepciones.length > 0) {
          md += `**Excepciones:**\n`;
          cu.excepciones.forEach((exc) => {
            md += `- ${exc}\n`;
          });
          md += `\n`;
        }

        if (cu.codigo_mermaid) {
          md += `\`\`\`mermaid\n${cu.codigo_mermaid}\n\`\`\`\n\n`;
        }
      }
    }
    md += `### 7.4 Matriz de Trazabilidad entre Fases\n\n`;
    md += `Esta matriz permite verificar qué artefactos aprobados representan cada requisito. Una celda vacía señala una relación que debe revisarse, no implica automáticamente que el diagrama sea incorrecto.\n\n`;
    md += `| Requisito | Casos de uso | Dominio | Arq. software | Arq. sistema | Clases diseño | Navegación |\n`;
    md += `|---|---|---|---|---|---|---|\n`;
    const traceColumns = [
      currentDiagrams.useCases,
      currentDiagrams.domainClasses,
      currentDiagrams.softwareArchitecture,
      currentDiagrams.systemArchitecture,
      currentDiagrams.designClasses,
      currentDiagrams.navigationTree
    ];
    for (const requirement of [...rfList, ...rnfList]) {
      const cells = traceColumns.map((diagram) => diagramTracesRequirement(diagram, requirement.identificador)
        ? `Sí (v${Number(diagram?.version || 1)})`
        : '—');
      md += `| **${requirement.identificador}** | ${cells.join(' | ')} |\n`;
    }
    if (rfList.length === 0 && rnfList.length === 0) {
      md += `| Sin requisitos aprobados | — | — | — | — | — | — |\n`;
    }
    md += `\n---\n\n`;

    // 8. Diseño de Software
    md += `## 8. Diseño de Software\n\n`;

    // 8.1 Modelado de Datos
    md += `### 8.1 Modelado de Datos (Entidad-Relación y Clases de Dominio)\n\n`;
    if (diseno?.modelo_datos?.entidades && diseno.modelo_datos.entidades.length > 0) {
      md += `#### Entidades Principales del Dominio\n\n`;
      for (const ent of diseno.modelo_datos.entidades) {
        md += `**${ent.nombre}:**\n`;
        md += `- **Atributos:** ${ent.atributos}\n`;
        md += `- **Descripción:** ${ent.descripcion}\n`;
        md += `- **Relaciones y Cardinalidad:** ${ent.relaciones}\n\n`;
      }
    }
    const classCode = diagramCode(currentDiagrams.domainClasses) || diseno?.modelo_datos?.codigo_plantuml;
    if (classCode) {
      md += `\`\`\`plantuml\n${classCode}\n\`\`\`\n\n`;
    }

    // 8.2 Clases de Diseño
    md += `### 8.2 Diagrama de Clases de Diseño\n\n`;
    const designClassCode = diagramCode(currentDiagrams.designClasses);
    if (designClassCode) {
      md += `${currentDiagrams.designClasses?.descripcion || 'Realización técnica del dominio mediante controladores, casos de uso, DTO, interfaces e implementaciones de repositorio.'}\n\n`;
      md += `\`\`\`plantuml\n${designClassCode}\n\`\`\`\n\n`;
    } else {
      md += `*No existe una versión generada del diagrama de clases de diseño.*\n\n`;
    }

    // 8.3 Árbol de Navegación
    md += `### 8.3 Árbol de Navegación (Pantallas y Rutas)\n\n`;
    const navCode = diagramCode(currentDiagrams.navigationTree) || diseno?.arbol_navegacion?.codigo_plantuml;
    if (navCode) {
      md += `\`\`\`plantuml\n${navCode}\n\`\`\`\n\n`;
    }

    // 8.4 Arquitectura de Software y Sistema
    md += `### 8.4 Arquitectura Técnica (Software y Sistema)\n\n`;

    // 8.4.1 Arquitectura de Software
    const softDiag = currentDiagrams.softwareArchitecture;
    const archCode = diagramCode(softDiag) || diseno?.arquitectura_backend?.codigo_plantuml;
    md += `#### 8.4.1 Arquitectura de Software (C4 Container)\n\n`;
    md += `${softDiag?.descripcion || diseno?.arquitectura_frontend?.descripcion || 'Vista lógica de los contenedores y responsabilidades aprobados para el sistema.'}\n\n`;
    if (archCode) {
      md += `> **Diagrama de Arquitectura de Software:**\n\n`;
      md += `\`\`\`plantuml\n${archCode}\n\`\`\`\n\n`;
    }

    // 8.4.2 Arquitectura de Sistema e Infraestructura
    const sysDiag = currentDiagrams.systemArchitecture;
    if (sysDiag) {
      md += `#### 8.4.2 Arquitectura de Sistema e Infraestructura (C4 Deployment)\n\n`;
      md += `${sysDiag?.descripcion || 'Vista de despliegue de los artefactos aprobados sobre los nodos definidos para el sistema.'}\n\n`;
      if (diagramCode(sysDiag)) {
        md += `> **Diagrama de Despliegue e Infraestructura:**\n\n`;
        md += `\`\`\`plantuml\n${diagramCode(sysDiag)}\n\`\`\`\n\n`;
      }
    }

    // 8.5 Wireframes y Mockups de Interfaz
    md += `### 8.5 Wireframes y Mockups de Interfaz\n\n`;
    if (diseno?.mockups && diseno.mockups.length > 0) {
      for (const mockup of diseno.mockups) {
        md += `#### ${mockup.nombre_pantalla}\n\n`;
        md += `**Tipo:** ${mockup.tipo || 'N/A'}  \n`;
        md += `**Descripción:** ${mockup.descripcion || 'Sin descripción'}  \n`;
        if (mockup.descripcion_jerarquica && mockup.descripcion_jerarquica.length > 0) {
          md += `**Descripción Jerárquica:**\n`;
          for (const item of mockup.descripcion_jerarquica) {
            md += `${item}\n`;
          }
          md += `\n`;
        }
        if (mockup.elementos_visibles && mockup.elementos_visibles.length > 0) {
          md += `**Elementos Visibles:** ${mockup.elementos_visibles.join(', ')}  \n`;
        }
        if (mockup.campos_formulario && mockup.campos_formulario.length > 0) {
          md += `**Campos de Formulario:**\n`;
          for (const campo of mockup.campos_formulario) {
            md += `- ${campo.nombre} (${campo.tipo})${campo.requerido ? ' *requerido*' : ''}${campo.validacion ? ` - ${campo.validacion}` : ''}\n`;
          }
          md += `\n`;
        }
        if (mockup.acciones_principales && mockup.acciones_principales.length > 0) {
          md += `**Acciones Principales:** ${mockup.acciones_principales.join(', ')}  \n`;
        }
        if (mockup.rf_trazabilidad && mockup.rf_trazabilidad.length > 0) {
          md += `**Trazabilidad RF:** ${mockup.rf_trazabilidad.join(', ')}  \n`;
        }
        md += `**Estado:** ${mockup.estado || 'generado'}  \n`;
        md += `**Versión:** ${mockup.version || 1}  \n\n`;
      }
    } else {
      md += `*No se han generado mockups para este proyecto.*\n\n`;
    }

    md += `---\n\n`;
    md += `*Documento de Especificación Técnica de Software (IEEE 830 / ISO 29148)*\n`;

    return md;
  }
}

module.exports = MarkdownCompilerService;
