const fs = require('node:fs');
const path = require('node:path');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
const target = process.argv[2];
if (!target) throw new Error('Indica una carpeta de salida para la demostración.');
const result = new Generator().generar({
  proyecto: { nombre: 'Reservas de atención · Demostración', descripcion: 'Ejemplo de documentación del proyecto generado. Datos sintéticos para revisar la presentación.' },
  requerimientos: [
    { tipo: 'RF', identificador: 'RF-01', aprobado: true, nombre: 'Consultar horarios disponibles', descripcion: 'El cliente consulta los horarios disponibles para el servicio elegido.', actores: ['Cliente'], precondiciones: 'El servicio está activo.', poscondiciones: 'Se muestran horarios con cupos disponibles.' },
    { tipo: 'RF', identificador: 'RF-02', aprobado: true, nombre: 'Confirmar una reserva', descripcion: 'El cliente selecciona el horario y confirma una reserva. El sistema debe impedir que dos reservas ocupen el mismo cupo.', actores: ['Cliente'], precondiciones: 'El cliente tiene sesión y el horario tiene cupo.', poscondiciones: 'Se registra la reserva y se muestra su referencia.' },
    { tipo: 'RF', identificador: 'RF-03', aprobado: true, nombre: 'Consultar y cancelar reservas', descripcion: 'El cliente consulta sus reservas y solicita la cancelación cuando el estado lo permite.', actores: ['Cliente'], precondiciones: 'La reserva pertenece al cliente.', poscondiciones: 'Se muestra el estado actualizado.' },
    { tipo: 'RNF', identificador: 'RNF-01', aprobado: true, nombre: 'Trazabilidad de cambios', descripcion: 'Registrar los cambios de estado con actor y fecha.' }
  ],
  diagramas: [{ tipo: 'clases_dominio', version: 1, aprobado: true, estado: 'aprobado', codigo_plantuml: '@startuml\nclass Cliente\nclass Reserva\nclass Horario\nCliente "1" -- "0..*" Reserva\nHorario "1" -- "0..1" Reserva\n@enduml' }],
  plan: { etapas: [{ etapa: 'stack_tecnologico', estado: 'aprobada', propuesta: { backend: 'Express', frontend: 'React', base_datos: 'PostgreSQL' } }] },
  opciones: { githubActions: true }
});
for (const file of result.archivos) {
  const destination = path.resolve(target, file.ruta);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, file.contenido);
}
fs.writeFileSync(path.join(target, 'preview-bundle.json'), JSON.stringify(result));
console.log(`Demostración generada en ${path.resolve(target)}`);
