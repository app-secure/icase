# Contrato de generación de código

Este contrato es la base común de los módulos de código, pruebas, infraestructura y entrega. Ningún generador modifica el flujo ni aprueba su propio resultado.

## Stack predeterminado y soporte actual

- Plataforma predeterminada: web; existe una base Expo opcional para móvil.
- Backend: Node.js + Express o NestJS según selección compatible.
- Frontend: React + Vite.
- Base de datos: MongoDB, PostgreSQL o MySQL según selección compatible.
- Gestor de paquetes: npm.
- El andamiaje, las configuraciones y los pipelines salen de plantillas deterministas.
- La implementación actual genera CRUD por RF mediante reglas locales. La síntesis de reglas específicas del dominio mediante IA es una mejora pendiente, no una capacidad certificada.

El stack se propone por proyecto y requiere aprobación antes de avanzar. Estos valores son la propuesta predeterminada, no una aprobación automática.

## Etapas y compuertas

1. `alcance_plataforma`: confirma web, exclusiones y límites de entrega.
2. `stack_tecnologico`: confirma herramientas, versiones y restricciones.
3. `arquitectura_codigo`: confirma capas, módulos, contratos y decisiones técnicas.
4. `estructura_carpetas`: confirma el árbol que compartirán los generadores.
5. `generacion_backend` y `generacion_frontend`: pueden ejecutarse en paralelo.
6. `generacion_pruebas` y `generacion_infraestructura`: consumen ambos códigos aprobados.
7. `generacion_ci_cd`: consume pruebas e infraestructura aprobadas.
8. `paquete_entrega`: reúne únicamente artefactos vigentes y aprobados.

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

## Evidencia de ejecución

### Contrato de capacidades y alcance

GenerationCapabilityService declara los diez módulos funcionales pendientes con versión, dependencias, configuración, stacks implementados, archivos y tipos de prueba. Una capacidad pendiente no se activa al declararla.

La propuesta de Módulos admite `cobertura` con `modo_entrega` (parcial o completa), `aceptar_pendientes` y declaraciones por RF. Cada declaración contiene requisito, tipo (crud o personalizado), capacidades, confirmado, justificacion y huella_requisito. La huella se obtiene del servidor y vincula la confirmación al texto y campos actuales del requisito.

GenerationCoverageService evalúa las declaraciones contra operaciones y entidades por identificador exacto; no utiliza asociación por posición. El informe v2 conserva los contadores históricos por compatibilidad, pero no los presenta como certificación funcional.

La generación, aprobación y descarga del paquete comprueban el alcance. El informe debe coincidir con el contrato del backend y la evidencia técnica debe corresponder a la huella de archivos actual. La entrega parcial exige reconocimiento explícito y conserva los pendientes en DELIVERY.md y delivery-manifest.json.

La verificación estructural no habilita la aprobación por sí sola. Para backend, frontend, pruebas y paquete final se exige una evidencia asociada a la huella exacta de sus archivos. La verificación:

1. prepara los archivos en un directorio temporal exclusivo;
2. construye backend, frontend y, si aplica, el bundle móvil;
3. levanta la base de datos seleccionada, backend y frontend en una red Docker interna;
4. espera los `healthcheck`;
5. ejecuta CRUD para las operaciones del contrato, la suite de integración y las pruebas de navegador;
6. destruye contenedores, volúmenes e imágenes temporales.

Si Docker no está disponible o cualquiera de esos pasos falla, el artefacto queda `fallida` y no se puede aprobar ni exportar.

Para `paquete_entrega` se añade un segundo arranque con `ops/docker-compose.yml` y sus Dockerfiles originales. Un overlay temporal aísla red/puertos y añade los ejecutores; las credenciales son de prueba. Se valida previamente que no haya montajes externos, volúmenes ajenos, privilegios ampliados ni builds que sobrescriban imágenes del usuario. La aprobación exige `verificacion.protocolo_despliegue === 'compose-exportado-v1'` para la huella actual, además del alcance funcional. Las evidencias anteriores deben renovarse. Este protocolo no sustituye pruebas de producción ni certifica código hostil como seguro.

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

La base NestJS del generador es **12.3.2**, fijada en `@nestjs/common`, `@nestjs/core` y `@nestjs/platform-express`. Requiere Node.js **22.12+ o 24+**, usa tipos Express 5 y conserva compilación CommonJS. `NestRuntimePolicy` centraliza la versión; un stack con otra versión explícita debe revisarse y aprobarse antes de regenerar. El manifiesto exportado registra la versión del framework y el motor Node. Cambiar la base invalida la caché del backend generado y exige renovar sus pruebas; no migra bases de datos ni ZIP existentes.

Ejemplo de revisión:

```json
{
  "decision": "aprobar",
  "observaciones": "Aprobado para generación"
}
```

## Eventos de cambios: integración experimental React/Expo

El módulo opcional `eventos_cambios` está desactivado por defecto. Si se activa en modo personalizado, genera Socket.IO 4.8.4 para Express/NestJS con JWT; Spring y API sin JWT se rechazan expresamente. `backend/CHANGE-EVENTS.md` y el manifiesto detallan el protocolo: `auth.token`, `subscribe` (claves del contrato, ack `ok`) y `records:changed` con `operation`/`method`, sin datos de registros.

Se revalidan sesión y permisos GET antes de cada aviso. Los eventos son invalidaciones de CRUD exitoso, de mejor esfuerzo y de un solo proceso. No cubren N:M, SQL externo, replay o colas durables. Los límites de suscripciones/conexiones están acotados. La distribución no bloquea la respuesta CRUD y puede descartar avisos: el cliente deberá reconsultar por HTTP y resincronizar después de reconectar.

React y Expo se suscriben a la operación visible y reconsultan por HTTP ante avisos válidos; no interpretan el mensaje como un registro. Se agrupan ráfagas y se evita solapar las consultas del canal. Reconectar vuelve a suscribir y reconsultar para recuperar cambios perdidos. Desmontar la vista o cambiar/cerrar sesión desconecta el socket y elimina sus listeners. Expo pausa en segundo plano y reconecta al volver a primer plano; React vuelve a intentar al recibir el evento `online` del navegador.

Vite y Nginx (exportado y de verificación) incluyen `/socket.io/` con actualización WebSocket. El entorno exportado debe configurar `CORS_ORIGINS` con el origen real de la web. Expo requiere `EXPO_PUBLIC_API_URL` accesible desde el dispositivo; `localhost` del teléfono no apunta al servidor. En producción se requiere HTTPS/WSS y un solo proceso backend para este módulo.

Se genera `tests/e2e/change-events.spec.js`: dos usuarios distintos, dos contextos de navegador, escritura HTTP autenticada del segundo usuario, actualización automática de las vistas, PATCH/DELETE y recuperación tras desconexión sin recarga. Si el contrato no tiene un campo textual libre, la suite indica explícitamente que ese caso no se pudo aplicar; no acredita el canal por omisión. El script `node scripts/verify-change-events-runtime.js Express` (o `NestJS`) prueba una biblioteca aislada con PostgreSQL, React, bundle Android Expo y el Compose exportado, sin usar las claves ni la base de la plataforma.

No acredita la capacidad completa `tiempo_real`: siguen fuera N:M, replay, push, chat, múltiples réplicas y garantías de entrega/latencia. Compilar Expo no demuestra funcionamiento en un dispositivo. Las huellas de generación de backend, frontend, pruebas e infraestructura cambian para exigir nueva generación/verificación; no se modifican entregas existentes.
