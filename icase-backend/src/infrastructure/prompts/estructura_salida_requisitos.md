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
      "tipo": "RF o RNF",
      "identificador": "RF-01 o RNF-01",
      "nombre": "Nombre conciso",
      "descripcion": "Declaración normativa sustentada",
      "dependencias": "Ninguna o identificadores realmente relacionados",
      "prioridad": "Alta, Media o Baja",
      "actores": [],
      "precondiciones": "",
      "poscondiciones": "",
      "metrica_medible": "Solo para RNF: cifra literal del insumo o Por confirmar con el usuario",
      "origen": "explicito o inferido",
      "evidencia": "Fragmento literal del insumo",
      "fuentes_origen": [],
      "requiere_confirmacion": false
    }
  ],
  "diagramas": []
}

No agregues elementos solamente para completar el ejemplo. Si el insumo no sustenta ningún RNF, devuelve únicamente RF. Para un RNF cualitativo sin umbral, usa `Por confirmar con el usuario` sin proponer números.
