const MockupBindingValidator = require('./MockupBindingValidator');
const DomainModelExtractor = require('./DomainModelExtractor');
const ApplicationContractBuilder = require('./ApplicationContractBuilder');

/**
 * Reúne lo que el validador de enlaces necesita: el contrato de operaciones del proyecto
 * (RF aprobados y modelo de dominio aprobado) y la regla de adopción gradual.
 */
class MockupBindingService {
  constructor({ validator = new MockupBindingValidator() } = {}) {
    this.validator = validator;
  }

  /** Contrato de operaciones, o null si no se puede construir: los enlaces nunca deben romper la generación de mockups. */
  contrato({ proyecto, requerimientos, diagramas } = {}) {
    try {
      const domainModel = new DomainModelExtractor().fromDiagrams(diagramas || []);
      return new ApplicationContractBuilder().build({ proyecto, requerimientos, domainModel });
    } catch (error) {
      console.warn('[MockupBindingService] No se pudo construir el contrato de operaciones:', error.message);
      return null;
    }
  }

  /**
   * Un mockup que no declara ningún `data-accion` es anterior al contrato: se deja como está
   * en lugar de marcar como "sin enlace" cada uno de sus botones.
   */
  evaluar({ html, requerimientos = [], contrato = null } = {}) {
    const result = this.validator.validar({ html, requerimientos: requerimientos || [], contrato });
    return result.enlaces.length ? result : { enlaces: [], advertencias: [] };
  }
}

module.exports = MockupBindingService;
