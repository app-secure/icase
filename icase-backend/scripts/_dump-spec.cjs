require('dotenv').config();
const m = require('mongoose');
(async () => {
  await m.connect(process.env.MONGO_URI);
  const Plan = require('../src/infrastructure/database/schemas/PlanCodificacionSchema');
  const plan = await Plan.findOne({ proyecto_id: process.argv[2] }).lean();
  const etapas = plan.etapas || [];
  console.log(etapas.map((e) => e.etapa + ':' + e.estado).join(' | '));
  const spec = etapas.find((e) => e.etapa === 'especificacion_aplicacion');
  const prop = spec?.propuesta || spec?.decision || spec;
  require('fs').writeFileSync(process.argv[3], JSON.stringify(spec, null, 2));
  process.exit(0);
})();
