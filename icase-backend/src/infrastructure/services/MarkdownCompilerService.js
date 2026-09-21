class MarkdownCompilerService {
  compilar({ proyecto, fuentes = [], requerimientos = [], casosDeUso = [], diseno = null, diagramas = [] }) {
    const fecha = new Date().toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const rfList = requerimientos.filter((r) => r.tipo === 'RF');
    const rnfList = requerimientos.filter((r) => r.tipo === 'RNF');

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
      md += `- Modelar la arquitectura de software (Frontend, Backend monolito modular e infraestructura redundante) y esquemas de datos relacionales.\n`;
    }
    md += `\n`;

    // 3. Resumen
    md += `## 3. Resumen\n\n`;
    md += `${proyecto.resumen || proyecto.descripcion || `El proyecto ${proyecto.nombre} aborda la digitalización y automatización integral de sus procesos centrales mediante una rigurosa especificación para la planificación, análisis y diseño de software, garantizando altos estándares de rendimiento, disponibilidad y mantenibilidad.`}\n\n`;

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
      keywords = ['Control Operativo', 'Gestión de Procesos', 'Trazabilidad', 'Seguridad Transaccional'];
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
        md += `- **Precondiciones:** ${rf.precondiciones || 'Usuario autenticado en el sistema'}\n`;
        md += `- **Postcondiciones:** ${rf.poscondiciones || 'Registro almacenado exitosamente'}\n\n`;
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
      const cuDiag = diagramas.find((d) => d.tipo === 'casos_de_uso' || d.tipo === 'casos_uso');
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
    md += `---\n\n`;

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
    const classCode = diagramas.find((d) => d.tipo === 'clases')?.codigo_plantuml || diseno?.modelo_datos?.codigo_plantuml || diagramas.find((d) => d.tipo === 'clases')?.codigo_mermaid;
    if (classCode) {
      md += `\`\`\`plantuml\n${classCode}\n\`\`\`\n\n`;
    }

    // 8.2 Árbol de Navegación
    md += `### 8.2 Árbol de Arquitectura de Navegación (WBS)\n\n`;
    const navCode = diagramas.find((d) => d.tipo === 'arbol_navegacion')?.codigo_plantuml || diseno?.arbol_navegacion?.codigo_plantuml || diagramas.find((d) => d.tipo === 'arbol_navegacion')?.codigo_mermaid;
    if (navCode) {
      md += `\`\`\`plantuml\n${navCode}\n\`\`\`\n\n`;
    }

    // 8.3 Arquitectura del Sistema y Software
    md += `### 8.3 Arquitectura del Sistema y Software (Structurizr C4)\n\n`;
    md += `#### Arquitectura de Frontend\n`;
    md += `${diseno?.arquitectura_frontend?.descripcion || 'Estructura modular dividida en capas bien definidas: App Layer (rutas y layouts), Features Layer (lógica por dominio y llamadas API), y Shared Layer (componentes reutilizables).'}\n\n`;

    md += `#### Arquitectura de Backend e Infraestructura\n`;
    md += `${diseno?.arquitectura_backend?.descripcion || 'Construida bajo enfoque de monolito modular con separación lógica clara, autenticación JWT y persistencia en base de datos central con réplica en caliente.'}\n\n`;

    const archCode = diagramas.find((d) => d.tipo === 'arquitectura')?.codigo_plantuml || diseno?.arquitectura_backend?.codigo_plantuml || diagramas.find((d) => d.tipo === 'arquitectura')?.codigo_mermaid;
    if (archCode) {
      md += `> **Diagrama de Infraestructura y Arquitectura C4:**\n\n`;
      md += `\`\`\`plantuml\n${archCode}\n\`\`\`\n\n`;
    }

    md += `---\n\n`;
    md += `*Documento de Especificación Técnica de Software (IEEE 830 / ISO 29148)*\n`;

    return md;
  }
}

module.exports = MarkdownCompilerService;
