class PlantUMLValidatorService {
  validar(codigo) {
    if (!codigo || typeof codigo !== 'string' || codigo.trim() === '') {
      return { valido: false, error: 'El código PlantUML está vacío.' };
    }

    const trimmed = codigo.trim();

    if (!trimmed.startsWith('@start')) {
      return {
        valido: false,
        error: 'El diagrama debe comenzar con @startuml o @startwbs'
      };
    }

    if (!trimmed.includes('@end')) {
      return {
        valido: false,
        error: 'El diagrama debe finalizar con @enduml o @endwbs'
      };
    }

    return { valido: true, error: null };
  }
}

module.exports = PlantUMLValidatorService;
