# Verificación de la documentación

Fecha: 20/10/2026. Base Git: `b5613be`, con la documentación de esta entrega todavía sin commit.

Esta evidencia corresponde al portal y al contrato documental. No se ejecutaron nuevas llamadas a proveedores IA ni una sesión autenticada completa del producto para redactarlo.

| Comprobación | Resultado observado |
| --- | --- |
| Sincronización de plantillas | Doce referencias generadas desde las plantillas reales; hashes y enlaces en el catálogo |
| python scripts/docs/sync_prompts.py --check | Correcto |
| python scripts/docs/validate_docs.py | OpenAPI válido, 60 operaciones HTTP cubiertas y enlaces Markdown correctos |
| python -m mkdocs build --strict | Build correcto; HTML generado en site/ |
| python scripts/docs/validate_docs.py --site | Enlaces de recursos y páginas HTML locales correctos |
| Captura de acceso | Imagen real inspeccionada; Edge headless 1440 × 1000, perfil temporal sin sesión |

El contraste de rutas es estático contra los siete routers de Express y el endpoint de salud. No sustituye pruebas HTTP de cada controlador. El validador OpenAPI verifica estructura y referencias; los esquemas se redactaron contrastando rutas y controladores y admiten campos adicionales.

Se validaron los enlaces locales del sitio, no la disponibilidad futura de enlaces externos o del CDN de Swagger. La publicación GitHub Pages está preparada, pero no se ejecutó un despliegue desde esta sesión.

Las capturas restantes del caso de estudio, una prueba de carga y los resultados IA por modelo efectivo quedan pendientes y se identifican en resultados.md. No se presentan como realizadas.
