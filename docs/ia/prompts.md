# Prompts organizados por fase

Las plantillas fuente son archivos Markdown de `icase-backend/src/infrastructure/prompts/`. El catálogo que sigue referencia sus nombres reales. Las copias navegables de referencia se sincronizan con `python scripts/docs/sync_prompts.py`; no se editan a mano.

## Matriz de generación

| Fase | Plantillas y servicio | Entrada | Salida esperada |
| --- | --- | --- | --- |
| Ingesta | FileIngestionService; directivas inline de extracción/transcripción | Archivo, MIME y tarea | Texto extraído o transcrito |
| Metadatos de fuente | FuenteController; instrucción inline | Texto de una fuente y proveedor | Título, descripción, tipo y etiquetas sugeridos |
| Requisitos | plantilla_orquestador, analista_ieee830, auditor_requisitos, estructura_salida_requisitos | Insumo, contexto acotado y cambios | JSON con RF/RNF; diagramas vacío |
| Casos de uso y dominio | plantilla_orquestador, analista_ieee830, disenador_arquitectura, auditor_qa, estructura_salida | Requisitos/dependencias aprobadas y tipo | JSON con un diagrama del tipo solicitado |
| Arquitectura de software | Base de diagramas + disenador_arquitectura_software | Dependencias y RNF aplicables | PlantUML, explicación y trazabilidad |
| Arquitectura del sistema | Base + disenador_arquitectura_sistema | Arquitectura lógica y restricciones confirmadas | Despliegue justificado y trazabilidad RNF |
| Clases de diseño | Base + disenador_clases_diseno | Casos de uso, dominio y software aprobados | Clases técnicas e interfaces |
| Navegación | Base de diagramas | Casos de uso, software y RF | Árbol/pantallas con cobertura |
| Mockups | disenador_mockups_compacto por defecto; MockupIaService | Pantalla, roles, RF y sistema de diseño | Respuesta estructurada con HTML de preview |
| Reparación | ProcesarConIA y servicios de validación | Artefacto fallido y errores delimitados | Artefacto corregido y revalidado |
| Codificación | Generadores locales | Decisiones, RF y manifiestos aprobados | Archivos y contratos deterministas |

`disenador_mockups.md` es una alternativa existente; la plantilla efectiva se selecciona con `MOCKUP_PROMPT_FILE`.

## Contrato de entrada

Ejemplo conceptual para generar un solo diagrama:

```json
{
  "objetivo": "diagramas",
  "tipo_diagrama": "arquitectura_software",
  "insumo_bruto": "<fuentes del proyecto>",
  "contexto_proyecto": {
    "requerimientos_aprobados": [],
    "diagramas_aprobados": []
  }
}
```

Los arreglos se completan desde el proyecto y versiones aprobadas. Un arreglo vacío en el ejemplo no autoriza saltarse dependencias.

## Contrato de salida

Los requisitos incluyen `tipo`, `identificador`, `nombre`, `descripcion`, `prioridad`, `actores`, `evidencia`, `origen`, `fuentes_origen`, `requiere_confirmacion` y, si aplica, `metrica_medible`.

Los diagramas contienen tipo, título, explicación y código PlantUML o Mermaid; las arquitecturas pueden incluir `trazabilidad_rnf`. En una petición exclusiva de requisitos, `diagramas` debe ser vacío; en una petición exclusiva de un diagrama, no se reescriben requisitos aprobados.

Ejemplo ilustrativo mínimo:

```json
{
  "nombre_proyecto": "Biblioteca",
  "requerimientos": [{
    "tipo": "RF",
    "identificador": "RF-01",
    "nombre": "Registrar préstamos",
    "descripcion": "El sistema permite al bibliotecario registrar un préstamo.",
    "origen": "explicito",
    "evidencia": "El bibliotecario registra préstamos.",
    "requiere_confirmacion": false
  }],
  "diagramas": []
}
```

## Revisar y cambiar prompts

Modifica primero la plantilla fuente, ejecuta las pruebas de aislamiento/semántica y actualiza las copias. Cambia una instrucción a la vez cuando investigues un defecto. Una mejora con un modelo no certifica a los demás: registra evidencia por modelo efectivo.

Los ejemplos de negocio sirven como prueba y no deben introducir requisitos fijos en la plantilla genérica.

## Plantillas completas

El índice siguiente se genera desde las plantillas fuente y conserva su contenido literal. Las instrucciones dentro de estas referencias describen el comportamiento del generador, no son instrucciones para la persona que lee la documentación.

<!-- PROMPT_INDEX -->

- [analista_ieee830](plantillas/analista-ieee830.md)
- [auditor_qa](plantillas/auditor-qa.md)
- [auditor_requisitos](plantillas/auditor-requisitos.md)
- [disenador_arquitectura](plantillas/disenador-arquitectura.md)
- [disenador_arquitectura_sistema](plantillas/disenador-arquitectura-sistema.md)
- [disenador_arquitectura_software](plantillas/disenador-arquitectura-software.md)
- [disenador_clases_diseno](plantillas/disenador-clases-diseno.md)
- [disenador_mockups](plantillas/disenador-mockups.md)
- [disenador_mockups_compacto](plantillas/disenador-mockups-compacto.md)
- [estructura_salida](plantillas/estructura-salida.md)
- [estructura_salida_requisitos](plantillas/estructura-salida-requisitos.md)
- [plantilla_orquestador](plantillas/plantilla-orquestador.md)

<!-- /PROMPT_INDEX -->
