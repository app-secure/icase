# Instalación y mantenimiento local

## Requisitos

- Node.js compatible con las dependencias de Vite; para una base común se recomienda Node 22.13 o superior de la rama 22, o una versión compatible de la rama 24.
- npm y Git.
- MongoDB accesible para **la propia herramienta I-CASE**, aunque el proyecto generado elija PostgreSQL.
- Una credencial válida de proveedor para ejecutar las funciones IA que se utilizarán.
- Docker Desktop con contenedores Linux y Compose para verificar código generado.
- Python para construir documentación; no es una dependencia del producto Node.js.

Consulta los `package.json` y lockfiles de backend/frontend para las dependencias efectivas. No mezcles el stack de I-CASE con el de una aplicación exportada.

## Instalación

Desde la raíz del repositorio, abre una terminal para backend:

```powershell
cd icase-backend
npm ci
Copy-Item .env.example .env
npm run dev
```

Antes de iniciar, edita localmente `.env`: fija `MONGO_URI`, `PORT`, un `JWT_SECRET` aleatorio y solo las claves/modelos realmente disponibles. El backend usa normalmente puerto 5000.

En otra terminal:

```powershell
cd icase-frontend
npm ci
npm run dev
```

Abre la URL que muestre Vite, normalmente `http://localhost:5173`. Si se modifica el puerto del backend, ajusta su referencia en `icase-frontend/src/services/api.js`: actualmente usa una URL local fija.

Comprueba `GET http://localhost:5000/health`. Ese endpoint acredita respuesta del proceso, no una transacción de negocio ni conectividad con todos los proveedores.

## Variables y servicios

| Variable/grupo | Propósito |
| --- | --- |
| PORT, MONGO_URI | Puerto Express y conexión de persistencia de I-CASE |
| JWT_SECRET | Firma de tokens; el código contiene un valor de respaldo que no debe usarse al desplegar |
| *_API_KEY | Claves privadas por proveedor |
| AI_PROVIDER, AI_PROVIDER_ORDER | Selección y orden del análisis |
| *_ANALYSIS_MODELS, *_INGESTION_MODELS | Catálogos de modelos según tarea |
| MOCKUP_IA_PROVIDER, *_MOCKUP_MODELS | Generación de mockups |
| MOCKUP_PROMPT_FILE | Archivo de plantilla visual |
| AI_* / MOCKUP_CIRCUIT_* | Reintentos, presupuestos y circuitos |
| N8N_WEBHOOK_URL | Configuración de orquestación; verificar si el flujo instalado realmente la invoca |

Consulta todas las claves y comentarios en `icase-backend/.env.example`. No copies `.env` al repositorio ni al sitio. Reinicia el backend después de cambiar variables.

## Ejecución y compilación

```powershell
# En icase-backend
npm start
npm test -- --runInBand
# En icase-frontend
npm run build
npm run preview
```

`preview` permite revisar el bundle, no sustituye una configuración productiva.

## Documentación

Desde la raíz:

```powershell
python -m pip install -r requirements-docs.txt
python scripts/docs/sync_prompts.py
python scripts/docs/validate_docs.py
python -m mkdocs serve
```

Para obtener HTML:

```powershell
python -m mkdocs build --strict
```

El sitio queda en `site/`. El workflow de documentación valida PR y publica al integrar a `main`, una vez habilitado GitHub Pages con GitHub Actions. El sitio de documentación no despliega I-CASE.

## Mantenimiento

Usa ramas y PR; modifica documentación junto al comportamiento. Revisa cambios de formatos, invalidación y contratos antes de actualizar generadores. Prueba con dominios diferentes para detectar acoplamientos accidentales. Conserva copias de MongoDB y archivos de fuentes antes de migrar; elimina tokens y datos personales de evidencias.
