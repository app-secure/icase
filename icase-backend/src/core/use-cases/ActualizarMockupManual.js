const MockupValidatorService = require('../../infrastructure/services/MockupValidatorService');
const MockupBindingService = require('../../infrastructure/services/MockupBindingService');

class ActualizarMockupManual {
  /** Con `requerimientoRepository` y `diagramaRepository` también valida los enlaces del HTML editado; sin ellos los deja como estaban. */
  constructor({ disenoRepository, requerimientoRepository = null, diagramaRepository = null }) {
    this.disenoRepository = disenoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.validator = new MockupValidatorService();
    this.bindingService = new MockupBindingService();
  }

  async _enlaces(proyectoId, html) {
    if (!this.requerimientoRepository?.listarPorProyecto || !this.diagramaRepository?.listarPorProyecto) return null;
    const [requerimientos, diagramas] = await Promise.all([
      this.requerimientoRepository.listarPorProyecto(proyectoId),
      this.diagramaRepository.listarPorProyecto(proyectoId)
    ]);
    const contrato = this.bindingService.contrato({ requerimientos, diagramas });
    return this.bindingService.evaluar({ html, requerimientos, contrato });
  }

  async ejecutar({ proyectoId, nombrePantalla, previewCode }) {
    const validacion = this.validator.sanitizar(previewCode);
    const calidad = this.validator.validar(validacion.html);
    if (!calidad.valido) {
      throw new Error(`El código no cumple el contrato del mockup: ${calidad.errores.join('; ')}`);
    }

    if (validacion.advertencias.length > 0) {
      console.warn('[ActualizarMockupManual] Advertencias de validación:', validacion.advertencias);
    }

    const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    if (!diseno) {
      throw new Error(`Diseño para proyecto ${proyectoId} no encontrado.`);
    }

    const mockups = diseno.mockups || [];
    const index = mockups.findIndex(m => m.nombre_pantalla === nombrePantalla);

    if (index === -1) {
      throw new Error(`Mockup "${nombrePantalla}" no encontrado en el proyecto.`);
    }

    const mockupActual = mockups[index];
    const enlazado = await this._enlaces(proyectoId, validacion.html);
    const advertencias = [...new Set([...calidad.advertencias, ...(enlazado?.advertencias || [])])];
    const mockupActualizado = {
      ...mockupActual,
      preview_code: validacion.html,
      estado: 'editado',
      version: (mockupActual.version || 0) + 1,
      ajustes_sanitizacion: [...new Set(validacion.advertencias)],
      advertencias_validacion: advertencias,
      errores_validacion: [],
      estado_calidad: calidad.estado === 'valido' && advertencias.length ? 'advertencia' : calidad.estado,
      ...(enlazado ? { enlaces: enlazado.enlaces } : {})
    };

    mockups[index] = mockupActualizado;

    await this.disenoRepository.guardarOActualizar(proyectoId, { mockups });

    return mockupActualizado;
  }
}

module.exports = ActualizarMockupManual;
