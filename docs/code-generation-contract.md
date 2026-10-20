# Contrato de generación de código

Este contrato es la base común de los módulos de código, pruebas, infraestructura y entrega. Ningún generador modifica el flujo ni aprueba su propio resultado.

## Stacks soportados

`StackCatalog` es la única fuente de qué sabe generar la herramienta. Un stack no soportado **nunca se sustituye en silencio**: se avisa en la propuesta, se rechaza al proponerlo en la etapa de stack y falla la generación con un mensaje que nombra las alternativas.

| Eje | Opciones |
|---|---|
| Backend | Node.js + Express · Node.js + NestJS · Java + Spring Boot |
| Base de datos | PostgreSQL · MySQL · MongoDB (Java + Spring Boot solo con PostgreSQL o MySQL) |
| Frontend | React + Vite |
| Móvil (opcional) | Expo (React Native) |

El contrato, la documentación OpenAPI, las migraciones SQL y las pruebas por HTTP son comunes a todos los backends. **Un stack se considera soportado solo si pasa esas mismas pruebas de verificación** (CRUD tipado, reglas, matriz de permisos, autenticación y OpenAPI); por eso añadir otro es una tarea acotada. Valores por defecto sin indicación: Express con MongoDB; con Spring Boot, PostgreSQL.

### Java + Spring Boot

El código Java es **fijo** (`templates/spring`) y se guía por los mismos datos que el backend Node, escritos como JSON en `src/main/resources/icase/` (`contract`, `model`, `rules`, `policy`, `openapi`); no se genera código Java por entidad. Spring Boot 3 + JdbcTemplate, migraciones con Flyway (los SQL de `0001_init` y `0002_auth`, aplicados al arrancar), JWT con java-jwt y contraseñas con BCrypt. Se conecta con `DATABASE_URL` (misma variable que Node) y reintenta mientras la base de datos arranca. En producción se declara `APP_ENV=production`, que rechaza un `JWT_SECRET` débil.

Límites: no admite MongoDB; las contraseñas con más de 72 bytes se truncan (límite de BCrypt; el máximo admitido es 128 caracteres); no hay CORS abierto como en Node (el frontend usa el mismo origen mediante el proxy).

## Plantilla Node (propuesta inicial)

- Plataforma generada: web.
- Backend: Node.js + Express.
- Frontend: React + Vite.
- Base de datos: MongoDB.
- Gestor de paquetes: npm.
- El andamiaje, las configuraciones y los pipelines salen de plantillas deterministas.
- El código no lo escribe una IA: la IA interviene antes (insumos, requisitos, diagramas, mockups y la propuesta de reglas de negocio) y toda decisión que llega al código la aprueba una persona.

El stack se propone por proyecto y requiere aprobación antes de avanzar. Estos valores son la propuesta predeterminada, no una aprobación automática.

## Etapas y compuertas

1. `alcance_plataforma`: confirma web, exclusiones y límites de entrega.
2. `stack_tecnologico`: confirma herramientas, versiones y restricciones.
3. `arquitectura_codigo`: confirma capas, módulos, contratos y decisiones técnicas.
4. `estructura_carpetas`: confirma el árbol que compartirán los generadores.
5. `reglas_negocio`: revisa y confirma las reglas que el backend aplicará a los datos (ver más abajo). Es requisito de `generacion_backend`.
6. `control_acceso`: define autenticación, roles y la matriz de permisos (ver más abajo). Es requisito de `generacion_backend` y de `generacion_frontend`.
7. `generacion_backend` y `generacion_frontend`: pueden ejecutarse en paralelo.
8. `generacion_pruebas` y `generacion_infraestructura`: consumen ambos códigos aprobados.
9. `generacion_ci_cd`: consume pruebas e infraestructura aprobadas.
10. `paquete_entrega`: reúne únicamente artefactos vigentes y aprobados.

Modificar una decisión aprobada no regenera nada automáticamente. Sus descendientes aprobados pasan a `desactualizada` y deben revisarse de manera explícita.

## Interfaz de generador

```js
generar({ proyecto, insumos, versionesOrigen }) => {
  tipo,
  estado,
  archivos: [{ ruta, contenido, lenguaje, huella }],
  dependencias: [{ tipo, version }],
  trazabilidad_rf: [],
  advertencias: [],
  errores: [],
  generado_por,
  huella_entrada,
  versiones_origen
}
```

## Contrato funcional genérico

Cada requisito funcional aprobado se transforma en una operación estable identificada por su código (`RF-01`, `RF-02`, etc.). El manifiesto de backend declara, sin depender del dominio del proyecto:

```json
{
  "operations": [
    {
      "id": "RF-01",
      "key": "rf-01",
      "collectionPath": "/api/operations/rf-01",
      "itemPath": "/api/operations/rf-01/:id",
      "methods": ["GET", "POST", "PATCH", "DELETE"]
    }
  ]
}
```

El manifiesto del frontend conecta cada pantalla con esas claves mediante su trazabilidad RF. Una pantalla sin RF o un RF sin operación bloquea la aprobación. Este contrato funciona igual para restaurantes, bibliotecas, inventarios u otros dominios; las reglas particulares del negocio deben materializarse después como esquemas, invariantes y pruebas del RF.

### Modelo de dominio en el contrato

Si existe un diagrama de `clases_dominio` aprobado y vigente, `DomainModelExtractor` lo convierte en entidades (atributos tipados, enumeraciones, claves foráneas derivadas de la cardinalidad) y `ApplicationContractBuilder` lo añade al manifiesto:

- `entities[]`: `name`, `key`, `attributes`, `references` y un JSON Schema informativo (`required` siempre vacío: el diagrama no expresa obligatoriedad, y ésta no se inventa).
- `relations[]`: relaciones con tipo (`asociacion`, `composicion`, `agregacion`, `herencia`), cardinalidades declaradas y `cardinalidad` normalizada.
- `operations[].entity` / `relatedEntities` / `schema`: cada RF se asocia a la entidad cuyo nombre aparece primero en su nombre (o descripción). Sin coincidencia, la operación conserva el esquema genérico y se registra en `warnings`.
- `model`: origen (`clases_dominio` o `none`) y entidades sin RF asociado (`unmapped`).

La versión del diagrama usada queda en `versiones_origen.clases_dominio` y forma parte de la huella de entrada. Sin diagrama aprobado el comportamiento es el genérico anterior.

### Capa de datos

`BackendDataLayerGenerator` convierte ese modelo en almacenamiento físico. El manifiesto declara `storage` (`layout: table_per_entity`, operación → tabla, columnas, referencias exigidas y migraciones) y el modo pasa a `entity_crud_v1`.

- Una tabla (PostgreSQL, MySQL) o colección (MongoDB) por entidad, con columnas tipadas, `extra` para campos no declarados y `created_at`/`updated_at`. Las operaciones sin entidad usan `icase_records`.
- Una entidad puede quedar sin operación asociada; su tabla se crea igualmente. Una clave foránea solo se **exige** si la entidad destino es alcanzable por la API; si no, la columna existe pero sin restricción (no habría forma de crear el registro referenciado).
- Migraciones versionadas (`0001_init`) embebidas en `src/data/migrations.js` y registradas en `schema_migrations`. Se aplican al arrancar con bloqueo entre instancias (PostgreSQL: transaccional; MySQL: sin transacción por el DDL implícito; MongoDB: colecciones e índices). Para lectura humana se exporta `backend/db/migrations/0001_init.sql` (o `.json`).
- La forma pública de los registros no cambia: `{ id, capability, data, created_at, updated_at }`.
- Tipos incorrectos responden `400`; violaciones de integridad referencial `409`. MongoDB reproduce ambas comprobaciones en el almacén.
- Las plantillas del almacén son JavaScript real en `src/infrastructure/templates/data-layer/`. NestJS reutiliza el mismo almacén mediante `allowJs`.

La verificación aislada ejerce todas las operaciones con cuerpos derivados del esquema y de las reglas (`SamplePayload`), el rechazo de tipos y la integridad referencial. Limitaciones actuales: relaciones muchos-a-muchos sin tabla intermedia; la migración es una sola (`0001_init`), de modo que regenerar con un modelo distinto no altera una base ya migrada.

### Reglas de negocio

La etapa `reglas_negocio` convierte los RF aprobados y el diagrama de clases de dominio en reglas **declarativas**. La IA solo propone datos en un DSL cerrado (`analista_reglas_negocio.md`); un motor determinista (`rules-engine.js`, generado en `backend/src/data/`) las aplica. Ningún código procedente de la IA se ejecuta.

| tipo | parámetros | dónde se garantiza |
|---|---|---|
| `requerido` | `campo` (admite referencias) | motor |
| `unico` | `campos` (1–3) | índice único en la base de datos (409) |
| `rango` | `campo`, `min`/`max` | motor (422) |
| `longitud` | `campo`, `min`/`max` | motor (422) |
| `formato` | `campo`, `email` o `url` | motor (422) |
| `comparacion` | `campo`, `operador`, `con_campo` o `con_valor` | motor (422) |
| `maquina_estados` | `campo`, `inicial`, `transiciones` | motor (422), también en la creación |
| `inmutable` | `campo` | motor (422) |
| `valor_por_defecto` | `campo`, `valor` | motor, al crear |

Cada regla lleva `entidad`, `mensaje`, `rf` (obligatorio), `evidencia`, `origen` (`explicito`, `inferido`, `manual`) y `estado_decision` (`confirmado`, `pendiente`, `rechazado`).

- `BusinessRuleService` valida cada regla contra el modelo de dominio (entidad y campo existentes, tipo compatible, estados dentro del enum, RF aprobados). Una evidencia que no consta literalmente en los RF citados degrada la regla a `inferido`.
- `BusinessRuleInferenceService` descarta las propuestas inválidas informando por qué. **La IA no decide**: solo las reglas `explicito` con evidencia literal nacen `confirmado`; las demás quedan `pendiente`.
- La etapa no puede aprobarse con reglas `pendiente`, y se revalida al aprobar por si el modelo cambió. Puede aprobarse vacía.
- Al generar el backend solo se incluyen las `confirmado`. Si las reglas aprobadas ya no son coherentes con el modelo, la generación falla en lugar de omitirlas en silencio.
- Una violación responde `422` con `{ message, details: [{ regla, mensaje, rf }] }`.
- Datos de prueba y casos negativos se derivan de las reglas: la verificación aislada comprueba, por cada regla, que se cumple con datos válidos y que su violación se rechaza **por esa regla**.

Limitaciones actuales: la comprobación se hace leyendo el registro antes de escribir, de modo que dos modificaciones simultáneas pueden saltarse una transición de estado; las reglas no pueden redactarse desde la interfaz (solo confirmar, rechazar o editar el mensaje); no hay reglas entre entidades distintas ni condicionales.

### Autenticación y roles

La etapa `control_acceso` se propone **sin IA**: cada actor de los RF aprobados es un rol y recibe todos los permisos sobre las operaciones donde participa; los actores que parecen sistemas externos (`Sistema…`, `Pasarela…`) nacen excluidos. La persona revisa autenticación (`jwt` o `ninguna`), duración de sesión, roles, registro abierto y la matriz rol × operación × método (`GET`, `POST`, `PATCH`, `DELETE`). `AccessControlService` valida contra los RF aprobados; se revalida al aprobar y al generar.

El backend generado incluye:

- **Núcleo único** (`src/auth/auth-core.js`) con adaptadores finos para Express y NestJS. Sesión con JWT HS256 (`jsonwebtoken`, algoritmo fijado), contraseñas con `scrypt` y sal propia, tiempo de respuesta igualado cuando el correo no existe, bloqueo tras 5 intentos fallidos (429) y registro abierto limitado por IP.
- **El usuario se lee de la base en cada petición**: desactivarlo o cambiarle el rol surte efecto de inmediato, sin esperar a que caduque el token.
- **Todo `/api` exige sesión** salvo `login` y `register`; `/health` es público. La matriz se aplica en `/api/operations/:clave` (403 sin permiso). El rol `administrador` siempre existe, opera todo y es el único que gestiona `/api/users`; no puede quedarse el sistema sin un administrador activo.
- **Usuarios en la base de datos** (`icase_users`, migración `0002_auth`), independientes del modelo de dominio. El administrador inicial se crea al arrancar con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- **Arranque seguro**: con `NODE_ENV=production` se rechaza un `JWT_SECRET` ausente, de menos de 16 caracteres o con valores de ejemplo (`change-me`, `replace-with…`).
- **Frontend**: inicio y cierre de sesión, menú limitado a lo que el rol puede consultar, botones según permiso y, para el administrador, gestión de usuarios. La app móvil inicia sesión y guarda el token solo en memoria.

Con `ninguna` no se generan archivos de sesión y la API es pública; la generación lo advierte.

La verificación ejerce, además de lo anterior: 401 sin sesión o con token alterado, 403 por cada combinación rol × operación × método no permitida, revocación inmediata, protección del último administrador, bloqueo por intentos y registro abierto/cerrado.

Limitaciones actuales: la autorización es por rol y operación; no hay propiedad de registros (un cliente no queda limitado a «sus» reservas); el token del navegador se guarda en `localStorage`; no hay recuperación de contraseña ni verificación de correo; el bloqueo por intentos es en memoria (no se comparte entre réplicas).

### Documentación OpenAPI

El backend incluye su documentación OpenAPI 3.1, generada por `OpenApiGenerator` desde el mismo contrato (RF, modelo de dominio, reglas y política de acceso), de modo que no puede desviarse de lo que el backend hace. Se entrega de dos formas, y el manifiesto la declara en `docs`:

- Archivo `backend/openapi.json` (también incluido en el paquete de entrega), útil sin levantar nada.
- Endpoint `GET /api/openapi.json`. Con autenticación exige sesión, igual que `/api/contract`.

Contenido:

- Una etiqueta por RF, y por operación las cuatro rutas (`GET`/`POST` en la colección; `PATCH`/`DELETE` en el elemento) con `operationId` únicos.
- Un esquema por entidad (`Entidad`, `EntidadUpdate`, `EntidadRecord`). Las reglas de negocio se traducen a restricciones cuando existe equivalente (`rango` → `minimum`/`maximum`, `longitud` → `minLength`/`maxLength`, `formato`, `valor_por_defecto` → `default`, `requerido` → `required` solo al crear) y el resto va como extensiones: `x-reglas`, `x-transiciones`, `x-inmutable`, `x-unico`, `x-comparacion`, `x-references`. Cada regla cita su mensaje y RF.
- Solo se documentan las respuestas que el backend puede dar: `409` si la entidad tiene unicidad o referencias (o es referenciada, al eliminar), `422` si tiene reglas, `401`/`403` solo con autenticación.
- Con autenticación: esquema `bearerAuth`, rutas de sesión y usuarios, y `x-roles` en cada método con los roles autorizados.
- Un esquema de entidad nunca pisa los del sistema: una entidad llamada `User` o `Error` se publica como `UserEntidad`/`ErrorEntidad`.

Verificación: el documento se valida con un validador de OpenAPI 3.1, y una prueba de **conformidad** levanta el backend generado, ejecuta todos los flujos (CRUD, reglas, matriz de permisos, autenticación) y exige que cada petición y respuesta real esté documentada y cumpla su esquema. El smoke de Docker y las pruebas generadas comprueban además que el documento servido describe todas las operaciones y la seguridad aprobada.

Limitaciones actuales: no se incluyen ejemplos de valores, ni se sirve una interfaz gráfica (Swagger UI, Redoc); el documento se puede abrir en cualquiera de ellas.

## Evidencia de ejecución

La verificación estructural no habilita la aprobación por sí sola. Para backend, frontend, pruebas y paquete final se exige una evidencia asociada a la huella exacta de sus archivos. La verificación:

1. prepara los archivos en un directorio temporal exclusivo;
2. construye backend, frontend y, si aplica, el bundle móvil;
3. levanta la base de datos seleccionada, backend y frontend en una red Docker interna;
4. espera los `healthcheck`;
5. ejecuta CRUD para las operaciones del contrato, la suite de integración y las pruebas de navegador;
6. destruye contenedores, volúmenes e imágenes temporales.

Si Docker no está disponible o cualquiera de esos pasos falla, el artefacto queda `fallida` y no se puede aprobar ni exportar.

Tipos válidos:

- `codigo_backend`
- `codigo_frontend`
- `pruebas`
- `infraestructura`
- `pipeline_ci_cd`
- `paquete_entrega`

## API inicial

- `GET /proyectos/:id/codificacion`: obtiene o inicializa el plan.
- `PUT /proyectos/:id/codificacion/etapas/:etapa`: registra una propuesta estructurada.
- `POST /proyectos/:id/codificacion/etapas/:etapa/revision`: aprueba o rechaza una propuesta.
- `GET /proyectos/:id/artefactos?tipo=...`: lista artefactos y versiones.

Ejemplo de propuesta de stack:

```json
{
  "propuesta": {
    "backend": "Node.js 22 + Express 4",
    "frontend": "React 19 + Vite 8",
    "base_datos": "MongoDB 8",
    "gestor_paquetes": "npm",
    "plataformas": ["web"]
  },
  "observaciones": "Stack objetivo del primer incremento"
}
```

Ejemplo de revisión:

```json
{
  "decision": "aprobar",
  "observaciones": "Aprobado para generación"
}
```
