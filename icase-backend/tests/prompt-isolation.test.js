const fs = require('fs');
const path = require('path');

const promptsDir = path.join(__dirname, '../src/infrastructure/prompts');

function readPrompt(name) {
  return fs.readFileSync(path.join(promptsDir, name), 'utf8');
}

describe('Aislamiento de prompts de generación', () => {
  test('el contrato de diagramas usa los seis tipos canónicos sin ejemplos de productos', () => {
    const prompt = readPrompt('estructura_salida.md');
    for (const type of [
      'casos_de_uso',
      'clases_dominio',
      'arquitectura_software',
      'arquitectura_sistema',
      'clases_diseno',
      'arbol_navegacion'
    ]) {
      expect(prompt).toContain(type);
    }

    expect(prompt).not.toMatch(/SmartMix|FarmaVida|Redis Cache|Prometheus|Grafana|NGINX/i);
    expect(prompt).toContain('"requerimientos": []');
  });

  test('los prompts especializados no preseleccionan infraestructura', () => {
    const prompt = [
      readPrompt('disenador_arquitectura_software.md'),
      readPrompt('disenador_arquitectura_sistema.md')
    ].join('\n');

    expect(prompt).not.toMatch(/AWS|GCP|Azure|DigitalOcean|Prometheus|Grafana|HAProxy|NGINX/i);
    expect(prompt).toContain('Por definir');
    expect(prompt).toContain('trazabilidad_rnf: []');
  });
});
