# ESTRUCTURA DE SALIDA EXCLUSIVA PARA REQUISITOS

Responde exclusivamente con un objeto JSON válido. No incluyas Markdown ni texto fuera del JSON.

La forma requerida es:

{
  "nombre_proyecto": "Nombre comercial sustentado por el dominio descrito",
  "descripcion_proyecto": "Resumen del alcance solicitado",
  "resumen_ejecutivo": "Síntesis basada únicamente en el insumo",
  "introduccion": "Contexto y justificación presentes en el insumo",
  "objetivos": {
    "general": "Objetivo general",
    "especificos": ["Objetivo específico"]
  },
  "alcance_sistema": "Límites derivados del insumo",
  "palabras_clave": ["Concepto del dominio"],
  "requerimientos": [
    {
      "tipo": "RF",
      "identificador": "RF-01",
      "nombre": "Nombre conciso",
      "descripcion": "Declaración normativa sustentada",
      "dependencias": "Ninguna o identificadores realmente relacionados",
      "prioridad": "Media",
      "actores": [],
      "precondiciones": "",
      "poscondiciones": "",
      "metrica_medible": "Solo para RNF: cifra literal del insumo o Por confirmar con el usuario",
      "origen": "explicito",
      "evidencia": "Fragmento literal del insumo",
      "fuentes_origen": [],
      "necesidades_origen": ["N-01"],
      "criterios_aceptacion": [{ "descripcion": "Resultado observable sustentado por el insumo", "necesidades_origen": ["N-01"] }],
      "reglas_relacionadas": [],
      "requiere_confirmacion": false,
      "estado_decision": "confirmado",
      "restricciones_excluidas": []
    }
  ],
  "auditoria_requisitos": { "decisiones": [], "preguntas_pendientes": [] },
  "diagramas": []
}

No agregues elementos solamente para completar el ejemplo. Si el insumo no sustenta ningún RNF, devuelve únicamente RF. Para un RNF cualitativo sin umbral, usa `Por confirmar con el usuario` sin proponer números.

El ejemplo ilustra la forma, no valores obligatorios. tipo admite RF o RNF; origen admite explicito o inferido; prioridad admite Alta, Media o Baja; estado_decision admite confirmado, pendiente, rechazado o fuera_de_alcance. Escoge un único valor válido en cada campo, nunca una cadena con todas las alternativas.

Varias necesidades del mismo objetivo pueden corresponder a un requisito; sus detalles se preservan como criterios de aceptación. No generes un requisito por frase ni cantidades prefijadas. Las restricciones técnicas, plataformas, reglas, contexto, exclusiones y preguntas se conservan en el análisis separado; no se fuerzan como RF/RNF. Un detalle pendiente no invalida el origen explícito de una necesidad confirmada.
