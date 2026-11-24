const { detect, instruction } = require('../src/core/services/ArchitectureStyle');

describe('estilo de la arquitectura de software', () => {
  test('sin recomendación describe el backend generado: módulos sobre una capa de datos común', () => {
    const style = detect(['La aplicación será una aplicación web con Node.js y Express.']);
    expect(style.id).toBe('modular');
    expect(instruction(['x'])).toMatch(/Capa de datos común/);
  });
  test('«MVC» recomendado en el insumo se dibuja como controladores, modelos y vistas', () => {
    expect(detect(['Recomiendo una arquitectura MVC para el servidor.']).id).toBe('mvc');
    expect(detect([{ decision: 'Modelo-Vista-Controlador' }]).id).toBe('mvc');
  });
  test('«arquitectura limpia» o «hexagonal» se dibuja por anillos', () => {
    expect(detect(['Usaremos Clean Architecture']).id).toBe('limpia');
    expect(detect(['arquitectura hexagonal con puertos y adaptadores']).id).toBe('limpia');
    expect(instruction(['clean architecture'])).toMatch(/Dominio.*Casos de uso/s);
  });
  test('por capas', () => {
    expect(detect(['arquitectura en capas']).id).toBe('capas');
  });
});
