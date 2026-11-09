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

## Límites

- Un enlace válido no certifica que la regla de negocio del RF esté implementada: el backend sigue ofreciendo las operaciones genéricas por RF.
- No hay pruebas con un navegador real. Hay pruebas de la página generada ejecutándose con React en un DOM simulado (crear, consultar, seleccionar, editar y eliminar contra un `fetch` simulado) y la verificación de que el frontend generado se empaqueta.
- Las filas de ejemplo del mockup no se sustituyen por los registros reales: estos aparecen en la tabla de resultados que se muestra sobre el mockup.
- Los estilos, scripts y la navegación propios del mockup se siguen perdiendo en la conversión.
