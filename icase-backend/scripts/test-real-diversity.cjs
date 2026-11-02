// IA real, archivos sintéticos: no modifica proyectos existentes ni publica datos.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const AI = require('../src/infrastructure/services/ModelosIaService');
const Ingestion = require('../src/infrastructure/services/FileIngestionService');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const { DIAGRAM_TYPE_VALUES } = require('../src/core/constants/DiagramTypes');
const { jsPDF } = require('../../icase-frontend/node_modules/jspdf/dist/jspdf.node.min.js');
const root = path.resolve(__dirname, '../verification-results/extended');
const report = { inicio: new Date().toISOString(), alcance: 'Ingesta real de PDF/audio sintéticos y generación con proveedores reales hasta diagramas; no equivale a ZIP de cada dominio', ingesta: [], escenarios: [] };
const save = () => fs.writeFileSync(path.join(root, 'diversidad.json'), JSON.stringify(report, null, 2));
(async () => {
  fs.mkdirSync(root, { recursive: true });
  const text = 'La clínica necesita una web para registrar pacientes, profesionales y citas. La recepcionista debe crear, consultar, modificar y eliminar esos registros. Usaremos React, NestJS y PostgreSQL. No necesitamos cobros ni alta disponibilidad.';
  const pdf = new jsPDF(); pdf.text(pdf.splitTextToSize(text, 170), 20, 30); pdf.save(path.join(root, 'clinica.pdf'));
  const inputs = [];
  for (const [name, type, keywords] of [['clinica.pdf', 'pdf', ['pacientes', 'citas']], ['biblioteca.wav', 'audio', ['libros', 'préstamos']]]) {
    try {
      const filename = path.join(root, name);
      const extracted = await new Ingestion().procesarArchivo({ path: filename, originalname: name, size: fs.statSync(filename).size }, type);
      fs.writeFileSync(path.join(root, name + '.txt'), extracted);
      const normalized = extracted.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const conserved = keywords.every(k => normalized.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
      report.ingesta.push({ archivo: name, tipo: type, estado: conserved ? 'correcto' : 'revisar_transcripcion', caracteres: extracted.length, sintetico: true });
      inputs.push({ name, text: extracted });
    } catch (error) { report.ingesta.push({ archivo: name, estado: 'fallido', error: error.message }); }
    save();
  }
  for (const [index, input] of inputs.entries()) {
    for (const provider of ['gemini', 'groq']) {
      const ai = new AI(); const scenario = { fuente: input.name, proveedor: provider, modelosConfigurados: ai.models[provider], diagramas: [], estado: 'en_ejecucion' }; report.escenarios.push(scenario);
      try {
        const analysis = await ai.procesar({ proyecto_id: 'diversidad-' + index + '-' + provider, insumo_bruto: input.text, objetivo: 'requisitos', provider, contexto_proyecto: {} });
        const requirements = analysis.requerimientos || [];
        fs.writeFileSync(path.join(root, input.name + '-' + provider + '-requisitos.json'), JSON.stringify(analysis, null, 2));
        if (!requirements.some(r => r.tipo === 'RF')) throw new Error('Sin requisitos funcionales');
        scenario.requisitos = requirements.length;
        scenario.sinEvidencia = requirements.filter(r => !r.evidencia).map(r => r.identificador);
        const approved = requirements.map(r => ({ ...r, aprobado: true })); const diagrams = [];
        // Dos recorridos a diagramas; las otras dos combinaciones comparan requisitos con el mismo insumo.
        if ((index === 0 && provider === 'groq') || (index === 1 && provider === 'gemini')) {
          for (const type of DIAGRAM_TYPE_VALUES) {
            const generated = await ai.procesar({ proyecto_id: 'diversidad-' + index + '-' + provider, nombre_proyecto: analysis.nombre_proyecto, insumo_bruto: input.text, objetivo: 'diagramas', tipo_diagrama: type, provider, contexto_proyecto: { requerimientos_aprobados: approved, diagramas_aprobados: diagrams } });
            const diagram = generated.diagramas?.find(d => d.tipo === type);
            if (!diagram) throw new Error('No devolvió ' + type);
            const quality = new Validator().validar(diagram.codigo_plantuml, { tipo: type, requisitos: approved, diagramasDependencia: diagrams });
            scenario.diagramas.push({ tipo: type, valido: quality.valido, errores: quality.errores, advertencias: quality.advertencias });
            fs.writeFileSync(path.join(root, input.name + '-' + provider + '-' + type + '.json'), JSON.stringify({ diagram, quality }, null, 2));
            if (!quality.valido) throw new Error('Diagrama rechazado: ' + type);
            diagrams.push({ ...diagram, aprobado: true, estado: 'aprobado', version: 1 }); save();
          }
        }
        scenario.estado = 'completado';
      } catch (error) { scenario.estado = 'fallido'; scenario.error = error.message; }
      save(); console.log('[Diversidad] ' + input.name + ' ' + provider + ': ' + scenario.estado);
    }
  }
  report.fin = new Date().toISOString(); save();
})().catch(error => { report.error = error.message; save(); console.error(error.message); process.exitCode = 1; });
