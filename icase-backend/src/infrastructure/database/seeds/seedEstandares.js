const Estandar = require('../schemas/EstandarSchema');

// Solo estas claves pertenecen al sistema; se conservan los estándares personalizados.
const estandaresBase = [
  {
    categoria: 'ISO/IEC/IEEE 29148:2018',
    clave: 'ESTRUCTURA_RF',
    definicion: 'Requisitos funcionales estructurados y trazables, orientados a ISO/IEC/IEEE 29148:2018.',
    regla_medibilidad: 'Cada RF debe expresar un objetivo verificable con identificador, nombre, declaración El sistema DEBE, prioridad, actores, precondiciones, poscondiciones y evidencia literal del insumo. No agregar capacidades ni cifras ausentes.',
    ejemplos: []
  },
  {
    categoria: 'RNF-Metricas',
    clave: 'REGLAS_MEDIBILIDAD_RNF',
    definicion: 'Cualidades y restricciones sustentadas en el insumo; las categorías de calidad no son requisitos obligatorios.',
    regla_medibilidad: 'Conservar las métricas proporcionadas. Si la cualidad fue solicitada sin umbral, usar Por confirmar con el usuario y requiere_confirmacion: true. No inventar tecnologías, disponibilidad, porcentajes, tiempos ni completar categorías ausentes.',
    ejemplos: []
  },
  {
    categoria: 'Diagramas-Permitidos',
    // Clave histórica para actualizar bases existentes sin duplicar registros.
    clave: 'ESPECIFICACION_MERMAID',
    definicion: 'Diagramas en PlantUML: casos_de_uso, clases_dominio, arquitectura_software, arquitectura_sistema, clases_diseno y arbol_navegacion.',
    regla_medibilidad: 'Generar solo el tipo solicitado desde requisitos y dependencias aprobadas. Usar PlantUML válido, con @startuml o @startwbs y su cierre correspondiente. No imponer mínimos arbitrarios ni infraestructura ausente de los requisitos.',
    ejemplos: []
  }
];

async function seedEstandares() {
  // Actualización idempotente de reglas del sistema, no de artefactos de proyectos.
  await Estandar.bulkWrite(estandaresBase.map((estandar) => ({
    updateOne: {
      filter: { clave: estandar.clave },
      update: { $set: estandar },
      upsert: true
    }
  })));
  console.log('[Seed] Estándares sincronizados: ISO/IEC/IEEE 29148:2018, trazabilidad y PlantUML.');
}

module.exports = { seedEstandares, estandaresBase };
