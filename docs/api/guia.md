# API de I-CASE

## Acceso al contrato

- [Contrato OpenAPI](openapi.yaml).
- [Explorador Swagger UI](explorador.html).

La base de desarrollo es `http://localhost:5000`, sin prefijo `/api`. Las rutas CRUD del código **generado** bajo `/api/operations/` pertenecen a otra aplicación.

El explorador requiere JavaScript e Internet para cargar Swagger UI desde el CDN indicado en su HTML. El contrato es local y versionado. No inicia el backend: para enviar peticiones debe estar en ejecución y ser accesible desde el navegador. La especificación cubre las rutas registradas en Express, incluidos endpoints sin protección obligatoria.

## Autenticación real

`POST /auth/registro` recibe nombre, apellido, correo, celular y password. `POST /auth/login` recibe correo y password, y devuelve `token` y `usuario`. Los tokens actuales expiran a los siete días. Envía:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

`GET /auth/perfil` y todas las rutas de codificación requieren JWT. Las rutas generales de proyectos usan autenticación **opcional**; fuentes, requisitos, diagramas y mockups no tienen middleware obligatorio en los routers revisados. Esto no acredita aislamiento de autorización entre usuarios. Es una limitación que debe corregirse antes de exponer datos privados en producción.

Ejemplo de inicio de sesión, con datos ficticios:

```http
POST /auth/login
Content-Type: application/json

{"correo":"analista@example.test","password":"ejemplo-seguro"}
```

Respuesta ilustrativa:

```json
{"success":true,"message":"Sesión iniciada con éxito","usuario":{"id":"507f1f77bcf86cd799439011","nombre":"Ana","correo":"analista@example.test"},"token":"<jwt>"}
```

## Operaciones y formatos

| Grupo | Contenido |
| --- | --- |
| /proyectos | CRUD, análisis, aprobación, flujo, trabajos de diagramas y documento |
| /requerimientos | Creación manual, edición y sincronización |
| /diagramas | Edición, historial, restauración y validación |
| /proyectos/{proyectoId}/fuentes, /fuentes | Carga, extracción, metadatos y eliminación |
| /mockups | Catálogo, generación, trabajos, edición y sistema de diseño |
| /proyectos/{id}/codificacion | Plan, decisiones, artefactos, revisión y descarga |

JSON es el formato predominante. La carga de fuente usa `multipart/form-data` con campo `archivo` (máximo 50 MB). Diagramas incluyen `codigo_plantuml` o `codigo_mermaid`; mockups contienen HTML de vista previa. Markdown se descarga como texto y el paquete como `application/zip`. El PDF se construye en el frontend.

Ejemplo de análisis:

```json
{"objetivo":"requisitos","provider":"auto","insumo_adicional":""}
```

Se envía a `POST /proyectos/{id}/procesar-ia`. No llames a esta operación para consultar requisitos existentes: consulta el proyecto.

## Trabajos asíncronos

`POST /proyectos/{id}/trabajos-diagramas` recibe `tipo_diagrama`, proveedor y cambios opcionales. Devuelve 202 cuando crea un trabajo y 200 cuando reutiliza uno. Consulta `/proyectos/trabajos-diagramas/{trabajoId}`.

Para mockups usa `POST /mockups/proyecto/{proyectoId}/trabajos` y consulta `GET /mockups/trabajos/{trabajoId}`.

Estados: `encolado`, `procesando`, `completado`, `fallido`. Examina progreso, mensaje y error; al completarse puede incorporarse `resultado`. Consulta el último trabajo para recuperar la vista. Se recomienda polling moderado y detenerlo al llegar a un estado terminal. No existe una ruta de cancelación publicada.

## Integraciones externas y límites

| Servicio | Uso | Configuración |
| --- | --- | --- |
| Gemini | Análisis, multimodal y mockups | GEMINI_API_KEY y catálogos por tarea |
| DeepSeek | Análisis | DEEPSEEK_API_KEY, DEEPSEEK_MODEL |
| Groq | Análisis, transcripción y mockups | GROQ_API_KEY, modelos y presupuesto |
| OpenRouter | Alternativa de análisis/mockups | OPENROUTER_API_KEY y listas |
| OpenAI | Adaptador de análisis | OPENAI_API_KEY y configuración leída por el servicio |
| Renderizado PlantUML | Imagen del código | Revisar URL usada por componentes de diagrama |
| Docker | Verificación del código generado | CLI, motor y Compose accesibles al backend |

Las claves solo deben configurarse en el servidor; no se publican ejemplos con claves reales. Un proveedor configurado no garantiza cuota ni acceso al identificador de modelo. Los timeouts varían por adaptador: análisis usa límites del orden de 25–90 segundos por llamada; ingesta 45–60 y mockups 90. El flujo completo puede superar esos tiempos al efectuar llamadas y reparación. Los presupuestos de Groq se configuran en el entorno. La aplicación no publica un SLA ni un límite universal de solicitudes por usuario.

## Errores

El formato habitual es `{"error":"Descripción"}`. Actualmente los controladores no normalizan todos los códigos de forma uniforme:

| Código | Situación |
| --- | --- |
| 400 | Entrada inválida, dependencia o verificación no satisfecha |
| 401 | Token ausente/expirado o credenciales incorrectas |
| 404 | Recurso no encontrado cuando el controlador lo distingue |
| 409 | Correo duplicado o documento bloqueado por fase/auditoría |
| 500 | Error de servidor; algunos fallos de generación se traducen así |
| 503 | Sugerencia de paleta sin servicio disponible |

Un fallo 429 del proveedor puede convertirse en error de generación, en vez de propagarse como 429. El límite de Multer puede producir una respuesta de error fuera del JSON habitual. Guarda código HTTP y cuerpo real para diagnóstico.
