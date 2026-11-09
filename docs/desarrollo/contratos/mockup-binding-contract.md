# Contrato de enlaces de mockups

Cada botón o formulario de un mockup puede declarar qué operación del backend ejecuta. El modelo escribe el enlace al generar el mockup y un validador determinista lo comprueba. Este contrato **declara y valida** los enlaces. Todavía no los conecta al código generado: el transformador HTML a JSX sigue sin cablearlos.

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

Un enlace válido no demuestra que la interfaz generada ejecute la operación. Esa conexión corresponde a una fase posterior.
