# iCase — Qué hicimos, qué puede hacer la app y qué falta

Documento de traspaso para Manuel. Resume el trabajo de la rama `feature/codificacion` desde el commit `b5613be` («avance en implementacion de generacion de codigo») hasta hoy: **30 commits, 109 archivos, unas 10 000 líneas añadidas**, subidos a `origin/feature/codificacion`.

Los detalles técnicos de cada pieza están en `docs/code-generation-contract.md` y en el `README.md`; aquí está la visión de conjunto, cómo comprobar que funciona y lo que queda pendiente.

---

## 1. En una frase

iCase toma insumos (audio, PDF, texto) y llega hasta una **aplicación entregable**: requisitos IEEE 830 → 6 diagramas → mockups → documento PDF → planificación del código → backend, frontend, pruebas, infraestructura y CI/CD → paquete verificado en Docker y descargable en ZIP.

Lo que cambió en esta rama es la parte final: **la generación de código dejó de ser un CRUD genérico** y pasó a ser un generador con modelo de datos, reglas de negocio, autenticación y roles, documentación OpenAPI, varios stacks, informe de qué se generó y módulos elegibles. Además se cerró la seguridad de la propia plataforma iCase.

### Decisión de diseño que lo guía todo

**El código se genera solo con plantillas deterministas, sin IA.** La IA se usa para insumos, requisitos, diagramas, mockups y para *proponer* reglas de negocio; esas propuestas las confirma una persona. Consecuencias:

- Misma entrada, mismo código. Todo lo generado se puede probar de forma automática.
- Nada se sustituye en silencio: si piden un stack que no existe, falla con un mensaje claro (nunca «te di Express porque no tengo Java»).
- Cada cosa que el generador no puede hacer se dice (informe de generación).

---

## 2. Qué puede hacer la app hoy

### 2.1 Flujo completo

| Fase | Qué ocurre | Estado |
| --- | --- | --- |
| Insumos | Audio, PDF y texto se convierten en fuentes | Ya existía |
| Requisitos | RF y RNF en formato IEEE 830, con aprobación | Ya existía |
| Diagramas | 6 tipos (incluye clases de dominio), versionado y validación | Ya existía |
| Mockups | Pantallas HTML con trazabilidad a los RF | Ya existía |
| Documento | PDF con auditoría final | Ya existía |
| **Planificación del código** | 6 decisiones obligatorias + 1 opcional (ver 2.2) | **Ampliada en esta rama** |
| **Generación** | Backend, frontend (y móvil), pruebas, infraestructura, CI/CD | **Reescrita en esta rama** |
| **Verificación** | Cada artefacto se construye y prueba en Docker aislado antes de aprobarse | **Ampliada** |
| Entrega | Paquete de entrega aprobado y descargable en ZIP | Ya existía |

### 2.2 Planificación del código (etapas con aprobación)

1. **Alcance y plataforma** — web, móvil, exclusiones.
2. **Stack** — se elige de listas (no texto libre) y se avisa si los requisitos mencionan algo no soportado.
3. **Arquitectura** — capas y módulos.
4. **Estructura de carpetas.**
5. **Reglas de negocio** *(nueva)* — la IA propone, la persona confirma o rechaza regla por regla; hay un editor en la interfaz.
6. **Autenticación y roles** *(nueva)* — se deriva de los actores de los RF; hay un editor de la matriz de permisos.
7. **Módulos** *(nueva, opcional)* — modo automático (recomendado) o personalizado. Si no se aprueba, se usa el automático, así los proyectos que ya existían no se rompen.

Cambiar una etapa aprobada deja como «desactualizada» todo lo que dependía de ella.

### 2.3 Qué contiene la aplicación generada

- **Datos por entidad.** Una tabla (o colección) por cada clase del diagrama de dominio, con migraciones, claves foráneas, validación de tipos y errores claros (400 de tipo, 409 de unicidad o referencia, 422 de regla).
- **Reglas de negocio.** Nueve tipos declarativos: requerido, único, rango, longitud, formato, comparación entre campos, máquina de estados, inmutable y valor por defecto. Las aplica un motor determinista; no hay código escrito a mano por regla.
- **Autenticación y roles.** Sesión con JWT, contraseñas con scrypt (BCrypt en Java), bloqueo por intentos, permisos por rol × operación × método, gestión de usuarios para el administrador, y protección del último administrador. También puede generarse **sin** autenticación si esa es la decisión aprobada.
- **Documentación OpenAPI 3.1.** Archivo `backend/openapi.json` y endpoint `GET /api/openapi.json`, derivados del mismo contrato (las reglas aparecen como restricciones). Una prueba de conformidad comprueba que cada petición y respuesta reales cumplen lo documentado.
- **Interfaz web (React + Vite).**
  - Módulo de **formularios por campo** (activo por defecto): un control por campo según el tipo (texto, número, fecha, desplegable, casilla, entidad relacionada), tabla de registros, editar y eliminar, y errores de las reglas junto a su campo.
  - Inicio y cierre de sesión, menú limitado a lo que permite el rol, botones según permiso y pantalla de usuarios para el administrador.
- **App móvil (Expo / React Native)**, si el alcance incluye móvil: login y las mismas operaciones. Es un paquete sin firmar, **no** un APK ni un IPA.
- **Pruebas generadas:** unitarias de trazabilidad, integración por HTTP (CRUD, reglas, permisos, autenticación, OpenAPI) y de navegador (Playwright).
- **Infraestructura** (`docker-compose`), **CI/CD** y un **informe de generación** (ver 2.5).

### 2.4 Stacks soportados

| Capa | Opciones |
| --- | --- |
| Backend | Node.js + Express, Node.js + NestJS, **Java + Spring Boot** |
| Base de datos | PostgreSQL, MySQL, MongoDB (con Java: solo PostgreSQL o MySQL; combinarlo con MongoDB se rechaza con mensaje claro) |
| Frontend | React + Vite |
| Móvil | Expo (React Native) |

El catálogo vive en `src/core/services/StackCatalog.js` y es la **única** fuente de lo soportado. Un stack cuenta como soportado solo si pasa los ejercitadores HTTP de verificación.

El backend Java no genera una clase por entidad: es un runtime **fijo** (`templates/spring`) que lee JSON (contrato, modelo, reglas, política, OpenAPI) y usa Flyway para las migraciones.

### 2.5 Informe de generación (qué se generó y qué no)

Cada backend incluye `backend/GENERATION-REPORT.md` y `.json`, también visibles en iCase (con una vista previa **antes** de generar). Clasifica cada RF:

| Nivel | Significa |
| --- | --- |
| **Completo** | Tiene entidad en el modelo de dominio y no se detectó nada que el generador no produzca: alta, consulta, edición y baja con validación, reglas y permisos |
| **Solo datos** | Solo se guardan y consultan registros; parte de lo pedido no se genera |
| **No soportado** | Pide algo que no se genera y no hay entidad que lo sostenga |

Detecta (por palabras clave) diez capacidades que **no** se generan: tiempo real, archivos e imágenes, reportes y exportación, cálculos y procesos, correo/SMS/notificaciones, pagos en línea, mapas, integraciones externas, cámara/QR/biometría y recuperación de contraseña. De cada una dice qué ocurre en su lugar. También avisa de entidades sin RF, de la app móvil sin firmar y de los límites que valen para toda app generada.

> La detección es por palabras clave: un RF marcado «completo» puede pedir algo con otras palabras. El propio informe lo advierte.

### 2.6 Seguridad de la plataforma iCase

Se revisó y cerró la seguridad de iCase en sí (no del código generado). Antes, cualquiera podía leer o borrar proyectos ajenos. Ahora:

- Sesión obligatoria en todo salvo `/health`, registro e inicio de sesión.
- El dueño del proyecto se comprueba en **todas** las rutas (proyectos, requisitos, diagramas, fuentes, trabajos y artefactos). Lo ajeno responde 404, sin revelar que existe.
- `usuario_id` solo sale del token; listas de campos permitidos contra asignación masiva.
- `JWT_SECRET` sin valor por defecto (en producción: obligatorio, mínimo 32 caracteres).
- CORS por lista (`CORS_ORIGINS`), cabeceras defensivas, límite de tamaño (`JSON_LIMIT`), subidas solo audio/PDF/texto, errores sin detalles internos, límite de intentos de acceso.
- El frontend devuelve al acceso cuando la sesión caduca; contraseña mínima de 8 caracteres.
- Script para proyectos antiguos sin dueño: `npm run proyectos:asignar -- <correo> [--confirmar]`.

Se encontró y corrigió, entre otros, que borrar una fuente podía afectar a fuentes ajenas.

### 2.7 Qué tipo de aplicación genera bien

**Sistemas de gestión de datos:** formularios, listas, roles y reglas de validación. Ejemplos que encajan: biblioteca, inventario, gestión académica, citas, reservas.

**No encaja (todavía):** procesos o cálculos complejos, tiempo real, archivos, pagos, mapas, aplicaciones nativas, SEO.

---

## 3. Lo que hicimos, por bloques

Cada bloque se hizo en commits divididos por área (mensajes cortos, sin trailers de coautor).

| # | Bloque | Qué se hizo | Commits |
| --- | --- | --- | --- |
| 1 | **Modelo en el contrato** | Se extrae el modelo de dominio del diagrama de clases (entidades, tipos, enums, relaciones) y viaja en el contrato | `439be24`, `9997dbd` |
| 2 | **Capa de datos** | Tabla por entidad, migraciones, claves foráneas, errores 400/409 | `439be24`, `9997dbd` |
| 3 | **Reglas de negocio** | Etapa nueva, lenguaje declarativo, motor determinista, propuesta con IA y confirmación humana, editor en la UI | `ebd9634`, `efb3240` |
| 4 | **Autenticación y roles** | Etapa nueva, núcleo JWT compartido por Express y NestJS, `icase_users`, login y gestión de usuarios en web y móvil | `ebd9634`, `439be24`, `8168105` |
| 5 | **OpenAPI** | Generador y prueba de conformidad | `439be24`, `9997dbd` |
| 6 | **Verificación en Docker** | Script `verify-full-stack.js` para comprobar cualquier combinación | `91d9ccf`, `5c9e71a` |
| 7 | **Java + Spring Boot y catálogo de stacks** | Runtime Java fijo, `StackCatalog`, selects en la UI, avisos de tecnologías no soportadas | `714ff24`…`3e8c548` |
| 8 | **Seguridad de iCase** | Ver 2.6 | `ab4f5ad`…`520627e` |
| 9 | **Informe de generación** | Servicio, archivos en el paquete, vista previa y panel en la UI | `c4d1588`…`a1fd46e` |
| 10 | **Módulos** | Etapa opcional, `ModuleService`, formularios por campo, editor en la UI | `a067455`…`a62ccef` |
| 11 | **Modo de un clic** | Ejecución automática de las 7 etapas con valores seguros (JWT, sin registro abierto, reglas solo literales) e informe de lo dudoso | `44b9810` |
| 12 | **Verificación asíncrona persistente** | TrabajoGeneracion para verificación en Docker aislado, sondeo en tiempo real y barra de progreso reactiva | Este commit |

Commits completos: `git log --oneline b5613be..HEAD`.

### Problemas que encontramos (y conviene no repetir)

- **Marcadores de plantilla `__NOMBRE__`:** si el mismo marcador aparece también en un comentario, `String.replace` sustituye el comentario y deja el real sin valor (fallo mudo, pasó dos veces). Ahora todo pasa por `renderTemplate.js`, que falla si sobra o falta un marcador.
- **Funciones incrustadas con `toString()`** (`SamplePayload.runtimeSource()`) deben ser declaraciones `function nombre()`; una flecha pierde el nombre.
- **El smoke de Docker recibe una versión recortada de cada operación;** lo que pasa en Jest con el manifiesto completo puede fallar en Docker.
- **Ningún archivo compartido del backend puede nombrar motores de base de datos** («postgres», «mysql»…), porque el verificador infiere el motor buscando esas palabras.
- **Los registros de la API son `{ id, data: { …campos }, created_at, updated_at }`** en todas las bases de datos. La pantalla de formularios leyó al principio los campos en el nivel equivocado y la prueba de Docker lo detectó.
- **Healthcheck de MySQL** con `-h 127.0.0.1`; con `localhost` marca «sano» antes de aceptar conexiones.
- En iCase, `router.param` se ejecuta **antes** del middleware de cada ruta, así que la autenticación va con `router.use` primero.

---

## 4. Dónde está cada cosa

Rutas relativas a `icase-backend/` salvo que se indique.

| Tema | Archivos |
| --- | --- |
| Catálogo de stacks | `src/core/services/StackCatalog.js` |
| Etapas del plan | `src/core/constants/CodeGenerationPhases.js`, `src/core/services/CodeGenerationWorkflowService.js`, `src/core/use-cases/GestionarPlanCodificacion.js`, `src/core/services/CodePlanningProposalService.js` |
| Reglas y acceso | `src/core/services/BusinessRuleService.js`, `BusinessRuleInferenceService.js`, `AccessControlService.js` |
| Módulos | `src/core/services/ModuleService.js` |
| Informe de generación | `src/core/services/GenerationReportService.js`, `src/core/constants/GenerationCapabilities.js` |
| Generación del backend | `src/infrastructure/services/BackendScaffoldGenerator.js`, `GenericBackendGenerator.js`, `BackendDataLayerGenerator.js`, `OpenApiGenerator.js`, `DomainModelExtractor.js`, `ApplicationContractBuilder.js` |
| Plantillas | `src/infrastructure/templates/{data-layer,auth,frontend,spring,verification}` |
| Generación del frontend y pruebas | `GenericFrontendGenerator.js`, `TestSuiteGenerator.js`, `SamplePayload.js` |
| Verificación en Docker | `SandboxRuntimeVerifier.js`, `scripts/verify-full-stack.js` |
| Seguridad de iCase | `src/infrastructure/security/{jwtSecret,RateLimiter,projectAccess,httpSecurity,sanitize}.js`, `src/app.js` |
| Interfaz de planificación | `icase-frontend/src/components/CodePlanningView.jsx`, `GenerationReport.jsx` |
| Documentación técnica | `docs/code-generation-contract.md` |

---

## 5. Cómo comprobar que funciona

```bash
# Pruebas unitarias y de integración (sin Docker): 394 pasan, 1 omitida
cd icase-backend && npx jest

# Verificación real en contenedores aislados (necesita Docker)
node scripts/verify-full-stack.js [Express|NestJS|Spring] [PostgreSQL|MySQL|MongoDB] \
     [--backend-only] [--mobile] [--no-auth] [--log archivo]

# Comprobar que la verificación SÍ falla cuando algo está mal (mutación)
node scripts/verify-full-stack.js Express PostgreSQL --backend-only \
     --sabotage archivo::texto-a-buscar::texto-de-reemplazo
```

- `--backend-only` es rápido (sin navegador); sin él se ejecuta también el frontend con Playwright.
- La salida del verificador se recorta: usa `--log` para ver los errores completos.
- Variables de configuración de iCase (`JWT_SECRET`, `CORS_ORIGINS`, `JSON_LIMIT`, `TRUST_PROXY`…): sección de seguridad del `README.md`.

### Lo que se verificó en Docker

| Combinación | Backend | Con navegador |
| --- | --- | --- |
| Express + PostgreSQL | Apta | Apta (también con `--mobile`) |
| Express + MySQL | Apta | **No se ejecutó** |
| Express + MongoDB | Apta | **No se ejecutó** |
| NestJS + PostgreSQL | Apta | Apta |
| NestJS + MySQL | Apta | Apta |
| NestJS + MongoDB | Apta | Apta |
| Spring + PostgreSQL | Apta | Apta |
| Spring + MySQL | Apta | **Sin confirmar** (no consta una ejecución completa) |

La verificación no es de adorno: se comprobó con sabotajes deliberados (rango, matriz de permisos, revocación de usuario) que falla cuando debe, también con Java. La seguridad de iCase se comprobó además contra el backend real con MongoDB (21 comprobaciones).

---

## 6. Lo que falta

Ordenado por lo que más acerca a «de requisitos a aplicación completa».

### 6.1 Siguiente en la lista

1. **Más módulos** (el sistema de módulos ya existe; falta llenarlo):
   - **Paginación, filtros y búsqueda** en la API (hoy las listas devuelven todos los registros). Toca los tres almacenes de Node, Java, OpenAPI, los ejercitadores y la interfaz.
   - **Datos iniciales (seed).** Ojo: inventar datos no es determinista; hay que decidir de dónde salen.
   - Módulos de tiempo real, archivos, reportes y pagos (hoy el informe los marca como no soportados).
2. **Modo de un clic** *(implementado)*: recorre todas las etapas de planificación con valores seguros (login con JWT y roles, sin autoregistro abierto, solo reglas explícitas con evidencia literal) y genera un informe final con lo dudoso en el plan y en la interfaz. Permite habilitar de inmediato la generación de backend y frontend.
3. **Verificación como trabajo persistente** *(implementado)*: se desacopló la verificación de la petición HTTP síncrona mediante `TrabajoGeneracion` (`tipo: 'verificacion'`), permitiendo ejecución asíncrona en segundo plano, reconexión por recarga y sondeo de progreso desde la interfaz.
4. **Regenerar sin perder ediciones** manuales y con **migraciones incrementales** (hoy solo existen `0001_init` y `0002_auth`; regenerar pisa los archivos).
5. **Calidad del proyecto generado:** auditoría de dependencias, cobertura, pruebas unitarias del dominio, endurecimiento del servidor generado (CORS, cabeceras, límite de peticiones, logs).
6. **Probar un proyecto real de punta a punta,** desde los insumos hasta el ZIP, incluyendo la inferencia de reglas con IA real y las etapas nuevas en la interfaz de iCase.
7. **Opcional — más stacks:** TypeScript con React (esfuerzo pequeño), otra base de datos SQL (pequeño a medio), Vue o Angular (medio), otro lenguaje de backend como Python o C# (grande cada uno). Móvil firmado y despliegue real a la nube.

### 6.2 Límites conocidos de lo que ya está hecho

**De la aplicación generada**

- La autorización es por rol y operación; **no hay propiedad de registros** (un cliente no queda limitado a «sus» reservas).
- El token del navegador se guarda en `localStorage`; en móvil solo en memoria.
- No hay recuperación de contraseña ni verificación de correo; el bloqueo por intentos es en memoria (no se comparte entre réplicas).
- La interfaz móvil sigue usando JSON, y solo se verificó el empaquetado para Android (no se probó en simulador ni teléfono).
- Los campos opcionales que se vacían al editar no se envían (conservan su valor anterior); los campos de fecha y hora pierden los milisegundos.
- Sin relaciones muchos-a-muchos.
- OpenAPI sin ejemplos de valores ni Swagger UI integrado (el documento se abre en cualquiera).
- Java: sin pruebas JUnit (la verificación es por HTTP), CORS no abierto (el frontend usa el mismo origen) y BCrypt trunca contraseñas de más de 72 bytes.
- Claves foráneas escritas a mano en el JSON cuando se usa la interfaz sin el módulo de formularios.

**De la plataforma iCase**

- Muchos controladores aún devuelven `err.message` en sus propios 500 (el manejador global solo cubre los errores no capturados).
- El registro está abierto a cualquiera; no hay recuperación de contraseña ni revocación de tokens (caducan a las 12 h).
- El token vive en `localStorage`; los ficheros subidos se quedan en `uploads/`.
- La verificación en Docker ejecuta scripts de build de código editable por el usuario (aislado en contenedor, pero con red durante el build).
- El límite de intentos es en memoria (un solo proceso).

**De la verificación**

- No se probó el flujo real de las etapas Módulos, Reglas de negocio y Acceso contra la API de iCase con un proyecto de verdad (solo los editores aislados y los casos de uso con repositorios simulados).
- La inferencia de reglas no se probó con un modelo de IA real.

### 6.3 Decisiones que hacen falta

- ¿**Qué tipos de aplicación** se quieren presentar en la universidad? Ordena el catálogo de módulos.
- ¿**Qué 2 o 3 stacks** importan además de los actuales? ¿Java era un requisito real o bastaba con avisar bien? (Ya está hecho, pero decide si se invierte en más lenguajes.)
- ¿Se quiere abrir el registro de usuarios o dejarlo cerrado por defecto?

---

## 7. Cómo seguir sin romper nada

- **Un stack nuevo solo cuenta como soportado si pasa `verify-full-stack.js`.** Se registra en `StackCatalog` y en el generador, nunca en uno solo.
- **Un módulo nuevo** se añade al catálogo de `ModuleService`, genera sus archivos desde plantillas, aporta sus propias pruebas (como hizo el de formularios con `typed-forms.spec.js`) y debe actualizar el texto de `generalLimits` si cambia un límite.
- **La lista de límites generales** (`generalLimits` en `GenerationCapabilities.js`) es texto escrito a mano: se desactualiza si no se toca.
- **Mensajes de commit:** cortos, de una línea y en español, como los del resto del historial. Sin líneas de coautor.
- Antes de reescribir historial, comprobar que nada se haya subido y dejar una rama de respaldo.
