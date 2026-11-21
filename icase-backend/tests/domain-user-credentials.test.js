const { asegurarCredencialesUsuario } = require('../src/core/use-cases/ProcesarConIA');

const dominio = (cuerpo) => [{ tipo: 'clases_dominio', codigo_plantuml: `@startuml\npackage "Usuarios" {\n  class Usuario {\n${cuerpo}\n  }\n}\nclass Venta {\n    +String id\n}\n@enduml` }];
const login = [{ identificador: 'RF-12', tipo: 'RF', nombre: 'Autenticar acceso según rol' }];

describe('la entidad de cuentas tiene con qué iniciar sesión', () => {
  test('con un RF de autenticación añade correo y contraseña a Usuario (caso Ventas)', () => {
    const [diagrama] = asegurarCredencialesUsuario(dominio('    +String id\n    +String nombre\n    +String contacto\n    +String rol\n    +validarCredenciales(): boolean'), login);
    const usuario = diagrama.codigo_plantuml.match(/class Usuario \{([\s\S]*?)\n  \}/)[1];
    expect(usuario).toMatch(/\+String rol\n    \+String correo\n    \+String passwordHash\n    \+validarCredenciales/);
    expect(diagrama.codigo_plantuml).toMatch(/class Venta \{\n    \+String id\n\}/);
  });

  test('no toca la clase si ya tiene correo y contraseña (con la notación nombre : Tipo)', () => {
    const original = dominio('    +id : String\n    +email : String\n    +contrasena : String');
    const codigo = original[0].codigo_plantuml;
    expect(asegurarCredencialesUsuario(original, login)[0].codigo_plantuml).toBe(codigo);
  });

  test('sin RF de autenticación no inventa credenciales', () => {
    const original = dominio('    +String id\n    +String nombre');
    const codigo = original[0].codigo_plantuml;
    expect(asegurarCredencialesUsuario(original, [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Gestionar socios' }])[0].codigo_plantuml).toBe(codigo);
  });
});
