# Mejoras de calidad de la generación

Registro de lo que se corrigió en I-CASE a partir del análisis de la entrega generada para «Gestion y Pedidos de Restaurante» (`icase-entrega-v2`). El objetivo es que los defectos de esa entrega no vuelvan a salir **en ningún proyecto**, sin depender de lo que la IA invente en cada sesión.

Rama de trabajo: `feature/mejoras-fase1` (carpeta `icase-mejoras-fase1`). Los cambios **no están commiteados**.

## Cómo se decidió qué corregir

La entrega se copió, se compiló y se levantó con Docker. Se ejecutaron sus pruebas generadas (unitarias, integración y de navegador) y se sondeó la API y la interfaz a mano. Pasaba sus propias pruebas, pero esas pruebas solo comprueban CRUD y navegación. Los defectos que no detectaba eran:

| # | Defecto observado en la entrega | Dónde nace en I-CASE |
|---|---|---|
| 1 | El login diseñado creaba un `Usuario` en una tabla y decía «Registro creado» en vez de autenticar | Se ofrecía el RF de autenticación como destino de datos a los mockups |
| 2 | Contraseñas guardadas y devueltas en claro; usuarios duplicados (tabla de datos y `/api/users`) | No existía el concepto de «campo secreto» ni de «entidad de identidad» |
| 3 | RF-05 («cobros») guardaba en `PaquetePrepagado` aunque el diagrama tenía `TransaccionPago` | El emparejamiento RF-entidad solo comparaba palabras exactas |
| 4 | Herencias absurdas (`Usuario <|-- Mesa`) y un plato que solo podía estar en una comanda | La calidad del diagrama solo comprobaba duplicados y clases vacías |
| 5 | Solo reglas «campo obligatorio»: totales negativos, cierre anterior a apertura | No había reglas de sentido común; la IA no propone cifras que el RF no dé |
| 6 | URLs `/Sistema de… / Flujo de…`, inicio en el login, menú de cinco filas | La ruta del árbol de navegación se usaba como URL y cada pantalla era un grupo |
| 7 | Las pruebas manuales fallaban con 429 y el canal de cambios por CORS | El README de pruebas no lo decía |
| 8 | Formularios con relaciones (`cliente_id`, `mesa_id`) imposibles de guardar | Los mockups traen ids de ejemplo (`CLI-8923`) y el backend exige ids reales |
| 9 | Un mockup con comillas escapadas rompía la compilación del frontend | El sanitizador no reparaba `class=\"a\"` y la validación no lo detectaba |

## Grupo A — Identidad, login y secretos

- **Reconocimiento de identidad** (`IdentityRequirements.js`, nuevo): por patrones, no por nombres de proyecto. Detecta RF de autenticación (`autentic…`, `iniciar sesión`, `jwt`, `control de acceso`), RF de cuentas (`usuarios`) y campos de secreto (`password`, `contraseña`, `clave`, `token`, `…Hash`).
- **Contrato** (`ApplicationContractBuilder`): cada operación puede llevar `identity: 'login' | 'usuarios'`. Un RF «gestionar usuarios» solo cuenta como cuentas si su entidad tiene un campo de contraseña (los «usuarios» de un gimnasio no se tocan). El contrato expone `identity.login` e `identity.usuarios`.
- **Mockups** (`MockupBindingService`, `MockupBindingValidator`, prompts del diseñador): al diseñador se le dice que el RF de autenticación no se enlaza (`data-accion="ui"`); el validador lo marca como enlace inválido con ese motivo.
- **Frontend** (`GenericFrontendGenerator`):
  - con sesión JWT no se genera la pantalla de login diseñada (la aplicación ya trae su acceso real) y la primera ruta deja de ser el login;
  - el RF de autenticación nunca se cablea a `/api/operations/…`;
  - un RF de cuentas se cablea a `/api/users` con los nombres de esa API (`correo`→`email`, `passwordHash`/`contraseña`→`password`).
- **Secretos en la capa de datos** (`templates/data-layer/store-support.js` y los tres almacenes): los campos marcados `x-sensitive` se guardan como hash `scrypt` (mismo formato que la sesión de la aplicación) y **no se devuelven nunca**. El esquema los declara `writeOnly`.
- **Verificación** (`ArtifactVerificationService`): error si una pantalla conecta el RF de autenticación a un registro de datos.
- **Pruebas generadas** (`SamplePayload`): no comparan el secreto enviado y exigen que no se devuelva.

Archivos: `IdentityRequirements.js`, `ApplicationContractBuilder.js`, `MockupBindingService.js`, `MockupBindingValidator.js`, `GenericFrontendGenerator.js`, `templates/frontend/mockup-actions.js`, `templates/data-layer/*`, `DomainModelExtractor.js`, `BackendDataLayerGenerator.js`, `ArtifactVerificationService.js`, `SamplePayload.js`.
Pruebas: `identity-requirements`, `identity-contract`, `sensitive-fields`.

## Grupo B — Calidad del modelo

- **Sinónimos de negocio** (`DomainSynonyms.js`, nuevo): cobro/pago/transacción, copia/respaldo, restaurar/recuperación, informe/reporte, etc. Los usan el emparejamiento RF-entidad y la evidencia semántica de los mockups (antes eran dos listas distintas).
- **Emparejamiento RF-entidad** (`ApplicationContractBuilder._entityFor`): ahora «Registrar cobros» → `TransaccionPago`. Si un RF se asocia a una entidad solo por su descripción o por coincidencia parcial, se avisa en `warnings`.
- **Calidad del diagrama** (`DomainModelQualityService`): avisa de una herencia desde la entidad de cuentas hacia algo que no es una persona, y de una «parte» con dos dueños en composición (probable N:M).
- **Trazabilidad de pantallas**: cuando el mockup no trae RF guardados, el frontend usa primero la evidencia semántica (con sinónimos) antes de la heurística por nombre.

Pruebas: `domain-model-quality-relations`, `mockup-traceability`.

## Grupo C — Reglas de sentido común

`SanityRuleService` (nuevo) propone, de forma determinista y sin inventar cifras, reglas **pendientes** que la persona confirma o rechaza como cualquier otra:

- importes y cantidades (`precio`, `monto`, `total…`, `saldo`, `cantidad`, `stock`, `puntos`…) ≥ 0;
- pares de fechas (`apertura/cierre`, `inicio/fin`, `desde/hasta`, `entrada/salida`) con el fin ≥ el inicio, solo si tienen el mismo formato.

Solo entran las que el motor de reglas valida (`BusinessRuleService`). Se integran en la etapa de reglas (`CodePlanningProposalService`).
Pruebas: `sanity-rules`.

## Grupo D — Frontend, mockups y entrega

- **Rutas cortas**: la ruta del árbol de navegación ya no es la URL; se usa `/<slug-de-la-pantalla>` (sin colisiones).
- **Menú por flujo**: las pantallas se agrupan por flujo de usuario (Cliente, Mesero…) en vez de un grupo por pantalla.
- **Select de referencias con registros reales** (`ReferenceOptions.jsx`, nuevo): un campo `…_id` que el mockup dibuja como texto, oculto o select con opciones inventadas pasa a un `select` cargado con los registros de la entidad referenciada. Los campos de solo lectura (vistas de detalle) no se tocan.
- **Campos de solo lectura con placeholder**: un valor que fija el sistema (`estado`, `placeholder="pendiente"`) se envía.
- **Mockups**: aviso por formulario `crear` de los campos de la operación sin control; el prompt pide un control por campo.
- **Comillas escapadas** (`class=\"a\"`): el sanitizador las repara y la validación rechaza los restos ya almacenados (antes llegaban al frontend y rompían la compilación).
- **Pruebas generadas**: la prueba de contrato elige una pantalla que tenga operación; la de la vista diseñada espera las opciones de los select, crea el registro padre y vuelve a abrir la pantalla; el README explica `HTTP_RATE_MAX`, `AUTH_RATE_MAX` y `CORS_ORIGINS`; `DELIVERY.md` aclara que `/api/docs` requiere sesión.

Pruebas: `identity-contract`, `escaped-quotes`, `designed-ui-verification`.

## Regeneración de artefactos

Se subieron los marcadores de contrato para que los artefactos guardados se regeneren: backend `capacidades-v18-identidad-secretos`, pruebas `pruebas-v11-identidad-rutas`, frontend `frontend-v20-referencias`.

**Los mockups y diagramas ya guardados no se corrigen solos.** Hay que regenerarlos en su fase:
- los mockups cuyos campos se diseñaron contra el emparejamiento antiguo (por ejemplo el cobro de RF-05);
- el mockup «Vista de Copias de Seguridad» de «Gestion y Pedidos de Restaurante», guardado con atributos corruptos;
- los diagramas con herencias sospechosas (ahora avisan, pero no se reescriben).

## Verificación

- Suite completa de `icase-backend`: **1336 pruebas pasan**, 1 omitida y 18 fallan. Esos 18 fallos están en 9 archivos de requisitos y diagramas (`requirement-*`, `use-cases`, `diagram-prompt-context`, `approved-requirements-sidebar`) y **ya fallaban antes de estos cambios**; no se tocó esa área.
- Prueba en vivo con los datos reales del proyecto: se generaron backend, frontend y pruebas, se levantaron con Docker Compose (Postgres) y se ejecutaron las pruebas generadas:
  - integración: 51 pasan, 1 omitida, 0 fallos;
  - navegador: 26 pasan, 1 omitida y 2 fallan (la «Vista de Detalle de Mesa» y el cobro de RF-05, descritos en los límites; en la entrega original fallaba 1 y el resto pasaba con datos que no comprobaban nada de lo anterior);
  - sondas manuales: cierre anterior a apertura, total negativo y precio negativo ahora responden 422; la contraseña no se devuelve y en la base queda como `scrypt$…`.

## Límites conocidos

- **Solo Node (Express/Nest).** Los secretos hasheados y los select de referencias están hechos para el backend Node; el backend Spring no los incluye.
- **Las operaciones de datos de identidad siguen existiendo** (por ejemplo `rf-13` como tabla), aunque la interfaz ya no las usa para cuentas ni login. No se convirtieron en solo lectura.
- **Pantallas de detalle con datos de ejemplo enlazadas a `crear`** (por ejemplo «Vista de Detalle de Mesa» → `RF-15.crear` con `cliente_id` de solo lectura `CLI-8923`) siguen fallando la prueba de la vista diseñada: es un problema de diseño del mockup (debería ser `editar`), no del generador.
- **Cobro de RF-05**: el mockup guardado fue diseñado con la entidad anterior; falla la prueba hasta regenerarlo.
- Los select de referencias leen hasta 100 registros.
- El idioma de los patrones es el español; un dominio con otro vocabulario puede no coincidir con algún patrón.
- La variación de la IA (cantidad y estilo de mockups, profundidad de los RF) no se elimina; lo que se asegura es que los defectos de arriba no dependan de ella.
