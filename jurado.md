# Decisiones y correcciones aplicadas a la generación de código

**Hallazgos 1 a 7 y extras**

Proyecto I-CASE · rama feature/fase3-mockups-jsx-y-docker

## 1. Resumen

Se atendieron siete hallazgos sobre la fase de codificación de I-CASE: diferencias entre el mockup aprobado y la aplicación generada, asociaciones de requisitos, permisos y pruebas. Cada hallazgo se verificó contra el código antes de corregirlo, se cubrió con pruebas que fallaban antes del cambio y, en los cambios de riesgo alto, se sometió a una revisión independiente que encontró defectos reales, corregidos en una ronda.

Resultado: 17 commits sobre c7a6d6d, suite del backend con 1078 pruebas aprobadas y 1 omitida, y documentación con validación y compilación estrictas correctas.

| **Hallazgo** | **Tema** | **Estado** |
|----|----|----|
| 1 | El mockup y la aplicación funcional estaban separados | Resuelto con enlaces declarados y validados |
| 2 | Se perdía parte del diseño visual al convertir el mockup | Resuelto |
| 3 | El transformador podía generar JSX que no compila | Resuelto |
| 4 | Asociación incorrecta entre pantallas y requisitos | Resuelto |
| 5 | Cada RF se convertía en un CRUD completo | Resuelto, con límites (sección 5) |
| 6 | Reescritura de relaciones N:M y permisos auxiliares abiertos | Resuelto |
| 7 | Las pruebas no acreditaban el mockup convertido | Resuelto, sin comparación visual |
| Extra | Enlace «Procesos» que no se insertaba | Resuelto |
| Extra | Caché del frontend sin los requisitos en su huella | Resuelto |

## 2. Hallazgos y correcciones

### Hallazgo 1. El mockup y la aplicación funcional estaban separados

**Problema.** El mockup se convertía a JSX como una representación estática. El transformador eliminaba los eventos originales, lo cual es correcto por seguridad, pero no los reemplazaba. Un botón como «Confirmar reserva» se veía bien y no ejecutaba nada: la funcionalidad quedaba en un panel de datos genérico aparte.

**Decisión.** Quien genera el mockup declara qué operación ejecuta cada control con un atributo `data-accion="RF-03.crear"` (requisito más verbo: consultar, crear, editar o eliminar) y un validador determinista lo comprueba. Se descartó deducir el enlace con reglas fijas por texto, porque fallan con textos y diseños no previstos. Los controles sin marca no se conectan nunca: se reportan como «sin enlace». La marca `data-accion="ui"` identifica los controles solo visuales.

**Corrección.**

- Validador de enlaces: comprueba que el requisito exista y esté aprobado, que el verbo sea válido, que la operación admita el método y que los campos del formulario existan en el esquema.

- Persistencia aditiva del campo `enlaces` en cada mockup, integrada al generar y al editar un mockup a mano. Los avisos no bloquean la aprobación y un mockup sin ningún enlace queda intacto.

- Los tres prompts de mockups (completo, compacto y el reducido) piden los enlaces, y el contexto incluye las operaciones disponibles con los nombres de campo reales.

- Runtime de acciones en el frontend generado: crear, consultar, editar y eliminar, con permisos de sesión, confirmación al eliminar y el resultado en la propia pantalla.

- Editar y eliminar actúan sobre el registro que el usuario selecciona en la tabla de resultados de la consulta, que además rellena el formulario por su nombre de campo.

- El panel «Gestión de Datos» se conserva como herramienta auxiliar.

**Decisión sobre la identificación del registro.** No se pide `data-id` en el prompt. Los identificadores que aparecen en las filas de un mockup son datos de ejemplo: un botón «Eliminar» sobre «Sala A» habría enviado un DELETE con un id inventado y podía borrar otro registro. El identificador siempre proviene del backend.

### Hallazgo 2. Pérdida del diseño visual

**Problema.** La conversión descartaba los bloques de estilo, las clases del body y la configuración de Tailwind. Los enlaces internos recargaban la página, el contenedor limitaba el ancho a 1200 px y la cabecera de la aplicación duplicaba el menú del mockup.

**Decisión.** Nunca se copia un script del mockup. El sanitizador conservaba cualquier script que contuviera la cadena `tailwind.config`, lo que permitía código arbitrario en una aplicación que guarda un token en el navegador. La configuración se lee como datos con un analizador estricto que solo admite objetos, arreglos, cadenas, números y booleanos.

**Corrección.**

- El CSS de cada mockup va a un archivo propio, con cada selector acotado a su pantalla. Se eliminan las importaciones y las cargas externas, se descartan las reglas de efecto global y se renombran las animaciones para no pisar las del resto de la aplicación.

- Las clases y el estilo del body pasan al contenedor del mockup.

- La configuración de Tailwind se aplica en el index.html generado, y se deriva del sistema de diseño cuando el mockup no la trae. El sanitizador conserva únicamente esos datos, normalizados.

- Los enlaces internos a pantallas conocidas pasan a ser enlaces del enrutador, sin recarga.

- La pantalla diseñada usa un contenedor sin ancho máximo. Si el mockup trae su propio menú, la cabecera oculta su menú de módulos y conserva la marca, la sesión y el acceso del administrador a Usuarios.

- El contrato de generación del frontend se actualizó para que los frontends ya generados se regeneren con estos cambios.

**Revisión independiente.** Encontró fallos en el análisis del CSS (una llave dentro de una cadena dejaba reglas sin acotar y varias funciones cargaban recursos externos) y en la cabecera (ocultaba el enlace a Usuarios). Todos se corrigieron con pruebas.

### Hallazgo 3. JSX que no compila

**Problema.** La serialización de atributos usaba directamente el texto con comillas, lo que producía JSX inválido cuando un valor contenía comillas. Los campos con `value` fijo y sin manejador quedaban de solo lectura.

**Corrección.** Los atributos con comillas, barras invertidas, ampersand o saltos de línea se emiten como expresión. En `input`, `textarea` y `select`, `value` pasa a `defaultValue` (las casillas y los botones de opción conservan `value`) y `checked` pasa a `defaultChecked`.

### Hallazgo 4. Asociación entre pantallas y requisitos

**Problema.** La inferencia buscaba los campos `codigo` o `id_requerimiento`, pero los requisitos reales usan `identificador`. Cuando no encontraba coincidencia podía asignar el requisito de otra pantalla sin relación de significado.

**Decisión.** Es preferible declarar una asociación pendiente que inventarla para superar la validación.

**Corrección.** Se lee `identificador` (los nombres anteriores quedan como respaldo), se excluyen los requisitos no funcionales y se eliminaron los respaldos que heredaban el requisito de otra pantalla.

### Hallazgo 5. Cada RF se convertía en un CRUD completo

**Problema.** Cada requisito recibía GET, POST, PATCH y DELETE, aunque fuera una consulta como «Consultar reportes». Además, ninguna ruta generada comprobaba los métodos de la operación, por lo que estrecharlos solo cambiaba el contrato.

**Decisión.** Los métodos salen de los verbos válidos que declaran los mockups aprobados: siempre GET más los declarados, y sin enlaces se mantiene el CRUD completo. Se eligió aplicarlo mediante el contrato y los permisos, sin bloquear las rutas.

**Corrección.**

- El constructor del contrato recibe los verbos por requisito y el backend se regenera cuando los mockups cambian, sin invalidar los proyectos que no declaran enlaces.

- Mantienen el CRUD completo las operaciones de soporte, las entidades de relaciones N:M, las entidades padre de otra operación y todas las operaciones si hay un módulo activo que usa PATCH (archivos, pagos de prueba o procesos).

- El OpenAPI documenta solo los métodos declarados, los permisos de cada rol se recortan a los métodos de la operación y un rol no administrador recibe 403 al intentar otro.

- La verificación y la cobertura exigen GET y métodos válidos en lugar de los cuatro.

- Las pruebas generadas y el smoke ejercen únicamente lo declarado, y las pruebas de propiedad de registros y de integridad referencial omiten las operaciones que ya no admiten POST o DELETE.

- El artefacto del backend avisa qué requisitos quedaron con métodos reducidos.

**Revisión independiente.** Encontró un defecto real: la prueba de propiedad de registros intentaba crear en una operación hija reducida y recibía 403. También señaló que el formulario de las pruebas podía apuntar a la operación equivocada en pantallas con varias operaciones y que el smoke suponía POST y DELETE. Todo se corrigió en una ronda y se reprodujo con un backend real por HTTP.

### Hallazgo 6. Relaciones N:M y permisos auxiliares

**Problema.** Una relación aprobada podía terminar con un extremo sustituido por una entidad vecina (Autor y Libro pasaba a Perfil y Libro) para facilitar la generación de endpoints. Además, el respaldo de permisos de las operaciones de soporte concedía CRUD con alcance «todos» a todos los roles.

**Corrección.** Se eliminó la reescritura de extremos: la entidad sin requisito propio recibe una operación de soporte. Las operaciones de soporte heredan los permisos de su operación par y, si el par no tiene, no conceden nada. Se actualizó una prueba existente que fijaba la reescritura como comportamiento esperado.

**Revisión independiente.** Confirmó que el administrador conserva acceso a las operaciones de soporte y que el respaldo anterior era una escalada de privilegios, porque abría la operación a todos los roles cuando el par era solo para administradores.

### Hallazgo 7. Las pruebas no acreditaban el mockup convertido

**Problema.** Las pruebas de navegador cambiaban al panel de datos antes de probar el formulario, y la verificación estructural aprobaba páginas estáticas porque el archivo de sesión siempre contiene un `fetch`.

**Corrección.**

- La segunda prueba de navegador generada también cambia de vista antes de buscar el formulario.

- La verificación exige que algún archivo distinto de la sesión llame a la API.

- El manifiesto del frontend resume por pantalla los enlaces válidos, inválidos y visuales, los controles sin enlace, los cableados y las acciones.

- La verificación avisa por pantalla de la vista diseñada que no ejecuta ninguna acción del backend, sin bloquear, y falla si el manifiesto declara enlaces cableados que la página no ejecuta.

- Se genera una prueba de navegador sobre la interfaz diseñada para los enlaces de crear y consultar: rellena los campos del mockup, pulsa el control y comprueba el resultado en pantalla y que el registro quedó persistido.

- La página diseñada se prueba con React en un DOM simulado contra el backend generado real: crear, consultar, seleccionar, editar, eliminar y el rechazo de un registro inválido.

### Extras

**Enlace «Procesos».** La inserción buscaba una cadena exacta que ya no coincidía con la cabecera, así que la ruta existía sin enlace. Ahora se localiza con una expresión regular sobre la cabecera actual y, si no encuentra el punto de inserción, la generación falla en lugar de omitirlo en silencio.

**Caché del frontend.** La huella de entrada no incluía los requisitos aprobados, pese a que se usan para inferir asociaciones. Se incorporaron y se actualizó el contrato de generación.

**Otros cambios.** Se sincronizaron siete copias de prompts de la documentación que ya estaban desactualizadas, se redactó el contrato de enlaces de mockups en la documentación técnica y se registró la especificación y el seguimiento de las tareas en la carpeta odd, que no se versiona.

## 3. Decisiones tomadas

| **Tema** | **Opciones** | **Elegida** | **Motivo** |
|----|----|----|----|
| Quién declara el enlace de un control | El generador del mockup con validación, o reglas fijas | El generador del mockup, con validación estricta | Es fiel al diseño y se comprueba contra los requisitos y los campos reales. Las reglas fijas fallan con textos no previstos. |
| Cómo identificar el registro al editar o eliminar | Pedir data-id en el prompt, o usar el registro seleccionado en la consulta | Registro seleccionado | Los ids de un mockup son de ejemplo y podían borrar otro registro. |
| Cuánto aplicar los métodos por operación | Contrato y permisos, o también bloqueo en las rutas | Contrato y permisos | La política de permisos es compartida por las tres pilas. El bloqueo en rutas exige tres implementaciones, una de ellas en Java. |
| Scripts del mockup | Copiarlos o leer solo la configuración | No copiar nunca un script; leer la configuración como datos | El sanitizador conservaba cualquier script con tailwind.config, y la aplicación guarda un token en el navegador. |
| Mockups anteriores al contrato | Marcar todos sus botones como sin enlace, o dejarlos intactos | Dejarlos intactos | Evita llenar de avisos los proyectos existentes hasta que se regeneren. |
| Asociación sin coincidencia | Heredar el requisito de otra pantalla, o dejarla pendiente | Dejarla pendiente | Una asociación inventada afecta a operaciones y permisos. |

## 4. Revisiones independientes

Los cambios de riesgo alto (permisos, contratos generados, formato persistido y seguridad) pasaron por una revisión independiente de solo lectura antes de cerrarse.

| **Cambio** | **Resultado** | **Defectos encontrados** | **Estado** |
|----|----|----|----|
| Relaciones N:M y permisos | Seguro con matices | Ninguno nuevo. Matices ya existentes, como el administrador con acceso total. | Documentado |
| Validación y guardado de enlaces | Seguro con matices | La huella del frontend cambiaba en los proyectos existentes, un requisito no aprobado se aceptaba y el tipo de input distinguía mayúsculas. | Corregido con pruebas |
| Métodos por operación | Inseguro hasta corregir | Prueba de propiedad con 403 en una operación reducida, formulario de pruebas en la operación equivocada, smoke que suponía POST y DELETE y falta de aviso de reducción. | Corregido con pruebas |
| Fidelidad visual | Inseguro en el CSS | Reglas sin acotar por una llave en una cadena, cargas externas con image-set, src, url escapado y animaciones, y cabecera sin acceso a Usuarios. | Corregido con pruebas |

## 5. Límites conocidos

- El administrador conserva acceso total a las rutas generadas y estas no comprueban el método de la operación. Un administrador podría hacer POST sobre una operación que declara solo GET. Impedirlo exige un bloqueo en las rutas de Express, NestJS y Spring.

- Los enlaces solo se revalidan al generar o editar un mockup. Un cambio posterior en los requisitos puede dejarlos desactualizados hasta regenerarlos.

- La propuesta de permisos aprobada en la etapa de control de acceso no se recorta: puede mostrar métodos que, en el backend generado, la operación no declara.

- Un solo mockup que enlace únicamente una consulta basta para quitar POST, PATCH y DELETE a ese requisito. El artefacto lo avisa, y la corrección es declarar la acción en el mockup y regenerar.

- El diagrama de clases de diseño sigue sin alimentar el backend: los métodos y las dependencias que define no se trasladan al código generado.

- La comparación visual entre el mockup y la aplicación no se realizó: exigiría un navegador real y una imagen de referencia.

- La prueba de navegador generada sobre la interfaz diseñada solo se comprobó como JavaScript válido. No se ejecutó con un navegador real, y la página diseñada se probó en un DOM simulado.

- No se ha probado con mockups reales del generador: nada comprueba todavía que emita bien los enlaces y los nombres de campo.

- Las filas de ejemplo del mockup no se sustituyen por los registros reales, que aparecen en la tabla de resultados sobre el mockup.

- Un nombre de pantalla con comillas rompe el título de la página generada, y una pantalla llamada «Link» choca con el import del enrutador. Ambos problemas ya existían antes de estos cambios.

## 6. Verificación y trazabilidad

- Suite del backend: 1078 pruebas aprobadas y 1 omitida (ya venía omitida).

- Documentación: la validación de enlaces y OpenAPI y la compilación estricta de MkDocs salen correctas.

- El frontend generado se empaqueta con y sin autenticación.

- Pruebas contra un backend generado real por HTTP, con almacén en memoria, para los métodos reducidos, los permisos y la interfaz diseñada.

### Commits

| **Commit** | **Mensaje** |
|----|----|
| 61d786e | fix: se corrigió la asociación de RF, el JSX de mockups, el enlace de procesos y la caché del frontend |
| de31636 | fix: se conservan las relaciones N:M aprobadas y se restringen los permisos de soporte |
| 99943f8 | fix: la prueba de regla incumplida cambia a la vista de datos antes de buscar el formulario |
| 1c1fad2 | feat: se agregó el validador de enlaces de los mockups |
| afbc3eb | feat: se validan y guardan los enlaces al generar y editar mockups |
| 1b62d63 | chore: se sincronizaron las copias de los prompts en la documentación |
| 8f48d75 | feat: los prompts de mockups piden enlaces data-accion y se documenta el contrato |
| 079fdee | feat: se agregó el runtime que ejecuta las acciones de los mockups |
| c777c9c | feat: los botones del mockup con enlace llaman a la operación del backend |
| 28c4220 | feat: editar y eliminar actúan sobre el registro seleccionado en la consulta |
| 4c9ed6f | feat: los métodos de cada operación salen de los verbos de los mockups aprobados |
| 96309de | feat: OpenAPI, permisos y verificación respetan los métodos reducidos |
| 109bfe3 | feat: las pruebas generadas ejercen solo los métodos declarados y se documenta el contrato |
| bad549f | feat: el transformador conserva el CSS acotado, el body y la configuración de Tailwind como datos |
| 5dbb72d | feat: las pantallas generadas conservan el diseño del mockup |
| 3d119f4 | feat: la verificación del frontend avisa de la vista diseñada sin acciones conectadas |
| 47adfd1 | feat: se genera una prueba de navegador sobre la interfaz diseñada |
