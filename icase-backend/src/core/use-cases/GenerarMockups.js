const MockupValidatorService = require('../../infrastructure/services/MockupValidatorService');

class GenerarMockups {
  constructor({
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    disenoRepository,
    mockupIaService
  }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
    this.mockupIaService = mockupIaService;
    this.validator = new MockupValidatorService();
  }

  async ejecutar({ proyectoId, pantallas = [], insumoAdicional = '', requerimientosLocales = null }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }

    const reqRepo = this.requerimientoRepository;
    let requerimientos = typeof reqRepo.listarPorProyecto === 'function'
      ? await reqRepo.listarPorProyecto(proyectoId)
      : typeof reqRepo.obtenerPorProyecto === 'function'
        ? await reqRepo.obtenerPorProyecto(proyectoId)
        : [];

    if ((!requerimientos || requerimientos.length === 0) && requerimientosLocales) {
      if (Array.isArray(requerimientosLocales)) {
        requerimientos = requerimientosLocales;
      } else if (requerimientosLocales.functional || requerimientosLocales.nonFunctional) {
        requerimientos = [
          ...(requerimientosLocales.functional || []).map((r, i) => ({ ...r, tipo: 'RF', identificador: r.identificador || r.id || `RF-${String(i + 1).padStart(2, '0')}`, nombre: r.name || r.nombre })),
          ...(requerimientosLocales.nonFunctional || []).map((r, i) => ({ ...r, tipo: 'RNF', identificador: r.identificador || r.id || `RNF-${String(i + 1).padStart(2, '0')}`, nombre: r.category || r.nombre }))
        ];
      }
    }

    const diagRepo = this.diagramaRepository;
    const diagramas = typeof diagRepo.listarPorProyecto === 'function'
      ? await diagRepo.listarPorProyecto(proyectoId)
      : typeof diagRepo.obtenerPorProyecto === 'function'
        ? await diagRepo.obtenerPorProyecto(proyectoId)
        : [];

    const contextoProyecto = this._construirContexto(requerimientos, diagramas, proyecto);

    const resultadoIa = await this.mockupIaService.generarMockups({
      contextoProyecto,
      pantallas,
      insumoAdicional
    });

    const mockupsSanitizados = (resultadoIa?.mockups || []).map(mockup => {
      const sanitizado = this.validator.sanitizar(mockup.preview_code);
      return {
        ...mockup,
        preview_code: sanitizado.html,
        advertencias_validacion: sanitizado.advertencias,
        estado: 'generado',
        version: 1
      };
    });

    const disenoExistente = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    const mockupsExistentes = disenoExistente?.mockups || [];

    const mockupsFinales = this._mergeMockups(mockupsExistentes, mockupsSanitizados, pantallas);

    await this.disenoRepository.guardarOActualizar(proyectoId, { mockups: mockupsFinales });

    return {
      mockups: mockupsFinales,
      proveedorUsado: resultadoIa?.proveedorUsado || null,
      advertencias: resultadoIa?.advertencias || []
    };
  }

  _construirContexto(requerimientos, diagramas, proyecto = {}) {
    const rfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RF')
      .map(r => `- [${r.identificador}] ${r.nombre} (Prioridad: ${r.prioridad || 'Media'} | Actores: ${Array.isArray(r.actores) ? r.actores.join(', ') : (r.actores || 'Usuario')}): ${r.descripcion}`)
      .join('\n');

    const rnfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RNF')
      .map(r => `- [${r.identificador}] ${r.nombre}: ${r.metrica_medible || r.descripcion}`)
      .join('\n');

    const diagClases = diagramas.find(d => d.tipo === 'clases' || d.tipo === 'clases_dominio');
    const diagCasosUso = diagramas.find(d => d.tipo === 'casos_de_uso' || d.tipo === 'casos_uso');
    const arbolNav = diagramas.find(d => d.tipo === 'arbol_navegacion' || d.tipo === 'navegacion' || d.tipo === 'wbs');
    const diagArqui = diagramas.find(d => d.tipo === 'arquitectura');

    let seccionesDiagramas = '';
    if (diagClases) {
      seccionesDiagramas += `\n\nDIAGRAMA DE CLASES DEL DOMINIO (ENTIDADES Y ATRIBUTOS TIPADOS OBLIGATORIOS PARA FORMULARIOS Y TABLAS):\n${diagClases.codigo_plantuml || diagClases.codigo_mermaid || 'No disponible'}`;
    }
    if (diagCasosUso) {
      seccionesDiagramas += `\n\nDIAGRAMA DE CASOS DE USO (ACTORES Y PROCESOS CLAVE):\n${diagCasosUso.codigo_plantuml || diagCasosUso.codigo_mermaid || 'No disponible'}`;
    }
    if (arbolNav) {
      seccionesDiagramas += `\n\nÁRBOL DE NAVEGACIÓN Y PANTALLAS (WBS):\n${arbolNav.codigo_plantuml || arbolNav.codigo_mermaid || 'No disponible'}`;
    }
    if (diagArqui) {
      seccionesDiagramas += `\n\nARQUITECTURA DEL SISTEMA:\n${diagArqui.codigo_plantuml || diagArqui.codigo_mermaid || 'No disponible'}`;
    }

    return `SISTEMA / PROYECTO: "${proyecto.nombre || 'Sistema de Información'}"
DESCRIPCIÓN DEL NEGOCIO: ${proyecto.descripcion || 'Sin descripción'}

REQUERIMIENTOS FUNCIONALES (ISO/IEC/IEEE 29148:2018):
${rfList || 'Sin requerimientos funcionales'}

REQUERIMIENTOS NO FUNCIONALES:
${rnfList || 'Sin requerimientos no funcionales'}
${seccionesDiagramas}`;
  }

  _mergeMockups(existentes, nuevos, pantallasSolicitadas) {
    const mapaExistentes = new Map(existentes.map(m => [m.nombre_pantalla, m]));
    const resultado = [];

    for (const nuevo of nuevos) {
      const existente = mapaExistentes.get(nuevo.nombre_pantalla);
      const sePidioExplicitamente = pantallasSolicitadas.includes(nuevo.nombre_pantalla);

      if (existente && existente.estado === 'editado' && !sePidioExplicitamente) {
        resultado.push(existente);
      } else {
        resultado.push({
          ...nuevo,
          version: existente ? existente.version + 1 : 1
        });
      }
      mapaExistentes.delete(nuevo.nombre_pantalla);
    }

    for (const [, existente] of mapaExistentes) {
      resultado.push(existente);
    }

    return resultado;
  }
}

module.exports = GenerarMockups;