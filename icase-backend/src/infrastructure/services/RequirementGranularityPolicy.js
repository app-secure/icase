// Compartida por extracción y redacción; sin cuotas ni reglas por dominio.
module.exports = `GRANULARIDAD FUNCIONAL EQUILIBRADA:
Un objetivo es un resultado observable de una operación, NO el trabajo completo de un rol, módulo o pantalla.
Prueba de independencia: si una capacidad puede ejecutarse, probarse y aprobarse aunque la otra no esté implementada, y entrega un resultado distinto, asigna objetivos y necesidades separados. Compartir actor, pantalla, entidad o una misma cita NO justifica agruparlas.
Antes de consolidar una frase enumerativa, identifica sus resultados independientes. Una misma cita literal puede sustentar varias necesidades con IDs diferentes. Después consolida únicamente repeticiones y detalles del MISMO resultado.
Mantén juntos campos, filtros, ordenación, estados visibles, formatos, medios alternativos y validaciones necesarias para completar una operación. No crees un requisito por verbo ni por criterio de aceptación; no separes capturar, validar y guardar cuando son pasos de una única operación.
Ejemplos de frontera, solo ilustrativos, NUNCA funciones que debas añadir:
- Consultar expedientes con filtros, fechas y estados: UN objetivo. Consultar expedientes y autorizar solicitudes: DOS objetivos.
- Registrar un pago con distintos medios y comprobar el saldo como parte del cobro: UN objetivo. Registrar pagos y cerrar un período: DOS objetivos.
- Consultar indicadores con filtros y totales: UN objetivo. Consultar indicadores y modificar tarifas: DOS objetivos.
- Consultar una cola con antigüedad y estado: UN objetivo. Consultarla y modificar la disponibilidad de recursos: DOS objetivos.
- Leer un código y validar la operación que identifica: UN objetivo; no dos requisitos técnicos.
Los criterios detallan cómo aceptar el resultado, no sirven para esconder operaciones independientes bajo un título «Gestión de ...».
Una enumeración con verbos de resultados distintos —consultar y modificar, tomar y validar, comprar y acumular, cobrar y cerrar, revisar y cambiar y gestionar— son necesidades y objetivos separados, aunque compartan cita, actor o pantalla. Precios, disponibilidad, estados, filtros, medios alternativos y comprobar un saldo para poder cobrar siguen siendo detalles de una sola operación.
Una prohibición o exclusividad (no debe, sin que, solamente, salvo que) es regla de negocio vinculada, no una frase más del mismo resultado. Si la excepción autoriza otra operación, esa operación es una necesidad propia. No omitas autenticación, permisos, tecnologías confirmadas o condicionadas, exclusiones ni preguntas de umbral por haber descrito ya la función principal.
No impongas un máximo o mínimo de requisitos. No conviertas dispositivos, plataformas o pasos manuales externos en funciones.
Autenticar usuarios o autorizar operaciones explícitamente solicitadas son comportamientos RF; el mecanismo tecnológico es restricción y las políticas de acceso son reglas vinculadas, sin sustituir el comportamiento por esas categorías.
No completes resultados con reglas ausentes: periodicidad de cierres, fórmulas de puntos, equivalencias entre paquetes y saldo o relación entre carga y latencia deben estar sustentadas o quedar pendientes.`;
