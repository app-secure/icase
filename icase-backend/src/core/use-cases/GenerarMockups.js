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

  async ejecutar({ proyectoId, pantallas = [], insumoAdicional = '' }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }

    const reqRepo = this.requerimientoRepository;
    const requerimientos = typeof reqRepo.listarPorProyecto === 'function'
      ? await reqRepo.listarPorProyecto(proyectoId)
      : typeof reqRepo.obtenerPorProyecto === 'function'
        ? await reqRepo.obtenerPorProyecto(proyectoId)
        : [];

    const diagRepo = this.diagramaRepository;
    const diagramas = typeof diagRepo.listarPorProyecto === 'function'
      ? await diagRepo.listarPorProyecto(proyectoId)
      : typeof diagRepo.obtenerPorProyecto === 'function'
        ? await diagRepo.obtenerPorProyecto(proyectoId)
        : [];

    const contextoProyecto = this._construirContexto(requerimientos, diagramas);

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

  _construirContexto(requerimientos, diagramas) {
    const rfAltas = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RF' && (r.prioridad || '').toLowerCase() === 'alta')
      .map(r => `- [${r.identificador}] ${r.nombre} (${r.prioridad}): ${r.descripcion}`)
      .join('\n');

    const rfOtras = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RF' && (r.prioridad || '').toLowerCase() !== 'alta')
      .map(r => `- [${r.identificador}] ${r.nombre} (${r.prioridad}): ${r.descripcion}`)
      .join('\n');

    const arbolNav = diagramas.find(d => d.tipo === 'arbol_navegacion' || d.tipo === 'navegacion' || d.tipo === 'wbs');
    let navegacionTexto = '';
    if (arbolNav) {
      navegacionTexto = `\nÁRBOL DE NAVEGACIÓN (nivel 3):\n${arbolNav.codigo_plantuml || arbolNav.codigo_mermaid || 'No disponible'}`;
    }

    return `REQUERIMIENTOS FUNCIONALES PRIORIDAD ALTA:\n${rfAltas || 'Ninguno'}\n\nREQUERIMIENTOS FUNCIONALES OTROS:\n${rfOtras || 'Ninguno'}${navegacionTexto}`;
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