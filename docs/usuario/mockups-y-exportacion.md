# Mockups y exportación

## Preparar las pantallas

Los mockups parten del árbol de navegación y de los requisitos aprobados. Antes de generarlos comprueba que cada función con interacción tenga una pantalla o un flujo reconocible, los roles correctos y los campos y acciones necesarios.

Un requisito interno o de infraestructura no exige por sí mismo una pantalla. Una pantalla puede cubrir varios RF; deben estar relacionados de forma coherente.

## Generar y revisar

1. Termina las aprobaciones de diagramas requeridas por el flujo.
2. Abre **Mockups** y revisa las pantallas catalogadas.
3. Ajusta la paleta si es necesario. La configuración valida formato y contraste en combinaciones evaluadas.
4. Marca las pantallas y utiliza **Generar seleccionadas**.
5. Espera el trabajo persistente; cambiar de pestaña no implica cancelarlo.
6. Revisa diseño y código de cada pantalla.
7. Lee las advertencias de cobertura en los detalles y contrástalas con los RF.
8. Solicita cambios concretos, guarda y aprueba la fase cuando esté completa.

Ejemplo: «En Registrar préstamo, RF-02 requiere ejemplar, lector y fecha de devolución. Añade los campos y la confirmación de éxito».

El mockup es una propuesta visual. Un botón en HTML no demuestra que exista una operación real de backend, y un contraste aprobado no certifica toda la accesibilidad.

## Versiones y fallos

La generación seleccionada evita rehacer pantallas que ya están correctas. No repitas clics mientras exista un trabajo activo. Si falla, revisa su mensaje y la configuración del proveedor antes de volver a intentarlo.

Cambiar el árbol o un RF puede invalidar la cobertura de pantallas previas. Revisa las dependencias antes de aprobar nuevamente.

## Documento y PDF

Después de aprobar mockups, abre el documento actual. La auditoría final resume cobertura, advertencias y omisiones; los errores críticos pueden bloquear su obtención.

1. Comprueba título, alcance, requisitos, diagramas y pantallas.
2. Revisa las advertencias pendientes.
3. Abre el visor de PDF y descarga.
4. Examina el archivo descargado: textos, proporciones, legibilidad, saltos y capturas.
5. Registra diferencias respecto del panel si hay desplazamientos o recortes.

La construcción del PDF ocurre en el frontend. La API ofrece Markdown y el documento consolidado; no existe una ruta REST dedicada de exportación PDF en las rutas revisadas.

## Qué formato usar

| Formato | Uso |
| --- | --- |
| Markdown | Revisión textual e intercambio de la especificación |
| PlantUML/Mermaid | Fuente editable del diagrama correspondiente |
| HTML/CSS | Propuesta visual de mockup |
| PDF | Documento consolidado de presentación |
| ZIP de código | Entrega separada de la fase de codificación |

No confundas descargar el documento con verificar el software generado. Para obtener código revisado consulta [Codificación](codificacion.md).

## Errores comunes

Si falta una pantalla, corrige primero la navegación y la trazabilidad. Si todos los mockups tienen advertencias, consulta su cobertura antes de solicitar cambios globales. Si el PDF difiere del panel, conserva ambos como evidencia y registra navegador, pantalla y versión utilizada.
