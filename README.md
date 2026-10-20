# I-CASE · Herramienta CASE asistida por IA

I-CASE transforma fuentes de un proyecto en requisitos, diagramas, mockups y un documento técnico revisado por fases. Incluye planificación y generación de una base de código genérica con controles de ejecución.

## Documentación

Consulta [el portal documental](docs/index.md): manual de usuario, contrato API, prompts, instalación, arquitectura, pruebas y despliegue. Se corresponde con los cuatro entregables del punto 1 de la guía APE.

Para verlo localmente, desde la raíz:

```powershell
python -m pip install -r requirements-docs.txt
python scripts/docs/sync_prompts.py
python scripts/docs/validate_docs.py
python -m mkdocs serve
```

Abre http://127.0.0.1:8000. El [contrato OpenAPI](docs/api/openapi.yaml) se puede consultar en el explorador Swagger del sitio. Para publicar, habilita GitHub Pages con GitHub Actions; el workflow de documentación construye y publica desde main.

## Funcionalidades y flujo

1. Crear proyecto, cargar texto, PDF o audio, revisar extracción y contextualizar fuentes.
2. Generar RF/RNF con evidencia, editar y aprobar.
3. Generar y aprobar seis diagramas: casos de uso, clases de dominio, arquitectura de software, arquitectura del sistema, clases de diseño y árbol de navegación.
4. Generar mockups desde la navegación, revisar cobertura, editar y aprobar.
5. Consultar auditoría y documento, descargar Markdown o construir PDF desde el navegador.
6. Revisar alcance, stack, arquitectura y estructura de código; generar backend/frontend, pruebas, infraestructura, CI/CD y paquete ZIP con verificación.

El flujo utiliza dependencias y versiones: consultar una vista no implica regenerar; cambiar una base aprobada puede invalidar descendientes. Los contratos técnicos están en [diagramas](docs/desarrollo/contratos/diagram-generation-contract.md) y [codificación](docs/desarrollo/contratos/code-generation-contract.md).

## Estado

La codificación ofrece CRUD genérico por RF y pantallas conectadas; todavía no traduce todas las reglas de negocio a modelos e invariantes específicos. Un build y un CRUD correctos no certifican el cumplimiento total del proyecto generado. El [estado y los límites](docs/index.md) y los [hallazgos actuales](docs/pruebas/resultados.md) están documentados.

## Requisitos previos

- Node.js compatible con Vite actual: se recomienda Node 22.13+ de la rama 22 o versión compatible de la rama 24; npm y Git.
- MongoDB para I-CASE.
- Claves de proveedores IA necesarios para las funciones utilizadas.
- Docker Desktop/Compose para verificar artefactos de código.
- Python para el sitio documental.

## Instalación y configuración

Terminal backend:

```powershell
cd icase-backend
npm ci
Copy-Item .env.example .env
```

Configura MONGO_URI, PORT y JWT_SECRET aleatorio en .env. Añade claves y modelos habilitados para tu cuenta. No subas ese archivo. Los ejemplos de identificadores de modelo no garantizan disponibilidad.

```powershell
npm run dev
```

El backend escucha normalmente en http://localhost:5000. Comprueba /health.

Terminal frontend:

```powershell
cd icase-frontend
npm ci
npm run dev
```

Abre la URL de Vite, normalmente http://localhost:5173. El cliente usa actualmente http://localhost:5000 en src/services/api.js; ajustar si cambia el entorno.

Detalles de variables, ejecución y resolución de problemas: [instalación](docs/desarrollo/instalacion.md).

## Dependencias principales

Backend: Express, Mongoose, Axios, bcryptjs, jsonwebtoken, Multer, pdf-parse y dotenv. Frontend: React, Vite, Tailwind, Mermaid, html2canvas y jsPDF. Versiones efectivas en package.json y lockfiles de cada módulo.

Los proveedores están encapsulados en servicios. La selección depende de entorno y disponibilidad; la documentación distingue análisis, ingesta y mockups. No se publican credenciales.

## Estructura

```text
icase-backend/src/
  core/                   Entidades, casos de uso, constantes y servicios
  interface-adapters/     Controladores y repositorios
  infrastructure/         Esquemas, prompts, proveedores y generadores
  routes/                 Endpoints
icase-backend/tests/       Pruebas
icase-frontend/src/        UI y cliente HTTP
docs/                     Documentación
scripts/docs/             Sincronización y validación documental
```

## Pruebas y compilación

En backend: `npm test -- --runInBand`. En frontend: `npm run build`. Desde raíz: `python -m mkdocs build --strict`.

Con Docker, en backend: `node scripts/verify-generic-runtime.js PostgreSQL NestJS full`. Para modelos reales, consulta el [plan](docs/pruebas/plan-y-ejecucion.md); requieren configuración y consumen cuota. El caso sintético CRUD no es una prueba de todas las reglas de negocio.

## Capturas, contribución y mantenimiento

El [caso de estudio](docs/usuario/caso-de-estudio.md) indica cómo recoger capturas reales y documentar resultados. No se presentan capturas ficticias como evidencia.

Lee [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md) y [CHANGELOG.md](CHANGELOG.md). Actualiza API/manual cuando cambie el comportamiento y sincroniza prompts desde su fuente. Conserva bases de prueba separadas, revisa invalidación de versiones y registra límites de ejecución.

No se añade una licencia de distribución sin decisión del equipo; la declaración de licencia en un package.json no sustituye ese acuerdo.
