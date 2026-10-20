# Seguridad

I-CASE está en desarrollo y no se declara endurecido para producción. La documentación de API describe rutas sin autenticación obligatoria, URL local fija y configuración JWT que requieren revisión.

Nunca publiques .env, claves, tokens, grabaciones confidenciales o volcados de la base. Usa .env.example con marcadores. Rota de inmediato cualquier secreto expuesto.

Reporta vulnerabilidades por un canal privado acordado con el equipo/docente, indicando revisión, pasos mínimos, impacto y evidencia anonimizada. No abras una incidencia pública con credenciales ni datos de terceros. El equipo todavía no publica un plazo garantizado de respuesta ni una matriz formal de versiones soportadas.

La verificación de código generado usa Docker y debe ejecutarse en un entorno dedicado cuando haya usuarios no confiables. Una prueba CRUD correcta no certifica seguridad, autorización ni invariantes del dominio.
