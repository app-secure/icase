// Comprueba la configuración de Amazon Bedrock con una llamada real y mínima (unos pocos tokens).
// Uso: node scripts/probar-bedrock.js [idDelModelo]
require('dotenv').config();
const BedrockClient = require('../src/infrastructure/services/BedrockClient');

(async () => {
  const cliente = new BedrockClient();
  const modelo = process.argv[2] || (process.env.BEDROCK_MODELS || '').split(',')[0].trim();
  const fallos = [];
  if (!cliente.configured) fallos.push('Falta BEDROCK_API_KEY en .env');
  if (!modelo) fallos.push('Falta BEDROCK_MODELS en .env (o pasa el ID como argumento)');
  let region = '';
  try { region = cliente.region; } catch (error) { fallos.push(error.message); }
  console.log(`Región: ${region || '—'} | Modelo: ${modelo || '—'} | Clave: ${cliente.configured ? 'presente' : 'ausente'}`);
  console.log(`Orden de proveedores: ${process.env.AI_PROVIDER_ORDER || '(por defecto, sin bedrock)'}`);
  if (!/(^|,)\s*bedrock\s*(,|$)/.test(process.env.AI_PROVIDER_ORDER || '')) fallos.push('«bedrock» no está en AI_PROVIDER_ORDER: el proveedor existe pero no se usará');
  if (!cliente.configured || !modelo || !region) { console.error('✗ ' + fallos.join('\n✗ ')); process.exit(1); }

  try {
    const inicio = Date.now();
    const r = await cliente.converse({ modelId: modelo, prompt: 'Responde únicamente con este JSON: {"ok":true}', maxTokens: 50, temperature: 0, timeout: 60000 });
    console.log(`✓ Respuesta en ${Date.now() - inicio} ms: ${r.text.trim()} (stopReason=${r.stopReason}, tokens=${JSON.stringify(r.usage)})`);
    if (fallos.length) { console.error('⚠ ' + fallos.join('\n⚠ ')); process.exit(2); }
  } catch (error) {
    const status = error.response?.status;
    const cuenta = /operation not allowed/i.test(BedrockClient.messageOf(error));
    const pista = cuenta ? 'La cuenta de AWS no tiene permitida la inferencia (no es un problema del ID: falla con cualquier modelo). Revisa en la consola de AWS el plan de la cuenta (plan gratuito/créditos), el método de pago verificado y Bedrock → Model access.' : { 400: 'ID de modelo inválido, o ese modelo exige un perfil de inferencia (prefijo «us.»).', 401: 'Clave de API inválida o caducada.', 403: 'La clave no tiene permiso o no has activado el acceso a ese modelo en Bedrock.', 404: 'Modelo no encontrado en esa región.', 429: 'Cuota o límite de peticiones.' }[status] || 'Revisa región y conectividad.';
    console.error(`✗ HTTP ${status || '—'}: ${BedrockClient.messageOf(error)}\n  → ${pista}`);
    process.exit(1);
  }
})();
