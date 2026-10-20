# Despliegue y verificación

## Distinguir tres sistemas

1. I-CASE: frontend React, backend Express y MongoDB.
2. Documentación: sitio estático MkDocs.
3. Proyecto generado: su propio backend, frontend, persistencia e infraestructura.

Publicar GitHub Pages solo publica el segundo. El pipeline generado describe el tercero y no implanta automáticamente I-CASE.

## Ejecución local de I-CASE

Sigue [Instalación](../desarrollo/instalacion.md). Inicia MongoDB y backend, después frontend. Comprueba `/health`, acceso a la UI y un proyecto de prueba. La URL del backend aún está fija en el cliente.

## Verificar código con Docker

El equipo que ejecuta el backend necesita Docker CLI, Compose y motor activo. Comprueba:

```powershell
docker info
docker compose version
```

El verificador usa directorios y nombres temporales exclusivos. Selecciona la base de datos del manifiesto, compila, espera healthchecks y ejecuta CRUD. En la suite integral levanta también Nginx sin privilegios y Playwright con un worker.

La red de ejecución es interna, sin puertos publicados; las construcciones pueden descargar imágenes y paquetes. Se aplican límites de memoria/procesos y se descartan capacidades en servicios de aplicación. Un contenedor no equivale a una garantía absoluta para ejecutar código hostil: en un servidor compartido utiliza un worker dedicado y aislado.

Al terminar se intenta eliminar contenedores, volúmenes e imágenes de esa verificación. La caché de construcción puede permanecer. No ejecutes limpiezas globales de Docker en una máquina con otros proyectos.

Errores habituales: motor detenido, permiso de conexión, descarga lenta, imagen/modelo no disponible, dependencias incompatibles o reglas de contrato incumplidas. Revisa el paso y log; no marques manualmente como apta una ejecución fallida.

## Entrega de una aplicación generada

El ZIP incluye `ops/`, ejemplos de entorno, manifiestos y documentación de entrega. Configura secretos nuevos y revisa los Dockerfiles antes de desplegar.

La validación del paquete usa un entorno controlado y comprueba configuración Compose; no demuestra por sí sola HA, backups, TLS, todas las reglas de negocio o seguridad del despliegue final. Si el perfil HA presenta advertencias, resuélvelas antes de prometer disponibilidad.

## Publicar la documentación

Instala las dependencias documentales, ejecuta sincronización y validación, y construye con MkDocs en modo estricto. En GitHub habilita Settings → Pages → GitHub Actions.

El workflow `docs.yml` revisa las contribuciones y publica desde `main`. El sitio contiene ejemplos sin secretos. Swagger UI apunta al contrato local y requiere acceso a un backend para probar peticiones.

## Preparación de producción de I-CASE

El despliegue definitivo queda pendiente. Antes de exponer datos privados se necesita autenticación y autorización por recurso, secreto obligatorio, HTTPS, CORS restringido, URL por entorno, persistencia y backups, gestión segura de fuentes y claves, logs con redacción de datos y límites operativos.

Configura timeouts de proxy acordes con las operaciones largas o transforma esas verificaciones en trabajos persistentes. Documenta recuperación, rotación de credenciales y restauración de MongoDB antes de declarar el servicio listo.
