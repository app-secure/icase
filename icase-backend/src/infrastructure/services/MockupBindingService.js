const { systemManaged } = require('./MockupFieldPolicy');
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
  contrato({ proyecto, requerimientos, diagramas, spec = null } = {}) {
    try {
      const domainModel = new DomainModelExtractor().fromDiagrams(diagramas || []);
      return new ApplicationContractBuilder().build({ proyecto, requerimientos, domainModel, spec });
    } catch (error) {
      console.warn('[MockupBindingService] No se pudo construir el contrato de operaciones:', error.message);
      return null;
    }
  }

  /** Líneas `- [RF-xx] campos: ...` que se entregan al modelo para que use nombres de campo reales en `name`. */
  describirOperaciones({ requerimientos = [], contrato = null, max = 20 } = {}) {
    if (!contrato) return '';
    const operations = new Map((contrato.operations || []).map((operation) => [String(operation.id).toUpperCase(), operation]));
    return (requerimientos || [])
      .filter((item) => String(item.tipo || '').toUpperCase() === 'RF' && item.identificador && item.aprobado !== false)
      .slice(0, max)
      .map((item) => {
        const operation = operations.get(String(item.identificador).toUpperCase());
        if (operation?.identity === 'login') return `- [${item.identificador}] autenticación: no la enlaces; los controles de acceso llevan data-accion="ui" (la aplicación genera el acceso real)`;
        const properties = operation?.schema?.properties || {};
        const todos = Object.entries(properties).filter(([, definition]) => !definition?.readOnly);
        // Lo que completa el sistema (sesión, estado inicial, totales, fechas de registro, códigos generados) no se pide en el formulario.
        const captura = todos.filter(([name, definition]) => !systemManaged(name, definition)).map(([name]) => name);
        const sistema = todos.filter(([name, definition]) => systemManaged(name, definition)).map(([name]) => name);
        if (!todos.length) return `- [${item.identificador}] campos: sin campos definidos (usa nombres claros en camelCase)`;
        return `- [${item.identificador}] campos que captura la persona: ${captura.length ? captura.join(', ') : 'ninguno'}`
          + (sistema.length ? `; los completa el sistema, NO los pongas en la pantalla (ni como campo ni como oculto): ${sistema.join(', ')}` : '');
      })
      .join('\n');
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
