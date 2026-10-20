# Contribuir a I-CASE

## Preparación

Lee README.md, la instalación y los contratos en docs/desarrollo/contratos/. Usa una base de datos de desarrollo y credenciales personales fuera de Git. Consulta incidencias y coordina cambios de formatos antes de modificar generadores.

## Ramas y commits

Parte de main actualizado y crea una rama con un propósito completo: feature/nombre, fix/nombre o docs/nombre. Evita subir directorios de entregas de prueba, node_modules, .env, uploads o bundles.

Escribe commits descriptivos: feat: añade ..., fix: corrige ..., docs: explica .... Conserva cambios ajenos y no reescribas historia compartida sin acuerdo.

## Pull request

Explica problema, comportamiento final, alcance, limitaciones y pruebas ejecutadas. Adjunta capturas reales para cambios visuales. Pide revisión a otra persona. No apruebes tu propia generación como evidencia de negocio.

Cuando cambies endpoints actualiza OpenAPI; cuando cambies flujos actualiza manual y contratos; si cambias prompts sincroniza las referencias documentales.

## Comprobaciones

Backend: npm test -- --runInBand. Frontend: npm run build. Documentación desde raíz: python scripts/docs/sync_prompts.py --check, python scripts/docs/validate_docs.py y python -m mkdocs build --strict. Ejecuta pruebas Docker cuando el cambio afecte los generadores o su verificación.

No publiques resultados no ejecutados. Documenta los pasos omitidos y su causa. Para seguridad consulta SECURITY.md.
