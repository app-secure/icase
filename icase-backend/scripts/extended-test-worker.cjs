// Proceso exclusivo de pruebas: MongoDB real, IA/Docker simulados explícitamente.
const mongoose = require('mongoose');
const AI = require('../src/infrastructure/services/ModelosIaService');
const Sandbox = require('../src/infrastructure/services/SandboxRuntimeVerifier');
AI.prototype.procesar = async function () {
  if (process.env.TEST_AI_MODE === 'slow') await new Promise(resolve => setTimeout(resolve, 10000));
  if (process.env.TEST_AI_MODE === 'fail') throw new Error('Fallo IA simulado para recuperación');
  return { requerimientos: [], diagramas: [{ tipo: 'casos_de_uso', titulo: 'Biblioteca', descripcion: 'Registro de libros', requisitos_relacionados: ['RF-01'], codigo_plantuml: '@startuml\nleft to right direction\nactor "Bibliotecario" as B\nrectangle Biblioteca {\nusecase "Registrar libros" as UC1\nusecase "Consultar libros" as UC2\nusecase "Actualizar libros" as UC3\nusecase "Eliminar libros" as UC4\n}\nB --> UC1\nB --> UC2\nB --> UC3\nB --> UC4\n@enduml' }] };
};
Sandbox.prototype.verificar = async () => {
  if (process.env.TEST_AI_MODE === 'docker-slow') await new Promise(resolve => setTimeout(resolve, 10000));
  return { estado: 'fallida', nivel: 'ejecucion_aislada', pruebas: [], errores: ['Docker no disponible: fallo simulado de prueba'] };
};
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const { app, reanudarTrabajosDiagrama } = require('../src/app')();
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  await reanudarTrabajosDiagrama();
  const timer = setInterval(() => reanudarTrabajosDiagrama().catch(() => {}), 500); timer.unref();
  const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
})().catch(() => { process.send?.({ error: 'No se pudo iniciar el proceso de pruebas' }); process.exit(1); });
