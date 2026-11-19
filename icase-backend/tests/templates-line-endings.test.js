const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../src/infrastructure/templates');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

// Los generadores localizan puntos de inserción con cadenas de varias líneas ('<div>\n  {can(...'): con CRLF no coinciden y la pieza se pierde en silencio.
test('las plantillas del generador usan saltos de línea LF', () => {
  const conCr = walk(root).filter((file) => !/\.(png|jpe?g|gif|ico|woff2?)$/i.test(file)).filter((file) => fs.readFileSync(file).includes(13)).map((file) => path.relative(root, file));
  expect(conCr).toEqual([]);
});

test('los adjuntos se insertan en la pantalla de registros', () => {
  const GenericFrontendGenerator = require('../src/infrastructure/services/GenericFrontendGenerator');
  const files = new GenericFrontendGenerator().generate({
    proyecto: { nombre: 'Demo' },
    screens: [{ nombre: 'Inventario', slug: 'inventario', plataforma: 'web', roles: ['Administrador'], rf_trazabilidad: ['RF-02'] }],
    requerimientos: [{ aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Inventario' }],
    decisiones: {
      stack_tecnologico: { plataformas: ['web'] },
      control_acceso: { autenticacion: { metodo: 'jwt' }, roles: [{ id: 'administrador', nombre: 'Administrador', incluir: true }] },
      modulos: { modo: 'personalizado', modulos: [{ id: 'archivos_imagenes', activo: true }] }
    }
  });
  const pantalla = files.find((file) => file.ruta === 'frontend/src/OperationScreen.jsx');
  expect(pantalla.contenido).toMatch(/<FilesPanel operation=\{capability\} record=\{record\.id \|\| record\._id\}\/>/);
});
