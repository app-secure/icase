# Contrato de generación de código

Este contrato es la base común de los módulos de código, pruebas, infraestructura y entrega. Ningún generador modifica el flujo ni aprueba su propio resultado.

## Stack predeterminado y soporte actual

- Plataforma predeterminada: web; existe una base Expo opcional para móvil.
- Backend: Node.js + Express o NestJS según selección compatible.
- Frontend: React + Vite.
- Base de datos: MongoDB, PostgreSQL o MySQL según selección compatible.
- Gestor de paquetes: npm.
- El andamiaje, las configuraciones y los pipelines salen de plantillas deterministas.
- La implementación actual genera CRUD por RF mediante reglas locales. La síntesis de reglas específicas del dominio mediante IA es una mejora pendiente, no una capacidad certificada.

El stack se propone por proyecto y requiere aprobación antes de avanzar. Estos valores son la propuesta predeterminada, no una aprobación automática.

## Etapas y compuertas

1. `alcance_plataforma`: confirma web, exclusiones y límites de entrega.
2. `stack_tecnologico`: confirma herramientas, versiones y restricciones.
3. `arquitectura_codigo`: confirma capas, módulos, contratos y decisiones técnicas.
4. `estructura_carpetas`: confirma el árbol que compartirán los generadores.
5. `generacion_backend` y `generacion_frontend`: pueden ejecutarse en paralelo.
6. `generacion_pruebas` y `generacion_infraestructura`: consumen ambos códigos aprobados.
7. `generacion_ci_cd`: consume pruebas e infraestructura aprobadas.
8. `paquete_entrega`: reúne únicamente artefactos vigentes y aprobados.

Modificar una decisión aprobada no regenera nada automáticamente. Sus descendientes aprobados pasan a `desactualizada` y deben revisarse de manera explícita.

## Interfaz de generador

```js
generar({ proyecto, insumos, versionesOrigen }) => {
  tipo,
  estado,
  archivos: [{ ruta, contenido, lenguaje, huella }],
  dependencias: [{ tipo, version }],
  trazabilidad_rf: [],
  advertencias: [],
  errores: [],
  generado_por,
  huella_entrada,
  versiones_origen
}
```

## Contrato funcional genérico

Cada requisito funcional aprobado se transforma en una operación estable identificada por su código (`RF-01`, `RF-02`, etc.). El manifiesto de backend declara, sin depender del dominio del proyecto:

```json
{
  "operations": [
    {
      "id": "RF-01",
      "key": "rf-01",
      "collectionPath": "/api/operations/rf-01",
      "itemPath": "/api/operations/rf-01/:id",
      "methods": ["GET", "POST", "PATCH", "DELETE"]
    }
  ]
}
```

El manifiesto del frontend conecta cada pantalla con esas claves mediante su trazabilidad RF. Una pantalla sin RF o un RF sin operación bloquea la aprobación. Este contrato funciona igual para restaurantes, bibliotecas, inventarios u otros dominios; las reglas particulares del negocio deben materializarse después como esquemas, invariantes y pruebas del RF.

## Evidencia de ejecución

La verificación estructural no habilita la aprobación por sí sola. Para backend, frontend, pruebas y paquete final se exige una evidencia asociada a la huella exacta de sus archivos. La verificación:

1. prepara los archivos en un directorio temporal exclusivo;
2. construye backend, frontend y, si aplica, el bundle móvil;
3. levanta la base de datos seleccionada, backend y frontend en una red Docker interna;
4. espera los `healthcheck`;
5. ejecuta CRUD para las operaciones del contrato, la suite de integración y las pruebas de navegador;
6. destruye contenedores, volúmenes e imágenes temporales.

Si Docker no está disponible o cualquiera de esos pasos falla, el artefacto queda `fallida` y no se puede aprobar ni exportar.

Tipos válidos:

- `codigo_backend`
- `codigo_frontend`
- `pruebas`
- `infraestructura`
- `pipeline_ci_cd`
- `paquete_entrega`

## API inicial

- `GET /proyectos/:id/codificacion`: obtiene o inicializa el plan.
- `PUT /proyectos/:id/codificacion/etapas/:etapa`: registra una propuesta estructurada.
- `POST /proyectos/:id/codificacion/etapas/:etapa/revision`: aprueba o rechaza una propuesta.
- `GET /proyectos/:id/artefactos?tipo=...`: lista artefactos y versiones.

Ejemplo de propuesta de stack:

```json
{
  "propuesta": {
    "backend": "Node.js 22 + Express 4",
    "frontend": "React 19 + Vite 8",
    "base_datos": "MongoDB 8",
    "gestor_paquetes": "npm",
    "plataformas": ["web"]
  },
  "observaciones": "Stack objetivo del primer incremento"
}
```

Ejemplo de revisión:

```json
{
  "decision": "aprobar",
  "observaciones": "Aprobado para generación"
}
```
