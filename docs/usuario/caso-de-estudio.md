# Caso de estudio: biblioteca

Este ejemplo permite reproducir el flujo con un dominio diferente al restaurante. Es un procedimiento de validación; las respuestas mostradas son ilustrativas y no se presentan como una ejecución real de IA.

## Entrada propuesta

> La biblioteca del barrio lleva préstamos en un cuaderno. Queremos una web para que el bibliotecario registre lectores, libros y ejemplares. Necesita prestar un ejemplar a un lector y registrar su devolución. No se puede prestar un ejemplar que ya tiene un préstamo activo. El lector consulta el catálogo y si hay ejemplares disponibles. El acceso a registrar préstamos y devoluciones debe estar restringido al bibliotecario. Queremos React para la web, NestJS en el backend y PostgreSQL. La alta disponibilidad queda fuera de esta primera entrega. Aún no hemos acordado cifras de latencia ni usuarios concurrentes. No queremos pagos ni multas en esta versión.

## Recorrido

1. Crea «Biblioteca del barrio» y registra el texto como fuente de entrevista.
2. Revisa descripción y transcripción.
3. Genera requisitos.
4. Comprueba funciones de lectores, catálogo, préstamos y devoluciones, además de la restricción de acceso.
5. Rechaza números RNF no acordados, pagos, multas o redundancia fuera de alcance.
6. Aprueba y genera los seis diagramas siguiendo sus dependencias.
7. Comprueba entidades Libro, Ejemplar, Lector y Préstamo, admitiendo nombres equivalentes coherentes.
8. Verifica que software incluya funciones principales y que sistema respete tecnologías y exclusiones.
9. Revisa pantallas de catálogo, registro de préstamo y devolución, y acceso si corresponde.
10. Genera mockups, corrige campos necesarios y revisa la auditoría final.
11. Descarga el documento y compara sus imágenes con el panel.
12. En codificación aprueba decisiones y genera cada entregable. Ejecuta verificación antes de aprobar y descargar el ZIP.

Los identificadores RF se asignan durante la generación; utiliza los realmente obtenidos en lugar de asumir que el préstamo siempre será RF-02.

## Criterios de aceptación

| Punto | Resultado esperado |
| --- | --- |
| Evidencia | Cada requisito explícito tiene soporte en la entrevista |
| Alcance | No se incorpora pago, multa o HA como obligación |
| Dominio | Existe una representación coherente de ejemplares y préstamos |
| Navegación | Las tareas de bibliotecario y lector son localizables |
| Mockups | Campos y acciones concuerdan con el flujo aprobado |
| Código base | Compila y completa CRUD para operaciones del contrato |
| Regla específica | El préstamo duplicado se prueba por separado; el CRUD no la certifica |

## Capturas que deben recogerse

Al ejecutar realmente el caso, guarda en `docs/assets/capturas/`:

- `01-proyecto-fuentes.png`: fuente revisada y metadatos.
- `02-requisitos.png`: RF/RNF con evidencia.
- `03-diagramas.png`: flujo y diagrama visible.
- `04-mockups.png`: pantalla con trazabilidad.
- `05-documento.png`: documento o PDF resultante.
- `06-verificacion.png`: evidencia de verificación del código.

Incluye versión del repositorio, fecha, navegador, proveedor/modelo efectivo si está disponible y observaciones en [Resultados](../pruebas/resultados.md). Oculta credenciales y datos personales. Estas imágenes no vienen incluidas porque no se realizó esa sesión de interfaz para redactar el manual.
