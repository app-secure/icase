const { inspectEvidence } = require('../src/infrastructure/services/SourceEvidence');
const { build } = require('../src/infrastructure/services/RequirementSourceContext');
test('la cita del cocinero se localiza en el contenido original con su archivo', () => {
  const quote = 'En cocina se incluirá una pantalla KDS. Allí los cocineros verán las comandas nuevas, el tiempo transcurrido desde que fueron tomadas y el resumen de platos pendientes.';
  const input = build([{ nombre_archivo: 'entrevista_gerente.txt', texto_transcrito: `Analista:\n${quote}\n\nGerente:\nSí.` }]).content;
  const evidence = inspectEvidence({ evidencias: [{ texto: quote, fuente: 'entrevista_gerente.txt' }] }, input);
  expect(evidence.valido).toBe(true);
  expect(evidence.invalid).toEqual([]);
});
