require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getJwtSecret } = require('../src/infrastructure/security/jwtSecret');

const UsuarioModel = require('../src/infrastructure/database/schemas/UsuarioSchema');
const ProyectoModel = require('../src/infrastructure/database/schemas/ProyectoSchema');
const RequerimientoModel = require('../src/infrastructure/database/schemas/RequerimientoSchema');
const DiagramaModel = require('../src/infrastructure/database/schemas/DiagramaSchema');
const DisenoModel = require('../src/infrastructure/database/schemas/DisenoSchema');
const ArtefactoGeneradoModel = require('../src/infrastructure/database/schemas/ArtefactoGeneradoSchema');
const { DIAGRAM_TYPES } = require('../src/core/constants/DiagramTypes');
const { ARTIFACT_TYPES } = require('../src/core/constants/ArtifactTypes');

const TEST_DATA_PATH = path.resolve(__dirname, '../../tests/performance/config/test-data.json');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/icase_db';
const JWT_SECRET = getJwtSecret(process.env);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

function splitNombre(nombre) {
  const partes = String(nombre || 'Tester QA').trim().split(/\s+/);
  return { nombre: partes[0] || 'Tester', apellido: partes.slice(1).join(' ') || 'QA' };
}

function generarToken(usuarioJson) {
  return jwt.sign(
    { id: String(usuarioJson.id), correo: usuarioJson.correo, nombre: usuarioJson.nombre, apellido: usuarioJson.apellido },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN, jwtid: randomUUID() }
  );
}

async function upsertUsuario(data) {
  const { nombre, apellido } = splitNombre(data.nombre);
  let usuario = await UsuarioModel.findOne({ correo: data.correo.toLowerCase().trim() });
  const passwordHash = await bcrypt.hash(data.password, 10);

  if (usuario) {
    await UsuarioModel.findByIdAndUpdate(usuario._id, {
      nombre, apellido, celular: data.celular || '3000000000', password: passwordHash
    });
    usuario = await UsuarioModel.findById(usuario._id);
  } else {
    usuario = await UsuarioModel.create({
      nombre, apellido, correo: data.correo.toLowerCase().trim(),
      celular: data.celular || '3000000000', password: passwordHash
    });
  }

  const usuarioJson = usuario.toJSON();
  const token = generarToken(usuarioJson);
  return { ...usuarioJson, token, _id: usuario._id };
}

function estadoFasePorSize(size) {
  switch (size) {
    case 'small': return 'diagramas_aprobados';
    case 'medium': return 'mockups_aprobados';
    case 'large': return 'finalizado';
    default: return 'insumos_pendientes';
  }
}

async function upsertProyecto(data, usuario) {
  const estadoFase = estadoFasePorSize(data.size);
  let proyecto = await ProyectoModel.findOne({ nombre: data.nombre });

  if (proyecto) {
    await ProyectoModel.findByIdAndUpdate(proyecto._id, {
      usuario_id: usuario._id, nombre: data.nombre, descripcion: data.descripcion,
      insumo_bruto: data.insumo_bruto, estado_fase: estadoFase
    });
    proyecto = await ProyectoModel.findById(proyecto._id);
  } else {
    proyecto = await ProyectoModel.create({
      usuario_id: usuario._id, nombre: data.nombre, descripcion: data.descripcion,
      insumo_bruto: data.insumo_bruto, estado_fase: estadoFase
    });
  }

  return { ...proyecto.toJSON(), _id: proyecto._id };
}

async function crearRequerimientos(proyecto, totalRf, totalRnf) {
  await RequerimientoModel.deleteMany({ proyecto_id: proyecto._id });
  const docs = [];

  for (let i = 1; i <= totalRf; i++) {
    docs.push({
      proyecto_id: proyecto._id, tipo: 'RF',
      identificador: `RF-${String(i).padStart(2, '0')}`,
      nombre: `RF-${String(i).padStart(2, '0')} de ${proyecto.nombre}`,
      descripcion: `Requerimiento funcional ${i} del proyecto ${proyecto.nombre}`,
      prioridad: 'Alta', actores: ['Usuario'],
      aprobado: true, estado_decision: 'confirmado'
    });
  }
  for (let i = 1; i <= totalRnf; i++) {
    docs.push({
      proyecto_id: proyecto._id, tipo: 'RNF',
      identificador: `RNF-${String(i).padStart(2, '0')}`,
      nombre: `RNF-${String(i).padStart(2, '0')} de ${proyecto.nombre}`,
      descripcion: `Requerimiento no funcional ${i} del proyecto ${proyecto.nombre}`,
      metrica_medible: '< 2000ms', prioridad: 'Media',
      aprobado: true, estado_decision: 'confirmado'
    });
  }

  if (docs.length) await RequerimientoModel.insertMany(docs);
  return docs.length;
}

async function crearDiagramas(proyecto, size) {
  await DiagramaModel.deleteMany({ proyecto_id: proyecto._id });
  const tipos = size === 'medium'
    ? [DIAGRAM_TYPES.USE_CASES, DIAGRAM_TYPES.DOMAIN_CLASSES]
    : [DIAGRAM_TYPES.USE_CASES, DIAGRAM_TYPES.DOMAIN_CLASSES, DIAGRAM_TYPES.SOFTWARE_ARCHITECTURE,
       DIAGRAM_TYPES.SYSTEM_ARCHITECTURE, DIAGRAM_TYPES.DESIGN_CLASSES, DIAGRAM_TYPES.NAVIGATION_TREE];

  const docs = tipos.map((tipo, i) => ({
    proyecto_id: proyecto._id, tipo,
    titulo: `${tipo} - ${proyecto.nombre}`,
    descripcion: `Diagrama ${tipo} para pruebas de rendimiento`,
    codigo_mermaid: 'graph TD\n    A[Inicio] --> B[Fin]',
    codigo_plantuml: '@startuml\nclass Test {\n  +String nombre\n}\n@enduml',
    aprobado: true, estado: 'aprobado', estado_calidad: 'valido',
    aprobado_en: new Date(), aprobado_por: 'seed-performance'
  }));

  if (docs.length) await DiagramaModel.insertMany(docs);
  return docs.length;
}

async function crearDisenos(proyecto) {
  await DisenoModel.deleteMany({ proyecto_id: proyecto._id });
  await DisenoModel.create({
    proyecto_id: proyecto._id,
    aprobado: true,
    modelo_datos: {
      entidades: [
        { nombre: 'Producto', atributos: 'id, nombre, precio, stock', descripcion: 'Catalogo de productos', relaciones: '1:N con Pedido' },
        { nombre: 'Pedido', atributos: 'id, fecha, total, estado', descripcion: 'Ordenes de compra', relaciones: 'N:1 con Producto' }
      ],
      codigo_mermaid: 'graph TD\n    Producto --> Pedido'
    },
    mockups: [
      {
        pantalla_id: 'pantalla-inicio', nombre_pantalla: 'Inicio', nombre_visible: 'Pagina de Inicio',
        flujo: 'home', modulo: 'publico', ruta: '/', plataforma: 'web', roles: ['usuario'],
        shell: 'web', tipo: 'pantalla', descripcion: 'Pantalla principal de inicio',
        elementos_visibles: ['logo', 'menu_navegacion', 'banner'],
        campos_formulario: [],
        acciones_principales: ['navegar_catalogo', 'iniciar_sesion'],
        rf_trazabilidad: ['RF-01'],
        enlaces: [],
        preview_code: '<div>Inicio</div>', imagen_url: '',
        estado: 'aprobado', version: 1,
        historial_versiones: [{ version: 1, preview_code: '<div>Inicio</div>', estado_calidad: 'valido', guardado_en: new Date() }],
        ajustes_sanitizacion: [], advertencias_validacion: [], errores_validacion: [], estado_calidad: 'valido'
      }
    ],
    manifiesto_navegacion: [
      { pantalla_id: 'pantalla-inicio', nombre: 'Inicio', slug: 'inicio', flujo: 'home', modulo: 'publico', ruta: '/', plataforma: 'web', roles: ['usuario'], shell: 'web', componentes: ['Header', 'Hero', 'Footer'], rf_trazabilidad: ['RF-01'], orden: 1, obligatoria: true }
    ],
    sistema_diseno: { nombre: 'Predeterminado I-CASE', origen: 'predeterminado', version: 1 },
    arbol_navegacion: { descripcion: 'Arbol de navegacion del sistema', codigo_mermaid: 'graph TD\n    Inicio --> Catalogo' },
    arquitectura_frontend: {
      descripcion: 'Frontend React + Vite',
      capas: { app_layer: 'src/app', features_layer: 'src/features', shared_layer: 'src/shared' },
      codigo_mermaid: 'graph TD\n    App --> Features --> Shared'
    },
    arquitectura_backend: {
      descripcion: 'Backend Node.js + Express',
      caracteristicas: ['REST API', 'Mongoose ODM', 'JWT Auth'],
      codigo_mermaid: 'graph TD\n    Controller --> Service --> Repository'
    }
  });
}

async function crearArtefactos(proyecto) {
  await ArtefactoGeneradoModel.deleteMany({ proyecto_id: proyecto._id });
  const tipos = Object.values(ARTIFACT_TYPES);
  const creados = [];

  for (const tipo of tipos) {
    const doc = await ArtefactoGeneradoModel.create({
      proyecto_id: proyecto._id, tipo, version: 1,
      estado: 'aprobado', aprobado: true,
      archivos: [{ ruta: `src/${tipo}`, contenido: '// artefacto generado por seed-performance', lenguaje: 'text', huella: 'seed-perf' }],
      dependencias: [], trazabilidad_rf: [], advertencias: [], errores: [],
      modulos: null, generado_por: 'seed-performance', huella_entrada: 'seed-perf', versiones_origen: {}
    });
    creados.push(doc.toJSON());
  }
  return creados;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`[MongoDB] Conectado a ${MONGO_URI}`);

  const testData = JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf8'));

  const users = [];
  for (const userData of testData.users) {
    const u = await upsertUsuario(userData);
    users.push(u);
    console.log(`[Usuario] ${u.correo} -> id=${u.id} token=${u.token.substring(0, 20)}...`);
  }

  const projectMap = {};
  const artefactoMap = {};
  for (let i = 0; i < testData.projects.length; i++) {
    const p = await upsertProyecto(testData.projects[i], users[i]);
    projectMap[testData.projects[i].size] = p;
    console.log(`[Proyecto] ${testData.projects[i].size} (${p.nombre}) -> id=${p.id} fase=${estadoFasePorSize(testData.projects[i].size)}`);
  }

  for (let i = 0; i < testData.projects.length; i++) {
    const p = projectMap[testData.projects[i].size];
    const count = await crearRequerimientos(p, testData.projects[i].total_rf, testData.projects[i].total_rnf);
    console.log(`[Requerimientos] ${testData.projects[i].size}: ${count} creados`);
  }

  for (let i = 0; i < testData.projects.length; i++) {
    const p = projectMap[testData.projects[i].size];
    const count = await crearDiagramas(p, testData.projects[i].size);
    console.log(`[Diagramas] ${testData.projects[i].size}: ${count} creados`);
  }

  for (let i = 0; i < testData.projects.length; i++) {
    const p = projectMap[testData.projects[i].size];
    const artefactos = await crearArtefactos(p);
    artefactoMap[testData.projects[i].size] = artefactos[0]?.id || null;
    console.log(`[Artefactos] ${testData.projects[i].size}: ${artefactos.length} creados`);
    artefactos.forEach(a => console.log(`  - ${a.tipo} -> id=${a.id}`));
  }

  const proyectoLarge = projectMap['large'];
  await crearDisenos(proyectoLarge);
  console.log(`[Diseño] large: diseno con mockups y navegacion creado`);

  const updatedData = JSON.parse(JSON.stringify(testData));
  for (let i = 0; i < updatedData.users.length; i++) {
    updatedData.users[i].id = users[i].id;
    updatedData.users[i].token = users[i].token;
  }
  for (let i = 0; i < updatedData.projects.length; i++) {
    const size = updatedData.projects[i].size;
    updatedData.projects[i].id = projectMap[size].id;
    updatedData.projects[i].artefactoId = artefactoMap[size] || updatedData.projects[i].artefactoId;
  }

  fs.writeFileSync(TEST_DATA_PATH, JSON.stringify(updatedData, null, 2) + '\n');
  console.log(`[Test data] Actualizado: ${TEST_DATA_PATH}`);

  await mongoose.disconnect();
  console.log('[MongoDB] Desconectado. Seed completado.');
}

main().catch((err) => {
  console.error('[Seed] Error fatal:', err);
  process.exit(1);
});
