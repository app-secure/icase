const BASE_URL = 'http://localhost:5000';

async function testProcesarIA() {
  console.log('=====================================================');
  console.log('   PROBANDO ENDPOINT: POST /proyectos/:id/procesar-ia');
  console.log('=====================================================\n');

  // 1. Obtener la lista de proyectos o crear uno nuevo
  console.log('1. Verificando proyectos disponibles...');
  const resProyectos = await fetch(`${BASE_URL}/proyectos`);
  const proyectos = await resProyectos.json();

  let targetProject = proyectos.find(p => p.fuentes && p.fuentes.length > 0 && p.insumo_bruto);

  if (!targetProject) {
    console.log('Creando nuevo proyecto con insumo para la prueba...');
    const resNuevo = await fetch(`${BASE_URL}/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Sistema Supermercado La Granja',
        descripcion: 'Gestión de inventarios, punto de venta y facturación SRI con réplica y alta disponibilidad'
      })
    });
    targetProject = await resNuevo.json();

    // Subir fuente de texto con requisitos
    const dummyText = `El cliente solicita un sistema de punto de venta (POS) para supermercado.
Debe permitir registro de cajeros, administradores y supervisores.
Debe emitir facturación electrónica autorizada por el SRI en menos de 1.5 segundos por transacción.
Debe contar con contingencia offline si se cae la red local, sincronizando datos al restablecerse.
La base de datos debe tener réplica para failover automático en menos de 5 segundos.
Debe soportar hasta 1000 solicitudes concurrentes con Nginx como balanceador de carga.`;

    const formData = new FormData();
    const blob = new Blob([dummyText], { type: 'text/plain' });
    formData.append('archivo', blob, 'especificacion_requerimientos.txt');

    const resFuente = await fetch(`${BASE_URL}/proyectos/${targetProject.id}/fuentes`, {
      method: 'POST',
      body: formData
    });
    console.log('Fuente creada:', await resFuente.json());
  }

  console.log(`\n2. Proyecto seleccionado: ID=${targetProject.id || targetProject._id}, Nombre="${targetProject.nombre}"`);
  console.log(`Insumo bruto registrado (${targetProject.insumo_bruto ? targetProject.insumo_bruto.length : 0} caracteres):\n"${(targetProject.insumo_bruto || '').slice(0, 150)}..."\n`);

  console.log('3. Llamando al endpoint POST /proyectos/:id/procesar-ia (procesando con ModelosIaService)...');
  const startTime = Date.now();

  const resIA = await fetch(`${BASE_URL}/proyectos/${targetProject.id || targetProject._id}/procesar-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      insumo_adicional: 'Asegurar que los RNF incluyan métricas numéricas exactas de tiempo de respuesta y disponibilidad.'
    })
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Respuesta recibida en ${duration}s con estado HTTP ${resIA.status} ${resIA.statusText}\n`);

  if (!resIA.ok) {
    const errText = await resIA.text();
    console.error('Error del endpoint:', errText);
    process.exit(1);
  }

  const resultado = await resIA.json();
  console.log('=====================================================');
  console.log('             RESULTADO DE PROCESAR CON IA');
  console.log('=====================================================');
  console.log(`Proyecto ID: ${resultado.proyecto_id}`);
  console.log(`Requerimientos generados: ${resultado.requerimientos ? resultado.requerimientos.length : 0}`);
  console.log(`Diagramas generados: ${resultado.diagramas ? resultado.diagramas.length : 0}\n`);

  if (resultado.requerimientos && resultado.requerimientos.length > 0) {
    console.log('--- Muestra de Requerimientos generados ---');
    resultado.requerimientos.slice(0, 4).forEach((req, i) => {
      console.log(`[${req.identificador || req.tipo}] ${req.nombre}`);
      console.log(`   Descripción: ${req.descripcion}`);
      if (req.metrica_medible) console.log(`   Métrica Cuantificable: ${req.metrica_medible}`);
      console.log(`   Prioridad: ${req.prioridad} | Aprobado: ${req.aprobado}`);
    });
  }

  if (resultado.diagramas && resultado.diagramas.length > 0) {
    console.log('\n--- Muestra de Diagramas generados ---');
    resultado.diagramas.forEach((diag) => {
      console.log(`- Tipo: ${diag.tipo} | Título: "${diag.titulo}"`);
      console.log(`  Mermaid (primeras 2 líneas):\n  ${(diag.codigo_mermaid || '').split('\n').slice(0, 2).join('\n  ')}`);
    });
  }

  console.log('\n=====================================================');
  console.log('  TEST COMPLETADO CON ÉXITO: Endpoint funcionando OK');
  console.log('=====================================================');
}

testProcesarIA().catch(e => {
  console.error('Error ejecutando test:', e);
  process.exit(1);
});
