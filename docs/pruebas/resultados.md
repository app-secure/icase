# Resultados, evidencias y hallazgos

## Cómo interpretar este registro

Los resultados históricos siguientes proceden de verificaciones reportadas durante el desarrollo. No constituyen una ejecución nueva de IA sobre todas las pantallas ni una medición de producción. Una verificación nueva debe registrar revisión Git y salida completa.

| Ejecución histórica | Resultado observado | Alcance y límite |
| --- | --- | --- |
| Suite Jest de backend, 19/10/2026 | 155 pruebas correctas, una omitida | Regresión del estado de código de esa ejecución |
| Build de I-CASE frontend, 19/10/2026 | Correcto; advertencia de chunks grandes | Compilación, no certificación de usabilidad |
| NestJS/PostgreSQL genérico | Arranque y CRUD correctos | Caso sintético de biblioteca |
| Express/MongoDB genérico | Arranque y CRUD correctos | Prueba de humo del backend |
| React/Expo genéricos | Build web y bundle Android correctos | No prueba en dispositivo ni APK firmado |
| Integral biblioteca con Docker | Servicios saludables; trazabilidad e integración correctas; tres pruebas Playwright correctas | Contrato CRUD y navegación de dos pantallas |

No se conservaron en esta carpeta los logs originales de esas ejecuciones; no presentar esta tabla como un informe firmado ni asociarla a un commit inexistente. La validación actual del portal se registra en [Evidencias de documentación](evidencias-documentacion.md).

## Evidencias pendientes

Se incluye la captura real de acceso en el manual. No acredita el flujo autenticado ni una generación IA completa.

- Capturas del caso de estudio por una persona usando la interfaz.
- Prueba de carga sobre una funcionalidad de I-CASE.
- Comparativa de artefactos iniciales con modelos reales y prompt versionado.
- Fidelidad del PDF respecto al panel en varios tamaños y navegadores.
- Validación de reglas específicas del negocio y autorización multiusuario.

Estas tareas no se consideran realizadas por existir un plan o un generador de pruebas.

## Hallazgos actuales

| ID | Severidad | Hallazgo y causa | Evidencia de código | Recomendación |
| --- | --- | --- | --- | --- |
| H01 | Alta | Autenticación no obligatoria en varios routers | proyectoRoutes, fuenteRoutes, requerimientoRoutes, diagramaRoutes, mockupRoutes | Proteger rutas y comprobar propiedad del recurso |
| H02 | Alta | Secreto JWT de respaldo si falta configuración | authMiddleware | Exigir secreto al desplegar |
| H03 | Alta | CRUD genérico no implementa invariantes de RF | GenericBackendGenerator | Modelos, reglas y pruebas semánticas antes de producción |
| H04 | Media | URL local de API fija | frontend/src/services/api.js | Configuración por entorno |
| H05 | Media | Verificación prolongada dentro de petición | GestionarArtefactosCodigo | Trabajo persistente con progreso y recuperación |
| H06 | Media | Evidencias de carga y UI no completadas en esta entrega | Este registro | Ejecutar y adjuntar resultados reproducibles |
| H07 | Baja | Bundle de frontend con chunks grandes | Build histórico | Revisar división de carga y medir impacto real |

La severidad es una evaluación documental y debe confirmarse por el equipo al gestionar las incidencias.

## Plantilla de ejecución

```text
ID de caso:
Fecha:
Responsable:
Commit:
Entorno (Node, navegador, MongoDB, Docker):
Proveedor/modelo efectivo y revisión del prompt, si aplica:
Datos utilizados (anonimizados):
Comando o pasos:
Resultado esperado:
Resultado obtenido:
Estado: correcto / fallido / no ejecutado
Duración y métricas:
Evidencia:
Hallazgos y seguimiento:
```
