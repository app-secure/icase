# CONTRATO DE SALIDA PARA MODELADO (JSON ESTRICTO)

Responde EXCLUSIVAMENTE con un objeto JSON válido. No incluyas Markdown, comentarios ni texto fuera del JSON.

## Reglas de aislamiento y evidencia

- Usa únicamente los requisitos aprobados y los artefactos aprobados incluidos en el contexto de esta ejecución.
- El arreglo `requerimientos` DEBE ser `[]`: durante el modelado no se crean ni reescriben requisitos.
- No agregues tecnologías, protocolos, actores, entidades, pantallas, atributos de calidad o infraestructura que no estén sustentados por el contexto.
- Si una decisión necesaria no fue tomada, escribe `Tecnología por definir` o `Decisión pendiente`; no selecciones un producto a modo de ejemplo.
- No copies los nombres descriptivos de este contrato en el contenido final. Sustituye cada marcador por información real del proyecto.
- Devuelve únicamente el tipo solicitado. Si la ejecución solicita todos los diagramas, devuelve exactamente los seis tipos canónicos.

## Tipos canónicos

1. `casos_de_uso`
2. `clases_dominio`
3. `arquitectura_software`
4. `arquitectura_sistema`
5. `clases_diseno`
6. `arbol_navegacion`

No uses los alias legados `clases` ni `arquitectura`.

## Estructura

```json
{
  "nombre_proyecto": "<nombre existente del proyecto>",
  "descripcion_proyecto": "<resumen sustentado por el contexto>",
  "resumen_ejecutivo": "<resumen sustentado por el contexto>",
  "introduccion": "<contexto y propósito sin atributos inventados>",
  "objetivos": {
    "general": "<objetivo derivado del alcance aprobado>",
    "especificos": ["<objetivo verificable derivado del alcance>"]
  },
  "alcance_sistema": "<límites derivados de requisitos aprobados>",
  "palabras_clave": ["<término real del dominio>"],
  "requerimientos": [],
  "diagramas": [
    {
      "tipo": "<uno de los seis tipos canónicos>",
      "titulo": "<título específico del artefacto>",
      "descripcion": "<explicación concreta y sustentada>",
      "descripcion_jerarquica": [
        "<aspecto 1>: <explicación>",
        "<aspecto 2>: <explicación>",
        "<aspecto 3>: <explicación>",
        "<aspecto 4>: <explicación>"
      ],
      "requisitos_relacionados": ["<RF o RNF aprobado representado>"],
      "trazabilidad_rnf": [
        {
          "rnf_id": "<RNF aprobado aplicable>",
          "elemento_id": "<alias PlantUML exacto del elemento>",
          "elemento": "<elemento del diagrama que lo realiza>",
          "justificacion": "<cómo lo realiza sin inventar productos ni métricas>"
        }
      ],
      "codigo_plantuml": "<código PlantUML completo y compilable>"
    }
  ]
}
```

## Reglas por tipo

- `casos_de_uso`: actores y casos provienen de RF aprobados. `trazabilidad_rnf` debe ser `[]`.
- `clases_dominio`: contiene solo conceptos, atributos, reglas y relaciones del negocio. No incluye Controller, DTO, Repository, framework ni infraestructura. `trazabilidad_rnf` debe ser `[]`.
- `arquitectura_software`: representa aplicaciones, contenedores y responsabilidades lógicas. Mapea únicamente RNF aplicables mediante `trazabilidad_rnf`.
- `arquitectura_sistema`: realiza los contenedores aprobados de `arquitectura_software` mediante nodos de despliegue. Redundancia, réplica, balanceo, failover y monitoreo solo aparecen si un requisito o una decisión aprobada los exige.
- `clases_diseno`: deriva de casos de uso, clases de dominio y arquitectura de software aprobados. Distingue controladores, casos de uso, DTO, interfaces e implementaciones de repositorio sin introducir funcionalidades nuevas. `trazabilidad_rnf` debe ser `[]`.
- `arbol_navegacion`: contiene únicamente pantallas y rutas derivadas de RF/casos de uso. No representa procesos internos, entidades ni componentes técnicos. `trazabilidad_rnf` debe ser `[]`.

Si no existe un RNF aplicable al diagrama de arquitectura solicitado, `trazabilidad_rnf` DEBE ser `[]`; no crees un RNF para justificar un componente.
