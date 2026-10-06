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

Una dependencia indica que el artefacto anterior debe estar aprobado antes de generar el siguiente. La rama de flujo secuencial será responsable de hacer cumplir esta regla; este contrato no cambia todavía el flujo actual.

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
