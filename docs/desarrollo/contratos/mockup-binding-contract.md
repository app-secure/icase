# Contrato de enlaces de mockups

Cada botón o formulario de un mockup puede declarar qué operación del backend ejecuta. El modelo escribe el enlace al generar el mockup y un validador determinista lo comprueba. Este contrato **declara, valida y cablea** los enlaces: al generar el frontend, los controles con un enlace válido llaman a la operación del backend.

## Sintaxis

| Marca | Significado |
| --- | --- |
| `data-accion="RF-03.crear"` | El control ejecuta el RF indicado con uno de los verbos `consultar`, `crear`, `editar` o `eliminar`. |
| `data-accion="ui"` | Control solo visual (cancelar, cerrar, abrir menú). No requiere operación. |
| `name="sala"` en un campo | El campo corresponde al atributo `sala` de la entidad del RF. |

Cada verbo equivale a un método HTTP: `consultar` a GET, `crear` a POST, `editar` a PATCH y `eliminar` a DELETE.

Ejemplo:

```html
<form>
  <input name="sala"><input name="fecha">
  <button data-accion="RF-03.crear">Confirmar reserva</button>
  <button type="button" data-accion="ui">Cancelar</button>
</form>
```

## Qué recibe el modelo

El contexto del prompt incluye el bloque **OPERACIONES DISPONIBLES PARA data-accion**: los RF aprobados y los nombres de campo reales de su entidad, tomados del diagrama de clases de dominio aprobado. Si el RF no tiene entidad, el bloque lo indica en lugar de inventar campos. Las tres copias del prompt (completo, compacto y el de Groq) piden el mismo contrato.

## Qué comprueba el validador

- El RF existe, es funcional y no está marcado como no aprobado.
- El verbo es uno de los cuatro y la operación lo admite.
- En `crear` y `editar`, los campos `name` del formulario del propio botón existen en la entidad. Un campo desconocido genera un aviso, pero no invalida el enlace.
- Un botón sin `data-accion` genera el aviso `sin enlace: <texto>`. No se le asigna ninguna operación.
- Se ignoran `nav`, `aside`, `footer`, los controles ocultos y los enlaces `<a>`.

Sin diagrama de dominio aprobado, o con un esquema genérico, no se comprueban los campos.

## Resultado y límites

El resultado se guarda en `enlaces` de cada mockup, con los estados `valido`, `invalido` o `ui`. Los avisos se suman a `advertencias_validacion` y no bloquean la aprobación ni cambian `estado_calidad` a inválido.

Un mockup que no declara ningún `data-accion` se considera anterior al contrato y no recibe avisos de "sin enlace". Los enlaces se revalidan al generar, al reparar y al editar el código a mano.

## Qué hace el frontend generado

El transformador de HTML a JSX añade un manejador `onClick` a cada control con `data-accion="RF-xx.verbo"` cuyo RF es uno de los aprobados (o de los de la pantalla). Un control sin enlace válido (sin `data-accion`, `ui`, inválido o con un RF no aprobado) queda inerte, igual que antes. Los eventos originales del mockup (`onclick`, etc.) se siguen eliminando.

| Verbo | Qué ejecuta | Resultado en la pantalla |
| --- | --- | --- |
| `crear` | POST con los campos `name` del formulario del control (los vacíos se omiten; los `number` y `checkbox` se convierten). | «Registro creado» o el error del backend. |
| `consultar` | GET con `limit=20`. Si hay un campo `search` o `buscar`, se envía como `search`. | Número de registros y una tabla genérica con ellos. |
| `editar` | PATCH sobre el registro seleccionado, con los campos del formulario. | «Registro actualizado» o el error. |
| `eliminar` | DELETE sobre el registro seleccionado, previa confirmación que nombra el registro. | «Registro eliminado» o el error. |

`editar` y `eliminar` actúan sobre el **registro seleccionado**: el usuario pulsa `consultar`, elige una fila de la tabla de resultados con **Seleccionar** y el formulario del mockup se rellena con sus datos (por `name`). El id siempre viene del backend. Sin selección muestran «Selecciona primero un registro…» y no llaman a la API. Al eliminar se limpia la selección; si falla, se conserva.

Los ids que aparecen en las filas de ejemplo de un mockup no son ids reales, por eso el prompt **no** pide `data-id`. Un mockup escrito a mano puede declarar `data-id` en el control o en una fila; se usa solo si no hay un registro seleccionado.

Los permisos se aplican con la sesión: si el rol no tiene el método, el control muestra «No tienes permiso para esta acción.» y no llama a la API. El resultado se muestra encima del mockup, en la misma pantalla.

La página solo importa el runtime (`mockupActions.js` y `MockupResult.jsx`) cuando tiene enlaces válidos. El panel «Gestión de Datos» se conserva como herramienta auxiliar.

## Fidelidad visual de la conversión

La pantalla generada conserva el aspecto del mockup sin ejecutar nada de lo que trae:

- **CSS propio.** Los bloques `<style>` van a un archivo `frontend/src/pages/<pantalla>.css`, con cada selector acotado a `.mockup-<pantalla>` (`html`, `body` y `:root` pasan a ser el propio contenedor). El análisis respeta cadenas, comentarios y paréntesis, y lo que no esté bien cerrado se descarta. Solo se admiten `url(data:...)` y `url(#fragmento)`: se eliminan `@import`, cualquier otra carga externa (`url()`, `image-set()`, `src()`), las declaraciones con escapes fuera de comillas, `expression()`, `behavior` y `-moz-binding`. Las reglas de efecto global (`@font-face`, `@property`, `@page`, `@counter-style`) se descartan, y los `@keyframes` se renombran con el ámbito para no pisar las animaciones del resto de la aplicación.
- **Body.** Las clases y el estilo de `<body>` pasan al contenedor del mockup.
- **Tailwind.** La configuración `tailwind.config` del mockup se lee como datos: solo se admiten objetos, arreglos, cadenas, números y booleanos. Si trae código, llamadas o cualquier otra cosa, se descarta entera. Se aplica en el `index.html` generado, y sin configuración se deriva de los colores del sistema de diseño. Si varios mockups la definen, se combinan y, en caso de conflicto en un mismo valor, prevalece el del primero. El sanitizador de mockups aplica la misma regla de origen: del script `tailwind.config` solo conserva la configuración como datos, normalizada, y descarta cualquier otro código del script.
- **Enlaces.** Los `<a href>` internos a rutas de la aplicación pasan a `<Link>` de React Router, con su consulta y fragmento. Los externos, `#`, las rutas desconocidas y los que llevan `data-accion` no cambian.
- **Contenedor y menú.** Las pantallas con mockup usan un contenedor sin ancho máximo en la vista diseñada. Si el mockup trae su propio menú (un `<aside>`, o un `<nav>` con enlaces a al menos dos pantallas de la aplicación), la cabecera oculta su menú de módulos en esa ruta y conserva la marca, la sesión y, para el administrador, el enlace a Usuarios.

## De los enlaces a los métodos del backend

Al generar el backend, los verbos válidos que declaran los mockups aprobados para un RF determinan los `methods` de su operación: siempre `GET` más los métodos de esos verbos, en el orden GET, POST, PATCH, DELETE. «Consultar reportes» con un único control `consultar` queda solo con `GET`.

- Se unen los verbos de todos los mockups del mismo RF. Los enlaces inválidos y los `ui` no cuentan.
- Sin mockups aprobados, o sin enlaces válidos para un RF, la operación mantiene el CRUD completo. Los proyectos anteriores no cambian.
- Mantienen CRUD completo: las operaciones de soporte, las de entidades en una relación N:M, las entidades padre de otra operación (las pruebas y los vínculos las crean y las borran) y todas las operaciones si hay activo un módulo que usa PATCH (archivos, pagos de prueba, procesos).
- El contrato, el manifiesto y el OpenAPI declaran solo esos métodos. Las pruebas generadas y el smoke ejercen únicamente lo declarado.
- Los permisos se recortan: un rol nunca recibe un método que la operación no declara, así que un rol no administrador recibe 403 al intentarlo.
- La huella del backend incluye los verbos solo cuando existen. Cambiar los mockups regenera el backend.
- El artefacto del backend avisa qué RF quedaron con métodos reducidos («Operaciones con métodos reducidos por los enlaces de los mockups aprobados: RF-05 (GET)…»). Un solo mockup que enlace únicamente `consultar` basta para quitar POST, PATCH y DELETE a ese RF: si falta una acción, hay que declararla en el mockup y regenerar.
- Las pruebas de propiedad de registros y de integridad referencial omiten las operaciones que ya no admiten POST o DELETE.

**Límites:** los enlaces solo se revalidan al generar o editar un mockup, así que un cambio posterior en los requisitos puede dejar enlaces desactualizados hasta regenerarlos. La propuesta de permisos aprobada en la etapa de control de acceso no se recorta: puede mostrar métodos que, en el backend generado, la operación no declara y por eso no tienen efecto. Además, el administrador conserva acceso total a todas las rutas generadas, como en el resto del sistema, y las rutas no comprueban el método de la operación. Un administrador podría hacer POST sobre una operación que solo declara GET. Impedirlo exige un bloqueo en las rutas de Express, NestJS y Spring.

## Límites

- Un enlace válido no certifica que la regla de negocio del RF esté implementada: el backend sigue ofreciendo las operaciones genéricas por RF.
- No hay pruebas con un navegador real. Hay pruebas de la página generada ejecutándose con React en un DOM simulado (crear, consultar, seleccionar, editar y eliminar contra un `fetch` simulado) y la verificación de que el frontend generado se empaqueta.
- Las filas de ejemplo del mockup no se sustituyen por los registros reales: estos aparecen en la tabla de resultados que se muestra sobre el mockup.
- No hay comparación visual automática entre el mockup y la aplicación generada: la fidelidad se comprueba a mano.
- Los scripts del mockup nunca se copian, y de los `<link>` solo se conserva el tipo de letra que ya carga la aplicación.
