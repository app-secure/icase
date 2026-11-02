const { CAPABILITIES } = require('../constants/GenerationCapabilities');

// Registro contractual. Una entrada pendiente no activa ni promete código.
const DEPENDENCIES = {
  tiempo_real: ['datos', 'control_acceso'],
  archivos: ['datos', 'control_acceso'],
  reportes: ['datos', 'control_acceso'],
  calculos: ['datos', 'reglas_negocio'],
  notificaciones: ['trabajos_persistentes'],
  pagos: ['integraciones', 'trabajos_persistentes', 'control_acceso'],
  ubicacion: ['datos'],
  integraciones: ['control_acceso'],
  dispositivos: ['interfaz'],
  cuentas: ['autenticacion', 'notificaciones']
};

class GenerationCapabilityService {
  catalogo() {
    return CAPABILITIES.map(({ id, etiqueta, alternativa }) => ({
      id, version: 1, etiqueta, estado: 'no_soportado', alternativa,
      dependencias: DEPENDENCIES[id] || [],
      stacks_implementados: [],
      configuracion: { type: 'object', additionalProperties: false },
      archivos_generados: [],
      pruebas_requeridas: ['unidad', 'integracion', 'interfaz']
    }));
  }

  sugerir(requirement) {
    const fields = [['nombre', requirement.nombre], ['descripción', requirement.descripcion], ['métrica', requirement.metrica_medible]];
    return CAPABILITIES.flatMap((capability) => {
      for (const [field, value] of fields) {
        const match = String(value || '').match(capability.patron);
        if (match) return [{ id: capability.id, etiqueta: capability.etiqueta,
          evidencia: `${field}: «${match[0].trim()}»`, alternativa: capability.alternativa,
          origen: 'sugerencia', requiere_confirmacion: true }];
      }
      return [];
    });
  }
}

module.exports = GenerationCapabilityService;
