# ESPECIFICACIÓN DE ESTRUCTURA DE SALIDA (JSON ESTRICTO)

Tu respuesta debe ser EXCLUSIVAMENTE un objeto JSON válido, sin texto introductorio, sin explicaciones ni bloques Markdown fuera del JSON.

```json
{
  "nombre_proyecto": "Nombre propio o comercial del producto SIN anteponer 'Sistema de' ni 'Sistema para' (ej: 'SmartMix - Gestión de Concreto Premezclado', 'SmartMix', 'FarmaVida')",
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
      "nombre": "Nombre conciso del proceso (ej: Registro y Apertura de Mesas)",
      "descripcion": "Declaración normativa estricta ISO/IEC/IEEE 29148:2018: 'El sistema DEBE permitir al mesero seleccionar una mesa libre y asignarla registrando el número de comensales en menos de 1.0s.'",
      "dependencias": "Ninguna",
      "prioridad": "Alta",
      "actores": ["Mesero", "Administrador"],
      "precondiciones": "Usuario autenticado y mesa con estado Disponible",
      "poscondiciones": "Mesa registrada con estado Ocupada y comanda inicial creada en base de datos"
    },
    {
      "tipo": "RNF",
      "identificador": "RNF-01",
      "nombre": "Rendimiento y Tiempo de Respuesta",
      "descripcion": "El sistema DEBE procesar las transacciones y consultas de datos garantizando una latencia inferior a los umbrales máximos establecidos.",
      "metrica_medible": "Tiempo de respuesta <= 0.8s en el 98% de transacciones concurrentes bajo carga de 100 usuarios activos",
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
      "titulo": "Árbol de Navegación del Sistema",
      "descripcion": "Mapa de la experiencia de navegación del usuario: recorrido desde el portal de acceso y el panel principal hasta las vistas de listado, detalle y formularios de cada módulo de la aplicación.",
      "descripcion_jerarquica": [
        "Acceso: Pantallas de inicio de sesión y recuperación de contraseña que dan entrada al sistema.",
        "Panel Principal: Pantalla raíz que concentra el acceso rápido a los módulos de navegación de primer nivel.",
        "Módulos: Agrupaciones de navegación que corresponderán a cada requerimiento funcional de prioridad Alta.",
        "Vistas: Pantallas de listado, detalle y formularios de registro dentro de cada módulo, alcanzables desde el panel principal."
      ],
      "codigo_plantuml": "@startwbs\\n* SmartMix\\n** Portal de Acceso\\n*** Inicio de Sesión\\n*** Recuperación de Contraseña\\n** Panel Principal\\n*** Tablero de Operación (vista general)\\n*** Alertas y Notificaciones\\n** Módulo de Pedidos\\n*** Listado de Pedidos\\n*** Detalle de Pedido\\n*** Formulario de Nuevo Pedido\\n** Módulo de Despacho\\n*** Listado de Despachos\\n*** Programación de Entrega\\n** Módulo de Calidad\\n*** Listado de Pruebas\\n*** Registro de Muestra\\n** Administración\\n*** Gestión de Usuarios\\n*** Gestión de Roles y Permisos\\n*** Configuración del Sistema\\n@endwbs"
    }
  ]
}
```
