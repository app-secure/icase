# Codificación

Esta fase está disponible como una **base de generación genérica en desarrollo**. Las operaciones CRUD almacenan y modifican datos; no implementan automáticamente todas las reglas de negocio descritas en lenguaje natural.

## Relaciones muchos a muchos

El generador reconoce las relaciones N:M explícitas en el diagrama de dominio aprobado. Crea tablas intermedias en PostgreSQL/MySQL con dos referencias obligatorias y unicidad por pareja; en MongoDB crea colecciones de vínculos e índices compuestos únicos (sin simular integridad referencial SQL). Las autorrelaciones mantienen dos roles diferentes. El manifiesto describe los vínculos en `storage.associations`.

Express, NestJS y Spring con PostgreSQL/MySQL generan `GET`, `POST` y `DELETE /api/associations/{tabla}`. La tabla y sus extremos aparecen en `storage.associations` y en OpenAPI. Para listar usa `source_id` y opcionalmente `limit` (máximo 100); `has_more` indica que hay resultados adicionales. Para asociar/desasociar envía `{ "source_id": "1", "target_id": "2" }`; los identificadores deben ser cadenas de enteros positivos. Repetir una asociación o desasociación es idempotente. Los cambios usan transacciones, comprueban que ambos registros existan y bloquean su lectura durante la operación para evitar que se borren concurrentemente.

Con autenticación habilitada, listar requiere permiso GET sobre ambos extremos; modificar vínculos requiere GET y PATCH sobre ambos, o ser administrador. No se inventan nuevos permisos. Sin autenticación, las rutas son públicas conforme a la decisión aprobada. Un rol con alcance «solo registros propios» sobre algún extremo recibe 403 al operar el vínculo.

Las pantallas web incluyen un panel «Relaciones muchos a muchos» en las operaciones asociadas a cada extremo. Los selectores permiten buscar y paginar registros; el panel lista vínculos y permite asociar/desasociar según los permisos del usuario. «Cargar más vínculos» continúa la consulta mediante `after_target_id`. Los paneles se derivan de `GET /api/contract`, no de nombres fijos de entidades, y funcionan tanto con formularios tipados como con el editor JSON. No sustituyen automáticamente el diseño visual de los mockups ni incorporan gestión N:M al cliente móvil.

Express/NestJS con MongoDB también generan API y panel N:M. Sus identificadores son cadenas ObjectId de 24 caracteres hexadecimales. Las operaciones requieren un replica set o clúster compatible con transacciones; una instalación standalone responde 503 sin ejecutar modificaciones. Los vínculos y el borrado de extremos usan transacciones y un campo interno de bloqueo para impedir vínculos huérfanos por concurrencia. El campo de bloqueo no forma parte de la respuesta de registros. El soporte no cambia las limitaciones de integridad de las demás relaciones MongoDB ni implementa ownership.

Para MongoDB con N:M, el Compose exportado incluye scripts que preparan un replica set autenticado de un solo nodo y una clave interna persistida en `database-key`. Eso habilita transacciones, **no alta disponibilidad**. Conserva backups de datos y claves, revisa usuarios/permisos de producción y no borres volúmenes para actualizar una instalación existente. El entorno aislado de verificación utiliza su propio replica set efímero, sin exponer puertos de la base al host.

El informe mantiene bloqueada una entrega declarada completa con N:M hasta completar la verificación integral con base real; sigue permitiendo la entrega parcial confirmada. No se inventan vínculos en los datos iniciales. Las migraciones siguen siendo iniciales: no apliques una regeneración sobre una base existente sin preparar una migración incremental y respaldo. Los scripts de despliegue y la concurrencia real deben validarse con Docker/MongoDB; las pruebas simuladas no certifican su ejecución.

## Propiedad de registros

En la etapa de autenticación y roles puedes marcar **Solo registros propios** en un permiso. Es opt-in: si no lo marcas, el rol sigue viendo todos los registros de esa operación. El administrador y el alcance «todos» no se filtran.

El backend añade una columna interna `owner_id` (no aparece en la API, OpenAPI ni el contrato). Al crear, el servidor la rellena con el usuario autenticado; el cuerpo y los filtros del cliente no pueden escribirla. Listar, modificar y borrar un registro ajeno responden `404`, igual que si no existiera. Una referencia a un registro que el rol no podría leer responde `409`.

La generación se detiene con un mensaje claro si combinas esta opción con Spring o con procesos, eventos, archivos, reportes, pagos o mapas: esos módulos leen datos fuera del CRUD con alcance. Los datos iniciales y lo que crea el administrador quedan sin propietario; un rol limitado no los ve. Regenerar un proyecto existente añade la columna con una migración aditiva.

## Seguridad del backend generado

Los nuevos backends Express y NestJS incluyen Helmet, límites por IP para `/api` (300 solicitudes/minuto por defecto) y un límite adicional compartido por login/registro (20 solicitudes/15 minutos). `/health` queda fuera del limitador. Devuelven 429 y `Retry-After` cuando se supera el límite. La memoria del limitador es local a cada proceso: para varias réplicas se requiere un almacén compartido o un limitador en el proxy.

Configura `CORS_ORIGINS` con orígenes explícitos, separados por comas. Sin configuración, producción no habilita CORS para navegadores externos; desarrollo permite localhost en los puertos 5173 y 8080. CORS no sustituye autenticación ni autorización. Configura `TRUST_PROXY_HOPS` únicamente si conoces la topología del proxy: un valor incorrecto afecta la identificación de IP. Los controles están documentados en el `.env.example` exportado.

El CI generado ejecuta `npm audit --audit-level=high` después de instalar las dependencias Node. Un hallazgo alto/crítico, o la imposibilidad de completar la auditoría, hace fallar ese paso. No equivale a una auditoría integral del código ni cubre dependencias Maven.

La verificación de backends Node y sus Dockerfiles de entrega también ejecutan `npm audit --omit=dev --audit-level=high` sobre la instalación real. Las alertas altas/críticas y los fallos del servicio de auditoría bloquean la verificación. Un argumento temporal distinto por ejecución impide reutilizar una capa Docker con una auditoría antigua; la evidencia se identifica mediante `npm-audit-prod-high-v2`. Las evidencias anteriores deben renovarse y la infraestructura antigua debe regenerarse. Las auditorías de construcción no cubren dependencias Maven, imágenes base ni todo el código generado.

El generador utiliza NestJS 12.3.2, con sus tres paquetes principales fijados a la misma versión, y Node.js 22.12+ o 24+. No modifica ZIP ya descargados ni sustituye silenciosamente versiones antiguas fijadas en una decisión: revisa y aprueba el stack antes de regenerar esos proyectos. Las verificaciones anteriores deben renovarse al cambiar el backend generado. No se aplica `npm audit fix --force`; la auditoría se vuelve a ejecutar en cada verificación y puede bloquear vulnerabilidades futuras.

Spring incluye un filtro HTTP anterior a la autenticación: cabeceras defensivas, CORS explícito, límites por IP equivalentes y errores internos saneados. Usa `APP_ENV=production` en producción. Ignora cabeceras de IP reenviada: detrás de un proxy, las peticiones comparten la IP del proxy hasta configurar una estrategia confiable. No se debe habilitar confianza indiscriminada en esas cabeceras. Los contadores son locales al proceso y su memoria está acotada; varias réplicas requieren protección compartida. El endpoint `/health` queda fuera del limitador, pero mantiene CORS y cabeceras defensivas.

El backend Java exporta pruebas JUnit que verifican cabeceras, CORS, preflight, límites y saneamiento, sin iniciar Spring ni conectarse a una base de datos. Ejecuta `mvn test` en `backend/`; el CI generado también las ejecuta. Estas pruebas no sustituyen el arranque completo ni las pruebas de integración con PostgreSQL/MySQL.

Para incorporarlas a un proyecto existente, regenera y revisa el backend y los artefactos dependientes. Los ZIP exportados anteriormente no se modifican.

## Aprobaciones técnicas

Inicia sesión antes de entrar: este módulo exige autenticación. Revisa y aprueba, en este orden:

1. Alcance y plataformas: web, móvil y exclusiones.
2. Herramientas y tecnologías.
3. Arquitectura de implementación.
4. Estructura de carpetas.

Las sugerencias de planificación actuales se construyen mediante reglas deterministas a partir de artefactos aprobados. Revisar una propuesta sigue siendo necesario. No asumas que una tecnología escrita libremente tiene un generador compatible.

## Generar, verificar y aprobar

| Entregable | Entradas principales | Comprobación disponible |
| --- | --- | --- |
| Backend | Decisiones y RF aprobados | Estructura, compilación, arranque, persistencia y CRUD de humo |
| Frontend | Mockups, navegación y decisiones | Estructura y compilación; interacción integral en la suite |
| Pruebas | Backend y frontend aprobados | Trazabilidad, integración CRUD y navegador |
| Infraestructura | Código y arquitecturas aprobadas | Revisión estructural; arranque del Compose exportado al verificar el paquete |
| CI/CD | Pruebas e infraestructura aprobadas | Revisión estructural del workflow |
| Paquete final | Todos los anteriores aprobados y vigentes | Suite aislada y segundo arranque con sus propios Dockerfiles/Compose |

Para cada entregable genera, inspecciona los archivos, selecciona **Verificar** y revisa los pasos y errores. Aprueba únicamente cuando corresponda. Editar un archivo invalida la evidencia anterior; vuelve a verificar esa versión.

Docker Desktop debe estar iniciado en el equipo que ejecuta el backend. La primera construcción puede tardar al descargar imágenes. No cierres el servidor durante la verificación.

## Qué se genera actualmente

Cada RF tiene una clave estable, por ejemplo `rf-01`, y una ruta `/api/operations/rf-01`. La base ofrece consulta, creación, modificación y eliminación de documentos de datos. Las pantallas React se conectan mediante sus identificadores RF.

Esta base no sustituye modelos de dominio, formularios finales, controles de acceso del sistema generado ni reglas particulares como «un ejemplar solo puede tener un préstamo activo». Aunque pase las pruebas CRUD, tales reglas siguen pendientes de implementación y validación.

Los adaptadores actuales cubren Node.js con Express/NestJS, React/Vite y persistencia MongoDB/PostgreSQL/MySQL. El soporte debe comprobarse para la combinación elegida. El bundle Expo es opcional y no constituye un APK/IPA firmado.

## Exportar el ZIP

### Declarar el alcance antes de entregar

En **Módulos → Alcance de la entrega** elige una modalidad:

- **Completa**: confirma cada RF de su versión actual, distingue CRUD de procesos personalizados y declara las capacidades necesarias. La entrega queda bloqueada si hay capacidades pendientes, RF sin entidad/operación o declaraciones sin revisar.
- **Parcial**: reconoce explícitamente las limitaciones; el ZIP y su manifiesto incluirán el alcance y los pendientes.

La detección por palabras clave solo sugiere capacidades. Descartar una sugerencia requiere una justificación y una confirmación. Si cambia el contenido del RF, su confirmación anterior deja de servir.

Guarda y aprueba la etapa Módulos y regenera los artefactos afectados. Las versiones antiguas necesitan un backend nuevo con el contrato de cobertura; volver a verificar un informe antiguo no lo actualiza.

El informe distingue **CRUD tipado generado**, **solo datos** y **no soportado**, además de una evaluación de alcance separada. Una verificación Docker correcta sigue siendo necesaria, pero no certifica todos los RF, RNF ni las reglas de negocio.

Genera el paquete cuando las etapas previas estén aprobadas. Verifica el paquete, apruébalo y descarga. Conserva su manifiesto, versión e informes.

Si la exportación se bloquea, consulta archivos pendientes, aprobaciones desactualizadas y evidencia que no coincide con la huella actual. Un resultado estructural por sí solo no basta para los artefactos que requieren ejecución.

## Limitaciones operativas

### Módulos opcionales y actualizaciones

En **Módulos → Personalizado** puedes activar archivos/imágenes, reportes/cálculos y recuperación de cuentas por SMTP. Requieren Express/NestJS con JWT; no se activan automáticamente. Las fórmulas solo se ejecutan como reglas confirmadas de campos existentes. La recuperación requiere configurar correo y URL pública; el perfil Mailpit es exclusivamente de pruebas.

Las entregas nuevas incorporan `tools/update.cjs`: muestra diferencias, preserva cambios manuales, bloquea conflictos y exige aprobar la vista previa antes de escribir. El backend conserva migraciones históricas y genera cambios aditivos; las transformaciones destructivas o con backfill requieren revisión manual. No extraigas un ZIP encima de un proyecto modificado ni borres volúmenes para actualizar.

Consulta [módulos y actualización segura](../desarrollo/contratos/modulos-y-actualizacion.md) para límites, configuración y pruebas reproducibles.

También hay módulos opcionales para coordinación de eventos entre réplicas, Stripe test, SSO OIDC, mapas web y cámara/QR. Necesitan configuración explícita; el generador no obtiene credenciales de los insumos ni supone que un QR autorice una acción. Consulta [tiempo real e integraciones](../desarrollo/contratos/tiempo-real-integraciones.md), especialmente sus límites y la diferencia entre proveedor simulado y prueba real.

La verificación aislada puede durar varios minutos y dispone de seguimiento mediante trabajos de verificación. Al verificar el paquete se ejecutan también sus propios Dockerfiles y Compose, con secretos temporales, red interna y puertos publicados deshabilitados. La aprobación exige `compose-exportado-v1` para la huella actual; una evidencia anterior de sintaxis o del entorno auxiliar ya no basta. No se certifican automáticamente TLS, HA, backups ni seguridad de producción.

Consulta [la guía de despliegue](../despliegue/guia.md) para conocer los límites del entorno de prueba.
