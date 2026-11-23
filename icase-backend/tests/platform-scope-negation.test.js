const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');

const service = Object.create(CodePlanningProposalService.prototype);

test('«No se desarrollará aplicación móvil» no propone la plataforma móvil', () => {
  const texto = 'La aplicación será una aplicación web accedida desde computadoras en mostrador y oficina. No se desarrollará aplicación móvil. Queda fuera de alcance la aplicación móvil y los pagos en línea.';
  expect(service._alcance_plataforma({ texto, diseno: null }).valor.plataformas).toEqual(['web']);
});

test('una petición explícita de app móvil sí la propone', () => {
  const texto = 'Queremos una aplicación móvil para clientes con React Native. El personal usa la aplicación web.';
  expect(service._alcance_plataforma({ texto, diseno: null }).valor.plataformas).toEqual(['web', 'móvil']);
});

test('un «Dispositivo Móvil» dibujado por la IA en la arquitectura no propone la plataforma móvil', () => {
  const nl = String.fromCharCode(10);
  const texto = ['Será una aplicación web. No habrá aplicación móvil.', 'Deployment_Node(mobileDevice, "Dispositivo Móvil", "Plataforma aprobada") {', 'Container(mobileArtifact, "Aplicación Móvil", "Por definir", "Artefacto cliente")'].join(nl);
  const textoPlataforma = 'Será una aplicación web. No habrá aplicación móvil.';
  expect(service._alcance_plataforma({ texto: 'x', textoPlataforma: texto, diseno: null }).valor.plataformas).toEqual(['web', 'móvil']);
  expect(service._alcance_plataforma({ texto, textoPlataforma, diseno: null }).valor.plataformas).toEqual(['web']);
});
