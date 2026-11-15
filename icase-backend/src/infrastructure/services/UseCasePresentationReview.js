// Revisión orientativa de presentación: nunca transforma código ni decide cobertura.
function reviewUseCasePresentation(code, caseCount) {
  const warnings = [];
  const stack = [];
  const modules = new Set();
  let declaration = null;
  let outside = false;
  let ungrouped = false;
  const source = String(code)
    .replace(/\/'[\s\S]*?'\//g, '')
    .replace(/^\s*note\b[^\n:]*\n[\s\S]*?^\s*end\s*note\b[^\n]*/gim, '')
    .replace(/^\s*note\b[^\n]*:[^\n]*$/gim, '');
  // Las cadenas se consumen enteras: sus llaves y palabras no son bloques.
  const tokens = source.match(/"(?:\\.|[^"\\])*"|'[^\n]*|[{}]|\b(?:rectangle|package|usecase)\b/g) || [];
  for (const token of tokens) {
    if (token.startsWith('"') || token.startsWith("'")) continue;
    if (token === 'rectangle' || token === 'package') declaration = { type: token };
    else if (token === '{') {
      stack.push(declaration || { type: 'other' });
      declaration = null;
    } else if (token === '}') {
      stack.pop();
      declaration = null;
    } else if (token === 'usecase') {
      declaration = null;
      // Acepta también un package raíz como límite del sistema heredado.
      const boundary = stack.findIndex(item => ['rectangle', 'package'].includes(item.type));
      const module = stack.slice(boundary + 1).find(item => item.type === 'package');
      if (boundary < 0) outside = true;
      if (!module) ungrouped = true;
      else modules.add(module);
    }
  }
  if (outside) warnings.push('Hay casos fuera del límite del sistema: revisa su ubicación sin modificar sus actores ni referencias RF.');
  if (caseCount > 14 && (modules.size < 2 || ungrouped)) {
    warnings.push('La vista es extensa: organiza los casos en módulos por capacidades dentro del límite del sistema, sin reducir cobertura. Conserva casos, alias, actores y referencias RF.');
  }
  // Solo nominalizaciones conocidas; no se pretende reconocer todos los verbos.
  // Una coincidencia genera una observación, nunca un error o un renombrado.
  const nominal = /^(?:revision|gestion|reasignacion|modificacion|consulta|cierre|registro|visualizacion|validacion|autenticacion|compra|acumulacion|configuracion)\b/;
  const labels = [...source.matchAll(/^\s*usecase\s+(?:"((?:\\.|[^"\\])*)"|[\w.]+\s+as\s+"((?:\\.|[^"\\])*)")/gim)]
    .map(match => (match[1] || match[2]).replace(/\\n/g, ' ').replace(/\[?RF-\d+\]?/gi, '').trim())
    .filter(label => nominal.test(label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  if (labels.length) warnings.push(`Nombres por revisar (señal orientativa): ${[...new Set(labels)].join(', ')}. Prefiere verbo en infinitivo y objeto, conservando el significado y las referencias RF.`);
  return { advertencias: warnings, metricas: { modulos_casos_uso: modules.size } };
}

module.exports = { reviewUseCasePresentation };
