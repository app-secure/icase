const Policy = require('../src/infrastructure/services/DesignGenerationPolicy');

test('el plan inicial contiene todos los RF del proyecto, sin cuotas ni módulos prefijados', () => {
  const requirements = Array.from({ length: 40 }, (_, i) => ({ tipo: 'RF', identificador: `RF-${i + 1}`, nombre: `Operación clínica ${i + 1}` }));
  const result = new Policy().checklist([...requirements, { tipo: 'RNF', nombre: 'Latencia' }]);
  for (const requirement of requirements) expect(result).toContain(`${requirement.identificador}: ${requirement.nombre}`);
  expect(result).not.toContain('Latencia');
  expect(result).not.toContain('Restaurante');
});

test('detecta pérdida de clases o métodos aunque se agreguen muchas otras clases', () => {
  const before = 'class Turno {\n+id: String\n}\nclass TurnoService {\n+reservar(): void\n+cancelar(): void\n}\ninterface ITurnoRepository {\n+guardar(): void\n}';
  const after = 'class TurnoService {\n+reservar(): void\n}\nclass OtroDTO {\n+nombre: String\n}';
  expect(new Policy().lostMembers(before, after)).toEqual(expect.arrayContaining(['Turno', 'TurnoService.cancelar', 'ITurnoRepository', 'ITurnoRepository.guardar']));
  expect(new Policy().lostMembers(before, before + '\nclass Adicional')).toEqual([]);
});

test('reconoce alias y no interpreta paquetes como clases', () => {
  const code = 'package "Atención" {\nclass "Servicio de turnos" as TurnoService <<UseCase>> {\n+reservar(): void\n}\n}';
  expect([...new Policy().members(code)]).toEqual(['TurnoService', 'TurnoService.reservar']);
});
