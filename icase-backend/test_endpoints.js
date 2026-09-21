const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('============================================');
  console.log('   TESTING I-CASE BACKEND ENDPOINTS');
  console.log('============================================\n');

  let projectId = null;
  let testsPassed = 0;
  let testsFailed = 0;

  async function testEndpoint(name, fn) {
    try {
      process.stdout.write(`Testing: ${name}... `);
      await fn();
      console.log(' -> PASSED');
      testsPassed++;
    } catch (err) {
      console.log(` -> FAILED: ${err.message}`);
      testsFailed++;
    }
  }

  // 1. Health check
  await testEndpoint('GET /health', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Expected status 'ok', got ${JSON.stringify(data)}`);
    console.log(`\n   Response: ${JSON.stringify(data)}`);
  });

  // 2. List projects
  await testEndpoint('GET /proyectos', async () => {
    const res = await fetch(`${BASE_URL}/proyectos`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
    console.log(`\n   Found ${data.length} existing project(s)`);
  });

  // 3. Create project
  await testEndpoint('POST /proyectos', async () => {
    const payload = {
      nombre: 'Proyecto Test Auditoría ' + Date.now(),
      descripcion: 'Proyecto de verificación automática de endpoints IEEE 830'
    };
    const res = await fetch(`${BASE_URL}/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    const id = data.id || data._id;
    if (!id) throw new Error(`Created project has no id: ${JSON.stringify(data)}`);
    projectId = id;
    console.log(`\n   Created project with ID: ${projectId}, name: "${data.nombre}"`);
  });

  // 4. Get created project by ID
  await testEndpoint('GET /proyectos/:id', async () => {
    if (!projectId) throw new Error('No projectId available');
    const res = await fetch(`${BASE_URL}/proyectos/${projectId}`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (!data.nombre) throw new Error(`Unexpected project structure: ${JSON.stringify(data)}`);
    console.log(`\n   Project state: faseActual="${data.faseActual}", estado="${data.estado}"`);
  });

  // 5. Upload a text source file to project
  await testEndpoint('POST /proyectos/:proyectoId/fuentes', async () => {
    if (!projectId) throw new Error('No projectId available');
    const dummyFilePath = path.join(__dirname, 'temp_test_fuente.txt');
    fs.writeFileSync(dummyFilePath, 'El sistema debe gestionar ventas y facturacion electronica con contingencia offline.');

    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(dummyFilePath)], { type: 'text/plain' });
    formData.append('archivo', blob, 'temp_test_fuente.txt');

    const res = await fetch(`${BASE_URL}/proyectos/${projectId}/fuentes`, {
      method: 'POST',
      body: formData
    });

    if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    console.log(`\n   Uploaded source: ${data.nombreArchivo || data.tipo || 'OK'}`);
  });

  // 6. List sources for project
  await testEndpoint('GET /proyectos/:proyectoId/fuentes', async () => {
    if (!projectId) throw new Error('No projectId available');
    const res = await fetch(`${BASE_URL}/proyectos/${projectId}/fuentes`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
    console.log(`\n   Project has ${data.length} source(s)`);
  });

  // 7. Get consolidated document
  await testEndpoint('GET /proyectos/:id/documento-consolidado', async () => {
    if (!projectId) throw new Error('No projectId available');
    const res = await fetch(`${BASE_URL}/proyectos/${projectId}/documento-consolidado`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (!data.proyecto) throw new Error(`Expected { proyecto, ... }, got ${Object.keys(data).join(', ')}`);
    console.log(`\n   Consolidated doc keys: ${Object.keys(data).join(', ')}`);
  });

  // 8. Export markdown
  await testEndpoint('GET /proyectos/:id/exportar-markdown', async () => {
    if (!projectId) throw new Error('No projectId available');
    const res = await fetch(`${BASE_URL}/proyectos/${projectId}/exportar-markdown`);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const text = await res.text();
    if (text.length === 0) throw new Error('Exported markdown is empty');
    console.log(`\n   Markdown exported length: ${text.length} chars (starts with: ${text.slice(0, 40).replace(/\n/g, ' ')}...)`);
  });

  console.log('\n============================================');
  console.log(`   TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('============================================');
}

runTests().catch(err => {
  console.error('Fatal error in tests:', err);
  process.exit(1);
});
