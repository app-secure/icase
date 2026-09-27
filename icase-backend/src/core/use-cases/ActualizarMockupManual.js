const MockupValidatorService = require('../../infrastructure/services/MockupValidatorService');

class ActualizarMockupManual {
  constructor({ disenoRepository }) {
    this.disenoRepository = disenoRepository;
    this.validator = new MockupValidatorService();
  }

  async ejecutar({ proyectoId, nombrePantalla, previewCode }) {
    const validacion = this.validator.sanitizar(previewCode);
    if (!this.validator.listo(validacion.html)) {
      throw new Error('El código HTML no es un documento completo válido (falta <!DOCTYPE html> o </html>)');
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
    const mockupActualizado = {
      ...mockupActual,
      preview_code: validacion.html,
      estado: 'editado',
      version: (mockupActual.version || 0) + 1,
      advertencias_validacion: validacion.advertencias
    };

    mockups[index] = mockupActualizado;

    await this.disenoRepository.guardarOActualizar(proyectoId, { mockups });

    return mockupActualizado;
  }
}

module.exports = ActualizarMockupManual;