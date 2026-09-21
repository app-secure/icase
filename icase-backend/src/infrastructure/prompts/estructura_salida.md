# ESPECIFICACIÓN DE ESTRUCTURA DE SALIDA (JSON ESTRICTO)

Tu respuesta debe ser EXCLUSIVAMENTE un objeto JSON válido, sin texto introductorio, sin explicaciones ni bloques Markdown fuera del JSON.

```json
{
  "nombre_proyecto": "Nombre formal y profesional del sistema detectado (sin comillas internas)",
  "descripcion_proyecto": "Breve resumen ejecutivo del alcance del sistema",
  "resumen_ejecutivo": "Texto formal del resumen ejecutivo sobre la necesidad y solución del negocio",
  "introduccion": "Introducción formal sobre el contexto del negocio y justificación de la solución",
  "objetivos": {
    "general": "Objetivo general en infinitivo adaptado al negocio",
    "especificos": [
      "Objetivo específico 1 en infinitivo adaptado al negocio",
      "Objetivo específico 2 en infinitivo adaptado al negocio",
      "Objetivo específico 3 en infinitivo adaptado al negocio"
    ]
  },
  "alcance_sistema": "Límites operacionales y alcance funcional del sistema",
  "palabras_clave": [
    "Concepto de Negocio 1",
    "Proceso Operativo 2",
    "Término del Dominio 3",
    "Flujo Principal 4",
    "Control de Gestión 5",
    "Entidad Clave 6"
  ],
  "requerimientos": [
    {
      "tipo": "RF",
      "identificador": "RF-01",
      "nombre": "Nombre descriptivo del proceso del negocio",
      "descripcion": "Detalle técnico de la funcionalidad",
      "dependencias": "Ninguna",
      "prioridad": "Alta",
      "actores": ["Operador Principal"],
      "precondiciones": "Usuario autenticado",
      "poscondiciones": "Registro persistido"
    },
    {
      "tipo": "RNF",
      "identificador": "RNF-01",
      "nombre": "Criterio de Calidad (ej: Tiempo de Respuesta)",
      "descripcion": "Condición de calidad obligatoria",
      "metrica_medible": "Métrica cuantitativa numérica exacta (ej: latencia <= 0.8s, uptime >= 99.95%)",
      "dependencias": "Ninguna",
      "prioridad": "Alta"
    }
  ],
  "diagramas": [
    {
      "tipo": "casos_de_uso",
      "titulo": "Diagrama de Casos de Uso",
      "descripcion": "Explicación detallada de cómo va a funcionar el sistema con este diagrama: actores que ingresan, procesos que desencadenan y resultados obtenidos.",
      "descripcion_jerarquica": [
        "Límites Operativos: Delimitación de módulos que aíslan transacciones y controlan accesos.",
        "Dinámica de Actores: Roles y tareas específicas que ejecutan los usuarios.",
        "Procesamiento Transaccional: Secuencia y validación de reglas de negocio en cada caso de uso.",
        "Garantía de Integridad: Inclusiones de seguridad y trazabilidad en la ejecución."
      ],
      "codigo_plantuml": "@startuml\\nleft to right direction\\nskinparam packageStyle rectangle\\n..."
    },
    {
      "tipo": "arquitectura",
      "titulo": "Diagrama de Arquitectura Técnica Integral (C4 Container)",
      "descripcion": "Explicación detallada de cómo va a funcionar la arquitectura del sistema: flujo de peticiones desde el cliente hacia el gateway, delegación a microservicios de negocio, persistencia ACID y sincronización de eventos.",
      "descripcion_jerarquica": [
        "Canal de Entrada y Presentación: Interfaces web o móviles seleccionadas según la necesidad operativa del cliente.",
        "Seguridad y Enrutamiento: Gateway perimetral que autentica solicitudes y enruta el tráfico.",
        "Servicios del Dominio: Componentes backend seleccionados según la carga de trabajo para ejecutar las reglas de negocio.",
        "Persistencia y Datos: Almacén de datos seleccionado (relacional, documental o en memoria) para garantizar la integridad operativa."
      ],
      "codigo_plantuml": "@startuml\\n!include <C4/C4_Container>\\n..."
    },
    {
      "tipo": "clases",
      "titulo": "Diagrama de Clases del Dominio",
      "descripcion": "Explicación de cómo modela el sistema las entidades de negocio: cómo se relacionan los datos maestros, transacciones y estados del ciclo de vida.",
      "descripcion_jerarquica": [
        "Entidades Nucleares: Estructura de clases con atributos tipados para representar las operaciones del negocio.",
        "Ciclo de Vida y Estados: Métodos transaccionales que validan y actualizan los estados operativos.",
        "Relaciones y Cardinalidad: Composición y asociación directa que aseguran la consistencia relacional.",
        "Seguridad y Control: Asociación con la entidad de usuario y registro de marcas temporales."
      ],
      "codigo_plantuml": "@startuml\\nskinparam classAttributeIconSize 0\\n..."
    },
    {
      "tipo": "arbol_navegacion",
      "titulo": "Árbol de Navegación del Sistema (WBS)",
      "descripcion": "Explicación de la experiencia de usuario y flujo de navegación: cómo los operadores se desplazan desde el acceso hasta los módulos de captura, control y reportes.",
      "descripcion_jerarquica": [
        "Módulo de Autenticación: Pantallas de acceso seguro, validación de permisos y recuperación.",
        "Módulos Operativos Principales: Interfaces de captura y registro continuo del flujo de trabajo.",
        "Tableros de Control y Monitoreo: Vistas en tiempo real para supervisión de estados y alertas.",
        "Consolidación y Cierre: Módulos de emisión de comprobantes, métricas y auditoría gerencial."
      ],
      "codigo_plantuml": "@startwbs\\n* Sistema\\n** 1. Acceso\\n** 2. Operaciones\\n@endwbs"
    }
  ]
}
```
