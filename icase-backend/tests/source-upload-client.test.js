const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

function client(fetch) {
  const code = transformSync(fs.readFileSync(path.join(__dirname, '../../icase-frontend/src/services/api.js'), 'utf8'), {
    format: 'cjs', define: { 'import.meta.env': JSON.stringify({ DEV: true }) }
  }).code;
  const sandbox = {
    exports: {}, module: { exports: {} }, fetch,
    localStorage: { getItem: () => 'test-token' },
    window: { dispatchEvent: jest.fn() }, Event: class Event {},
    FormData: class FormData { append() {} }, console: { warn: jest.fn() }
  };
  vm.runInNewContext(code, sandbox);
  return { api: sandbox.module.exports, sandbox };
}

describe('errores de persistencia del cliente', () => {
  test('envía regeneración explícita sin alterar el tipo ni los insumos', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ trabajo: { id: 'job' } }) });
    await client(fetch).api.startDiagramJobApi('project', 'clases_dominio', '', '', 'auto', null, true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({ tipo_diagrama: 'clases_dominio', regenerar: true, insumo_adicional: '' }));
  });
  test('recupera el trabajo activo después de ECONNRESET sin repetir el POST', async () => {
    const fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({ ok: true, json: async () => ({ trabajo: { id: 'job', tipo_diagrama: 'casos_de_uso', estado: 'procesando' } }) });
    const result = await client(fetch).api.startDiagramJobApi('project', 'casos_de_uso');
    expect(result.recuperado_tras_desconexion).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('ultimo?tipo_diagrama=casos_de_uso');
    expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1);
  });
  test('no recupera un trabajo antiguo completado o de otro tipo como si fuera el solicitado', async () => {
    const fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({ ok: true, json: async () => ({ trabajo: { id: 'old', tipo_diagrama: 'clases_dominio', estado: 'completado' } }) });
    await expect(client(fetch).api.startDiagramJobApi('project', 'casos_de_uso')).rejects.toThrow('Se interrumpió la conexión');
  });
  test('un error de validación HTTP no se reintenta ni se confunde con una desconexión', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Requisitos no aprobados' }) });
    await expect(client(fetch).api.startDiagramJobApi('project', 'casos_de_uso')).rejects.toThrow('Requisitos no aprobados');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('usa el proxy del mismo origen para consultar proyectos en desarrollo', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    await client(fetch).api.fetchProjects();
    expect(fetch.mock.calls[0][0]).toBe('/icase-api/proyectos');
  });
  test('propaga fallo de conexión en lugar de presentar lista vacía', async () => {
    const { api } = client(jest.fn().mockRejectedValue(new Error('Failed to fetch')));
    await expect(api.fetchProjects()).rejects.toThrow('No se pudieron cargar los proyectos');
  });
  test('no simula un proyecto guardado si falla su creación', async () => {
    const { api } = client(jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Servidor no disponible' }) }));
    await expect(api.createProjectApi({ nombre: 'Prueba' })).rejects.toThrow('Servidor no disponible');
  });
  test('no convierte un fallo de transcripción en una fuente local aparentemente cargada', async () => {
    const { api } = client(jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'No se pudo extraer texto' }) }));
    await expect(api.uploadFuenteApi('project', {})).rejects.toThrow('No se pudo extraer texto');
  });
  test('conserva identificador y transcripción confirmados por el servidor', async () => {
    const source = { id: 'saved-source', texto_transcrito: 'Contenido extraído' };
    const { api } = client(jest.fn().mockResolvedValue({ ok: true, json: async () => source }));
    await expect(api.uploadFuenteApi('project', {})).resolves.toEqual(source);
  });
  test('una sesión caducada notifica a la aplicación y propaga el fallo', async () => {
    const { api, sandbox } = client(jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Sesión caducada' }) }));
    await expect(api.fetchProjects()).rejects.toThrow('Sesión caducada');
    expect(sandbox.window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
