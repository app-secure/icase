# Contrato de generación de diagramas

Este documento define el vocabulario y las dependencias que deben respetar las ramas de arquitectura, clases de diseño y flujo secuencial.

## Tipos oficiales

| Tipo | Propósito |
| --- | --- |
| `casos_de_uso` | Actores e interacciones derivadas de los requisitos funcionales. |
| `clases_dominio` | Entidades, objetos de valor y relaciones propias del negocio. |
| `arquitectura_software` | Aplicaciones, contenedores, componentes, capas y comunicaciones del software. |
| `arquitectura_sistema` | Infraestructura, nodos, redes, despliegue, redundancia y mecanismos asociados a RNF. |
| `clases_diseno` | Controladores, casos de uso, servicios, interfaces, repositorios, DTO y adaptadores. |
| `arbol_navegacion` | Plataformas, módulos, pantallas y rutas disponibles para cada actor. |

Los tipos `er`, `secuencia` y `actividad` continúan aceptándose como diagramas auxiliares, pero no forman parte del flujo obligatorio acordado.

## Compatibilidad temporal

- `clases` se interpreta como `clases_dominio`.
- `arquitectura` se interpreta como `arquitectura_software`.
- Los registros existentes conservan su valor original hasta ejecutar una migración específica.
- Las funcionalidades nuevas deben escribir exclusivamente los tipos oficiales.

## Dependencias

```text
casos_de_uso
└── clases_dominio
    └── arquitectura_software
        ├── arquitectura_sistema
        ├── clases_diseno
        └── arbol_navegacion
```

Una dependencia indica que el artefacto anterior debe estar aprobado antes de generar el siguiente. El backend y la interfaz hacen cumplir esta regla tanto al generar como al aprobar cada artefacto.

## Estados y versiones

Cada diagrama obligatorio utiliza uno de estos estados:

- `bloqueado`: faltan requisitos o diagramas previos aprobados.
- `disponible`: puede generarse.
- `pendiente_revision`: existe una versión que requiere revisión manual.
- `aprobado`: la versión vigente fue aprobada manualmente.
- `rechazado`: el usuario solicitó cambios y dejó observaciones para la siguiente versión.
- `desactualizado`: cambió alguna dependencia y debe regenerarse.
- `generando` y `error`: estados operativos de una ejecución.

`versiones_origen` registra la versión exacta de cada dependencia utilizada para generar el diagrama. El flujo compara esas versiones con las vigentes y marca automáticamente el artefacto como `desactualizado` cuando existe una diferencia, incluso si el registro no fue invalidado explícitamente.

La aprobación registra `aprobado_en` y `aprobado_por`. Editar o regenerar un diagrama elimina su aprobación e invalida transitivamente los artefactos dependientes.

## Control de calidad previo a aprobación

Cada tipo se valida con reglas propias antes de persistir una generación y nuevamente antes de aprobarla:

- Casos de uso: actores, límite del sistema, casos y relaciones legibles.
- Clases de dominio: entidades y relaciones del modelo de negocio.
- Arquitectura de software: vista C4 de contenedores, límites y comunicaciones.
- Arquitectura del sistema: nodos de infraestructura, despliegue y conexiones; no se obliga a usar C4.
- Clases de diseño: clases e interfaces técnicas, relaciones y recomendación de paquetes o capas.
- Árbol de navegación: sintaxis WBS o mindmap, módulos, pantallas y profundidad jerárquica.

El resultado queda persistido en `estado_calidad`, `errores_validacion`, `advertencias_validacion`, `metricas_validacion` y `validado_en`. Un error bloquea la aprobación; una advertencia permite aprobar después de la revisión manual.

## Decisiones de revisión

Una versión pendiente puede aprobarse o rechazarse. Rechazar exige una observación concreta y no habilita los artefactos dependientes. Cada decisión se agrega a `revisiones` con usuario, fecha, versión y comentario. Al regenerar un diagrama rechazado, la última observación se incorpora automáticamente al contexto de la IA para corregirla sin reenviar todos los artefactos ni repetir instrucciones manualmente.

## Formato de intercambio

Todo generador nuevo debe devolver como mínimo:

```json
{
  "tipo": "clases_diseno",
  "titulo": "Diagrama de Clases de Diseño",
  "descripcion": "Clases organizadas por capas y sus dependencias.",
  "codigo_plantuml": "@startuml\n...\n@enduml",
  "requisitos_relacionados": ["RF-01", "RNF-02"],
  "versiones_origen": {
    "casos_de_uso": 2,
    "clases_dominio": 1,
    "arquitectura_software": 1
  }
}
```

## Responsabilidades de las ramas

- Los generadores no deben modificar estados del proyecto ni aprobar diagramas.
- El orquestador no debe conocer detalles internos de los prompts.
- Los validadores deben operar sobre un solo tipo de diagrama.
- Cada rama debe probarse con fixtures de sus dependencias para no requerir implementaciones externas.
- La integración posterior registrará los generadores mediante el tipo oficial correspondiente.
