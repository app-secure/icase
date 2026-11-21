# Guía de prueba: sistema de ventas y facturación

Aplicación pequeña para probar I-CASE de punta a punta y para la presentación. Insumo: [entrevista_tienda_ventas.txt](entrevista_tienda_ventas.txt).

**Qué tiene el insumo a propósito**
- Una sola plataforma (web) y dos roles (administrador y vendedor): pocas pantallas y generación rápida.
- Pila fijada de forma explícita: Node.js + Express, PostgreSQL, React + Tailwind, JWT. Nada más.
- Entidades claras: Producto, Cliente, Usuario, Venta, DetalleVenta (venta con varias líneas) y Factura (una por venta).
- Reglas medibles: stock suficiente, producto desactivado no se vende, IGV 18 %, numeración F001-00001, anulación que devuelve stock, stock bajo = menos de 5.
- Alcance acotado y pendientes marcados (frecuencia de copias, tiempo de recuperación, SUNAT): sirve para enseñar cómo la herramienta no inventa lo que no se decidió.

## 1. Cómo se espera que salga cada fase

Fase de prueba con Haiku 4.5 (análisis): 90 s y ≈ US$ 0,13. Estos números salen de una ejecución real con este insumo.

| Fase | Qué debes ver | Si no sale así |
|---|---|---|
| Fuentes | Un insumo cargado (pega el texto o sube el .txt) | — |
| Análisis inicial | 2 actores (Administrador, Vendedor); ≈ 12 necesidades funcionales; 4 no funcionales (seguridad, validación, < 2 s con 10 usuarios, usabilidad); 3 decisiones fuera de alcance (pagos en línea, varias sucursales, SUNAT); 2 preguntas pendientes (frecuencia de copias y tiempo de recuperación); reglas de negocio (stock, IGV, anulación) | Falta una regla o aparece un actor «Cliente»: es un fallo del análisis (ver §4) |
| Requisitos | ≈ 10 RF + 4 RNF, cada RF con un actor y criterios de aceptación | RF con actor equivocado o duplicados |
| Diagramas | Clases de dominio con Venta *-- DetalleVenta, Venta - Factura (1 a 1), Cliente, Producto, Usuario; árbol de navegación con 1 aplicación web (sin móvil) | Una aplicación móvil o más de 25 pantallas: revisa el árbol |
| Mockups | ≈ 15 pantallas; las de Producto, Cliente, Usuario, Venta y Factura con listado y formulario; reportes con filtro de fechas | Muchos «sin enlace»: usa «Enlazar» o «Solo interfaz» |
| Decisiones de codificación | Backend Express, PostgreSQL, JWT, roles administrador y vendedor; el vendedor con alcance «propios» en ventas | Un rol de más o permisos al revés |
| Especificación de la aplicación | Operaciones: registrar venta (con líneas), emitir factura, anular venta (transición), stock bajo (consulta con filtro `stock < 5`), reportes con rango de fechas | Falta la venta con líneas: confirma las operaciones derivadas |

## 2. Pasos para probar

1. **Preparar.** Backend y frontend en marcha, `MOCKUP_CONCURRENCY=3` y el reparto de modelos de tu `.env` (Haiku para pantallas simples y Kimi K3.1 con Sonnet de respaldo para las densas).
2. **Crear el proyecto** «Ventas y facturación» y cargar el insumo.
3. **Análisis inicial.** Compara con la tabla; corrige solo lo que falte, con el botón «Corregir con IA». Aprueba.
4. **Requisitos.** Revisa que cada RF nombre a su actor. Aprueba.
5. **Modelamiento.** Aprueba los seis diagramas en orden. Revisa el árbol: una sola aplicación web, listados y formularios por entidad.
6. **Mockups.** Genera todos. Marca los controles «sin enlace» con los botones de la pantalla. Aprueba.
7. **Codificación.** Aprueba cada decisión. En «Comportamiento de la aplicación» confirma las operaciones derivadas (en especial las de la venta con líneas y la anulación).
8. **Generación y entrega.** En este orden: backend → frontend → pruebas → infraestructura → pipeline → paquete final. Verifica cada pieza con Docker.
9. **Ejecutar.** Con el paquete aprobado, «Ejecutar el proyecto en Docker» o `node tools/preview-local.cjs start` en el ZIP descomprimido.
10. **Prueba manual (5 minutos)**:
    - Entra como administrador: crea 3 productos y 2 clientes.
    - Entra como vendedor: registra una venta con 2 productos; emite su factura (F001-00001, subtotal, IGV 18 %, total).
    - Comprueba que el stock bajó; intenta vender más de lo que hay (debe rechazarlo).
    - Como vendedor, intenta anular la venta o cambiar un precio (no debe poder).
    - Como administrador, anula la venta: el stock vuelve y la factura queda anulada.
    - Reporte de ventas por fechas y productos más vendidos con esos datos.
    - Abre `/api/docs`, inicia sesión y prueba una operación.

**Criterio de «apenas errores»**: el paquete aprueba la verificación en Docker sin errores de compilación y sin pruebas rotas, y la prueba manual de arriba pasa completa.

## 3. Bucle para mejorar la generación con este insumo

Repite hasta que la prueba manual y la verificación pasen sin intervención.

1. **Reproducir sin guardar nada** (rápido; usa el proyecto ya aprobado):
   ```powershell
   cd icase-backend
   $env:DRY_CONFIRM_DERIVED=1; $env:JWT_SECRET="x-dev-secret-0123456789"
   node scripts/_dry-generate.cjs <idDelProyecto> ..\salida-ventas
   ```
   Genera backend y frontend (con `DRY_TESTS=1`, también las pruebas) en la carpeta indicada.
2. **Levantarlo y probar las operaciones**: copia `salida-ventas` a una carpeta con su `ops/` (la del paquete descargado sirve), levanta Docker y ejecuta `node scripts/_smoke-actions.cjs http://localhost:<puerto>`: llama a cada operación confirmada con datos de ejemplo.
3. **Clasificar el fallo y corregirlo donde nace**:

| Síntoma | Dónde se corrige |
|---|---|
| El análisis omite una regla o inventa un actor | `src/infrastructure/prompts` (analista) o el propio insumo |
| Árbol con pantallas de más o nombres con verbos | `prompts/disenador_arquitectura.md` y `NavigationTreeReview.js` |
| Mockup mezcla formulario y listado, o botones sin enlace | `MockupScreenRole.js`, `MockupContentLint.js`, `MockupContentRepair.js` |
| La operación de la especificación no sale o sale mal (venta con líneas, anulación, stock bajo) | `ApplicationSpecService.js` y su prompt (`analista_especificacion_aplicacion.md`) |
| Error 403 o un rol no ve su pantalla | `GenericBackendGenerator.js` (`_syncActionPermissions`, `_limitScopes`) |
| Pantalla sin datos, botón que no guarda, filtro que no filtra | Plantillas `templates/frontend` (`live-tables.js`, `mockup-actions.js`) |
| Fallo de compilación o de arranque en la verificación | Mensaje de «Dónde está el error» en la pieza; corrige la plantilla correspondiente |

4. **Cada corrección lleva su prueba** en `icase-backend/tests` y se comprueba con `npx jest` (los fallos preexistentes del repositorio son de módulos de requisitos y no cuentan).
5. **Volver a generar solo lo afectado** y repetir desde el paso 1.

## 4. Si algo del insumo no se entiende bien

Ajusta el texto del insumo antes de tocar el código: una frase explícita («un vendedor solo ve las ventas que él registró») es más eficaz que una regla nueva. Los puntos más sensibles de este insumo son:
- La venta con varias líneas y el descuento de stock.
- La factura única por venta y su numeración.
- La anulación (devuelve stock y marca la factura).
- «Solo ve sus propias ventas» (alcance por propietario).

## 5. Sugerencia para la presentación

- Muestra el insumo (una conversación real), el análisis con sus pendientes, y deja que la herramienta genere mientras explicas las fases.
- Usa los tiempos de §1 como referencia: el análisis ronda 90 s y los mockups, unos 2 minutos con 3 pantallas en paralelo.
- Termina con la prueba manual de 5 minutos sobre la aplicación en Docker.
