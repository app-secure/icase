const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');

const load = () => {
  const module = { exports: {} };
  new Function('module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/utils/plantumlNotes.js'), 'utf8'), { format: 'cjs' }).code)(module, module.exports);
  return module.exports;
};
const { hasNotes, stripNotes } = load();

const diagrama = `@startuml
class Paquete {
  +usosTotales: int
}
class Cliente
Cliente "1" --> "*" Paquete
note right of Paquete : Paquete semanal prepagado
note left of Cliente
  Quien compra el paquete.
  Puede tener varios.
end note
note "Regla del negocio" as N1
N1 .. Paquete
@enduml`;

describe('notas de PlantUML', () => {
  test('detecta si el diagrama tiene notas', () => {
    expect(hasNotes(diagrama)).toBe(true);
    expect(hasNotes('@startuml\nclass A\n@enduml')).toBe(false);
  });

  test('quita las notas de una línea, las de bloque y sus conectores, y conserva el modelo', () => {
    const limpio = stripNotes(diagrama);
    expect(limpio).not.toMatch(/note|N1|semanal prepagado|Quien compra/);
    expect(limpio).toContain('class Paquete {');
    expect(limpio).toContain('+usosTotales: int');
    expect(limpio).toContain('Cliente "1" --> "*" Paquete');
    expect(limpio.startsWith('@startuml')).toBe(true);
    expect(limpio.trim().endsWith('@enduml')).toBe(true);
  });

  test('un diagrama sin notas no cambia', () => {
    const simple = '@startuml\nclass A\n@enduml';
    expect(stripNotes(simple)).toBe(simple);
  });
});
