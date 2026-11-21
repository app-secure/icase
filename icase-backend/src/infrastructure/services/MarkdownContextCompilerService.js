const fs = require('node:fs');
const path = require('node:path');

/**
 * MarkdownContextCompilerService
 * Servicio de infraestructura encargado de materializar el Context Checkpoint
 * en archivos Markdown antes de la fase de generación de código.
 */
class MarkdownContextCompilerService {
  constructor({ baseDir = null, domainExtractor = null } = {}) {
    this.baseDir = baseDir || path.resolve(process.cwd(), '.icase-context');
    this.domainExtractor = domainExtractor || new (require('./DomainModelExtractor'))();
  }

  /**
   * Compila y persiste los artefactos Markdown que conforman el Context Checkpoint.
   * @param {string} proyectoId - Identificador del proyecto.
   * @param {Object} dataAgregada - Contexto consolidado con requisitos, diagramas, modelo, decisiones, etc.
   * @returns {Promise<Object>} Resumen de archivos escritos y rutas.
   */
  async compilarContexto(proyectoId, dataAgregada = {}) {
    const proyecto = dataAgregada.proyecto || {};
    const requerimientos = Array.isArray(dataAgregada.requerimientos) ? dataAgregada.requerimientos : [];
    const diagramas = Array.isArray(dataAgregada.diagramas) ? dataAgregada.diagramas : [];
    const plan = dataAgregada.plan || {};
    const decisiones = dataAgregada.decisiones || this._extraerDecisiones(plan);
    const modeloDominio = dataAgregada.modeloDominio || this.domainExtractor.fromDiagrams(diagramas);

    const targetDir = dataAgregada.targetDir || this.baseDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = {
      '01-REQUIREMENTS.md': this._buildRequirementsMD(requerimientos, proyecto),
      '02-DOMAIN-MODEL.md': this._buildDomainModelMD(modeloDominio),
      '03-BUSINESS-RULES.md': this._buildBusinessRulesMD(decisiones.reglas || []),
      '04-ARCHITECTURE-AND-STACK.md': this._buildArchitectureAndStackMD(decisiones, proyecto),
      '05-ACCESS-CONTROL.md': this._buildAccessControlMD(decisiones.control_acceso || decisiones.acceso),
      '06-APPLICATION-CONTRACT.md': this._buildApplicationContractMD(dataAgregada.contrato || null, decisiones, requerimientos)
    };

    const writtenFiles = [];
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, content, 'utf8');
      writtenFiles.push({
        nombre: filename,
        ruta: filePath,
        tamano_bytes: Buffer.byteLength(content, 'utf8')
      });
    }

    return {
      proyecto_id: proyectoId,
      directorio: targetDir,
      archivos: writtenFiles,
      fecha_compilacion: new Date().toISOString()
    };
  }

  _extraerDecisiones(plan) {
    const etapas = Array.isArray(plan?.etapas) ? plan.etapas : [];
    const decisiones = {};
    for (const etapa of etapas) {
      if (etapa.propuesta) {
        decisiones[etapa.etapa] = etapa.propuesta;
      }
    }
    decisiones.reglas = decisiones.reglas_negocio?.reglas || [];
    decisiones.acceso = decisiones.control_acceso || null;
    decisiones.stack = decisiones.stack_tecnologico || null;
    decisiones.alcance = decisiones.alcance_plataforma || null;
    decisiones.arquitectura = decisiones.arquitectura_codigo || null;
    decisiones.carpetas = decisiones.estructura_carpetas || null;
    decisiones.modulos = decisiones.modulos || null;
    return decisiones;
  }

  /**
   * Construye el documento Markdown de requisitos iterando sobre RFs y RNFs
   * con su ID, actores, descripción y criterios.
   */
  _buildRequirementsMD(requerimientos = [], proyecto = {}) {
    const rfs = requerimientos.filter((r) => r.tipo === 'RF');
    const rnfs = requerimientos.filter((r) => r.tipo === 'RNF');

    let md = `# REQUISITOS DEL SISTEMA (ISO/IEC/IEEE 29148:2018)\n\n`;
    md += `**Proyecto:** ${proyecto.nombre || 'Proyecto'}\n`;
    md += `**Fecha de Consolidación:** ${new Date().toISOString()}\n`;
    md += `**Requisitos Funcionales (RF):** ${rfs.length}\n`;
    md += `**Requisitos No Funcionales (RNF):** ${rnfs.length}\n\n`;

    md += `## 1. Requisitos Funcionales (RF)\n\n`;
    if (!rfs.length) {
      md += `*No se registraron requisitos funcionales aprobados.*\n\n`;
    } else {
      for (const rf of rfs) {
        const id = rf.identificador || rf.id || 'RF-??';
        const actores = Array.isArray(rf.actores) ? rf.actores.join(', ') : (rf.actores || 'No especificados');
        const desc = rf.descripcion || rf.nombre || 'Sin descripción';

        md += `### ${id}: ${rf.nombre || id}\n`;
        md += `- **ID:** ${id}\n`;
        md += `- **Actores:** ${actores}\n`;
        md += `- **Descripción:** ${desc}\n`;
        if (rf.precondiciones) md += `- **Precondiciones:** ${rf.precondiciones}\n`;
        if (rf.poscondiciones) md += `- **Poscondiciones:** ${rf.poscondiciones}\n`;
        if (Array.isArray(rf.criterios_aceptacion) && rf.criterios_aceptacion.length) {
          md += `- **Criterios de Aceptación:**\n`;
          for (const c of rf.criterios_aceptacion) {
            const descC = typeof c === 'object' ? (c.descripcion || JSON.stringify(c)) : c;
            md += `  - ${descC}\n`;
          }
        }
        if (rf.prioridad) md += `- **Prioridad:** ${rf.prioridad}\n`;
        md += `\n`;
      }
    }

    md += `## 2. Requisitos No Funcionales (RNF)\n\n`;
    if (!rnfs.length) {
      md += `*No se registraron requisitos no funcionales aprobados.*\n\n`;
    } else {
      for (const rnf of rnfs) {
        const id = rnf.identificador || rnf.id || 'RNF-??';
        const desc = rnf.descripcion || rnf.nombre || 'Sin descripción';
        const metrica = rnf.metrica_medible || 'Cualitativa / Pendiente de confirmación numérica';

        md += `### ${id}: ${rnf.nombre || id}\n`;
        md += `- **ID:** ${id}\n`;
        md += `- **Descripción:** ${desc}\n`;
        md += `- **Métrica Medible:** ${metrica}\n`;
        if (rnf.clasificacion || rnf.categoria) md += `- **Categoría:** ${rnf.clasificacion || rnf.categoria}\n`;
        md += `\n`;
      }
    }

    return md;
  }

  /**
   * Construye el documento Markdown de reglas de negocio listándolas clasificadas
   * por entidad y por tipo de validación.
   */
  _buildBusinessRulesMD(reglas = []) {
    let md = `# REGLAS DE NEGOCIO APROBADAS\n\n`;
    md += `Total de reglas confirmadas: ${reglas.length}\n\n`;

    if (!reglas.length) {
      md += `*No se definieron reglas de negocio específicas para este proyecto.*\n`;
      return md;
    }

    // Clasificar por entidad
    const porEntidad = {};
    for (const r of reglas) {
      const entidad = r.entidad || 'General';
      if (!porEntidad[entidad]) porEntidad[entidad] = [];
      porEntidad[entidad].push(r);
    }

    for (const [entidad, lista] of Object.entries(porEntidad)) {
      md += `## Entidad: ${entidad}\n\n`;

      // Clasificar por tipo de validación
      const porTipo = {};
      for (const regla of lista) {
        const tipo = regla.tipo || 'general';
        if (!porTipo[tipo]) porTipo[tipo] = [];
        porTipo[tipo].push(regla);
      }

      for (const [tipo, reglasTipo] of Object.entries(porTipo)) {
        md += `### Tipo de validación: \`${tipo}\`\n\n`;
        for (const r of reglasTipo) {
          const id = r.id || 'RN-??';
          const campo = r.campo ? ` (campo: \`${r.campo}\`)` : '';
          const msg = r.mensaje ? ` - Mensaje: *"${r.mensaje}"*` : '';
          md += `- **[${id}]**${campo}${msg}\n`;
          if (r.descripcion && r.descripcion !== r.mensaje) {
            md += `  - *Detalle:* ${r.descripcion}\n`;
          }
          if (r.expresion || r.formula) {
            md += `  - *Expresión:* \`${r.expresion || r.formula}\`\n`;
          }
          if (r.valores_permitidos) {
            md += `  - *Valores permitidos:* ${JSON.stringify(r.valores_permitidos)}\n`;
          }
          if (r.min !== undefined || r.max !== undefined) {
            md += `  - *Rango:* [${r.min ?? '-∞'}, ${r.max ?? '+∞'}]\n`;
          }
          if (r.origen) {
            md += `  - *Origen:* ${r.origen}${r.evidencia_literal ? ' (con evidencia literal)' : ''}\n`;
          }
        }
        md += `\n`;
      }
    }

    return md;
  }

  _buildDomainModelMD(modeloDominio) {
    let md = `# MODELO DE DOMINIO DEL SISTEMA\n\n`;
    if (!modeloDominio || !modeloDominio.entities || !modeloDominio.entities.length) {
      md += `*No se dispone de un modelo de dominio formalmente extraído.*\n`;
      return md;
    }

    md += `## 1. Entidades y Atributos\n\n`;
    for (const entity of modeloDominio.entities) {
      md += `### Entidad: \`${entity.name}\` (clave: \`${entity.key}\`)\n\n`;
      if (entity.attributes && entity.attributes.length) {
        md += `| Atributo | Tipo | Formato | Referencia |\n`;
        md += `| -------- | ---- | ------- | ---------- |\n`;
        for (const attr of entity.attributes) {
          md += `| \`${attr.name}\` | \`${attr.type || 'string'}\` | ${attr.format || '-'} | ${attr.references || '-'} |\n`;
        }
        md += `\n`;
      } else if (entity.schema?.properties) {
        md += `| Atributo | Tipo | Formato |\n`;
        md += `| -------- | ---- | ------- |\n`;
        for (const [propName, propDef] of Object.entries(entity.schema.properties)) {
          md += `| \`${propName}\` | \`${propDef.type || 'string'}\` | ${propDef.format || '-'} |\n`;
        }
        md += `\n`;
      }
    }

    if (modeloDominio.relations && modeloDominio.relations.length) {
      md += `## 2. Relaciones del Dominio\n\n`;
      md += `| Origen | Cardinalidad | Destino |\n`;
      md += `| ------ | ------------ | ------- |\n`;
      for (const rel of modeloDominio.relations) {
        md += `| \`${rel.from}\` | \`${rel.cardinalidad || '1:N'}\` | \`${rel.to}\` |\n`;
      }
      md += `\n`;
    }

    if (modeloDominio.enums && modeloDominio.enums.length) {
      md += `## 3. Enumeraciones\n\n`;
      for (const e of modeloDominio.enums) {
        md += `- \`${e}\`\n`;
      }
      md += `\n`;
    }

    return md;
  }

  _buildArchitectureAndStackMD(decisiones = {}, proyecto = {}) {
    const stack = decisiones.stack_tecnologico || decisiones.stack || {};
    const alcance = decisiones.alcance_plataforma || decisiones.alcance || {};
    const arqui = decisiones.arquitectura_codigo || decisiones.arquitectura || {};
    const carpetas = decisiones.estructura_carpetas || decisiones.carpetas || {};

    let md = `# ARQUITECTURA Y STACK TECNOLÓGICO\n\n`;
    md += `## 1. Alcance y Plataformas\n`;
    md += `- **Plataformas:** ${(alcance.plataformas || ['web']).join(', ')}\n`;
    if (alcance.alcance) md += `- **Alcance:** ${alcance.alcance}\n`;
    if (alcance.exclusiones) md += `- **Exclusiones:** ${alcance.exclusiones}\n\n`;

    md += `## 2. Stack Tecnológico Seleccionado\n`;
    md += `- **Backend:** ${stack.backend || 'Node.js + Express'}\n`;
    md += `- **Base de Datos:** ${stack.base_datos || 'MongoDB'}\n`;
    md += `- **Frontend:** ${stack.frontend || 'React + Vite'}\n`;
    md += `- **Gestor de Paquetes:** ${stack.gestor_paquetes || 'npm'}\n\n`;

    md += `## 3. Arquitectura de Implementación\n`;
    md += `- **Estilo:** ${arqui.estilo || 'Clean Architecture modular por capas'}\n`;
    if (arqui.capas) md += `- **Capas:** ${Array.isArray(arqui.capas) ? arqui.capas.join(' -> ') : arqui.capas}\n\n`;

    md += `## 4. Estructura de Carpetas Aprobada\n`;
    if (carpetas.arbol) {
      md += `\`\`\`text\n${carpetas.arbol}\n\`\`\`\n\n`;
    } else {
      md += `Árbol de directorios estándar de Clean Architecture.\n\n`;
    }

    return md;
  }

  _buildAccessControlMD(acceso = {}) {
    let md = `# CONTROL DE ACCESO Y MATRIZ DE PERMISOS\n\n`;
    if (!acceso) {
      md += `*Control de acceso no configurado o acceso abierto sin autenticación.*\n`;
      return md;
    }

    const auth = acceso.autenticacion || {};
    md += `## 1. Autenticación\n`;
    md += `- **Método:** ${auth.metodo || 'jwt'}\n`;
    md += `- **Expiración de Token:** ${auth.expiracion || '8h'}\n\n`;

    const roles = acceso.roles || [];
    md += `## 2. Roles Definidos\n`;
    if (!roles.length) {
      md += `*Rol predeterminado: Administrador.*\n\n`;
    } else {
      for (const r of roles) {
        md += `- **${r.nombre || r.id}:** ${r.descripcion || 'Sin descripción'} (autoregistro: ${r.autoregistro ? 'sí' : 'no'})\n`;
      }
      md += `\n`;
    }

    if (acceso.permisos && Object.keys(acceso.permisos).length) {
      md += `## 3. Matriz de Permisos\n\n`;
      md += `\`\`\`json\n${JSON.stringify(acceso.permisos, null, 2)}\n\`\`\`\n`;
    }

    return md;
  }

  _buildApplicationContractMD(contrato, decisiones, requerimientos) {
    let md = `# CONTRATO CANÓNICO DE APLICACIÓN\n\n`;
    if (contrato && Array.isArray(contrato.operations) && contrato.operations.length) {
      md += `## Operaciones API Canónicas\n\n`;
      md += `| ID | Clave | Ruta Colección | Métodos | Entidad |\n`;
      md += `| -- | ----- | -------------- | ------- | ------- |\n`;
      for (const op of contrato.operations) {
        md += `| ${op.id} | \`${op.key}\` | \`${op.collectionPath}\` | ${(op.methods || []).join(', ')} | \`${op.entity || 'N/A'}\` |\n`;
      }
    } else {
      md += `Operaciones derivadas de los requisitos funcionales aprobados.\n\n`;
      const rfs = (requerimientos || []).filter((r) => r.tipo === 'RF');
      for (const rf of rfs) {
        const id = rf.identificador || rf.id;
        md += `- **${id}:** Operación CRUD canónica asociada a \`/api/operations/${id.toLowerCase()}\`\n`;
      }
    }
    md += `\n`;
    return md;
  }
}

module.exports = MarkdownContextCompilerService;

