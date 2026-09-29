const Estandar = require('../schemas/EstandarSchema');

const estandaresBase = [
  {
    categoria: 'ISO/IEC/IEEE 29148:2018',
    clave: 'ESTRUCTURA_RF',
    definicion: 'Especificación de Requisitos de Software bajo el estándar internacional ISO/IEC/IEEE 29148:2018 (Evolución y sustitución de IEEE 830).',
    regla_medibilidad: 'Debe contener identificador único RF-XX, nombre, declaración formal normativa con sintaxis "El sistema DEBE...", prioridad, actores, precondiciones y poscondiciones.',
    ejemplos: [
      {
        identificador: 'RF-01',
        nombre: 'Registro de Clientes',
        descripcion: 'El sistema DEBE permitir registrar nuevos clientes capturando cédula, nombres, teléfono y correo, validando la unicidad del documento.',
        prioridad: 'Alta',
        actores: ['Administrador', 'Recepcionista'],
        precondiciones: 'Usuario autenticado en el sistema.',
        poscondiciones: 'Cliente persistido en la base de datos con estado activo.'
      },
      {
        identificador: 'RF-02',
        nombre: 'Generación de Reportes de Inventario',
        descripcion: 'El sistema DEBE generar un reporte consolidado de existencias filtrado por sucursal y rango de fechas en un tiempo no mayor a 1.2 segundos.',
        prioridad: 'Media',
        actores: ['Supervisor'],
        precondiciones: 'Existencia de productos en catálogo.',
        poscondiciones: 'Reporte generado y visualizado en pantalla.'
      }
    ]
  },
  {
    categoria: 'RNF-Metricas',
    clave: 'REGLAS_MEDIBILIDAD_RNF',
    definicion: 'Estándar de Requerimientos No Funcionales cuantificables y 100% medibles, prohibiendo adjetivos subjetivos (rápido, seguro, amigable).',
    regla_medibilidad: 'Todo RNF debe incluir una métrica numérica exacta, tiempo límite en ms/s, porcentaje o unidad física verificable.',
    ejemplos: [
      {
        subcategoria: 'Rendimiento / Latencia',
        metrica_medible: 'Tiempo de respuesta al invocar endpoints de consulta inferior a 0.8 segundos (800 ms) para cargas de hasta 50 consultas concurrentes.'
      },
      {
        subcategoria: 'Usabilidad / Accesibilidad',
        metrica_medible: 'Legibilidad de interfaces a 60 cm de la pantalla utilizando tamaños de fuente no menores a 14px y ratio de contraste mínimo 4.5:1 (WCAG AA).'
      },
      {
        subcategoria: 'Alta Disponibilidad / Tolerancia a Fallos',
        metrica_medible: 'Disponibilidad del 99.9% anual; en caso de fallo del nodo primario, conmutación automática al nodo réplica en menos de 5 segundos.'
      },
      {
        subcategoria: 'Seguridad',
        metrica_medible: 'Encriptación de contraseñas con bcrypt (cost factor >= 10) y sesiones protegidas con JWT expirables en un máximo de 60 minutos.'
      },
      {
        subcategoria: 'Persistencia y Respaldo',
        metrica_medible: 'Respaldo de base de datos automatizado cada 24 horas con tiempo de recuperación de datos (RTO) inferior a 30 minutos.'
      }
    ]
  },
  {
    categoria: 'Diagramas-Permitidos',
    clave: 'ESPECIFICACION_MERMAID',
    definicion: 'Estándar para la generación de diagramas en sintaxis pura Mermaid.js sin binarios.',
    regla_medibilidad: 'Los diagramas deben ser texto plano válido para renderizar con mermaid.render(). Mínimo 4 procesos para casos de uso y reflejo obligatorio de RNF de infraestructura en arquitectura.',
    ejemplos: [
      {
        tipo: 'casos_de_uso',
        sintaxis_base: 'graph LR o usecase',
        descripcion: 'Casos de uso del sistema cubriendo al menos 4 procesos fundamentales.'
      },
      {
        tipo: 'arquitectura',
        sintaxis_base: 'graph TD',
        descripcion: 'Arquitectura del sistema y del software. Si existe RNF de alta disponibilidad, debe incluir balanceador y réplica esclava.'
      },
      {
        tipo: 'clases',
        sintaxis_base: 'classDiagram',
        descripcion: 'Modelado de clases de dominio con atributos y relaciones.'
      },
      {
        tipo: 'arbol_navegacion',
        sintaxis_base: 'graph TD',
        descripcion: 'Jerarquía de pantallas y navegación del aplicativo web.'
      }
    ]
  }
];

async function seedEstandares() {
  const count = await Estandar.countDocuments();
  if (count === 0) {
    await Estandar.insertMany(estandaresBase);
    console.log('[Seed] Colección estandares sembrada exitosamente con IEEE 830 y métricas cuantificables.');
  } else {
    console.log(`[Seed] Colección estandares ya contiene ${count} documentos.`);
  }
}

module.exports = { seedEstandares, estandaresBase };
