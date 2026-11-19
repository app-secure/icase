// Comprobaciones orientativas de elementos y relaciones explícitos, no prueba operativa.
function review({ code, backupRequested, approvedText = '' }) {
  const warnings = [];
  const clean = String(code).replace(/\/'[\s\S]*?'\//g, '').replace(/^\s*'.*$/gm, '');
  const elements = [];
  const stack = [];
  for (const line of clean.split(/\r?\n/)) {
    let match = line.match(/^\s*(Deployment_Node|ContainerDb|Container|Component)\s*\(\s*(\w+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?/i);
    if (!match) {
      const native = line.match(/^\s*(node|cloud|database|storage|folder|artifact|component|rectangle)\s+(?:"([^"]+)"\s+as\s+(\w+)|(\w+))/i);
      if (native) match = [native[0], /^(?:node|cloud)$/i.test(native[1]) ? 'Deployment_Node' : /^(?:database|storage|folder)$/i.test(native[1]) ? 'ContainerDb' : 'Component', native[3] || native[4], native[2] || native[4], '', ''];
    }
    if (match) elements.push({ kind: match[1], alias: match[2], label: match[3], tech: match[4], text: `${match[3]} ${match[4]} ${match[5] || ''}`, parents: stack.filter(Boolean) });
    const braces = line.replace(/"(?:\\.|[^"\\])*"/g, '').match(/[{}]/g) || [];
    for (const brace of braces) {
      if (brace === '}') stack.pop();
      else stack.push(match?.[1] === 'Deployment_Node' ? elements.at(-1) : null);
    }
  }
  const relations = [...clean.matchAll(/\bRel(?:_[A-Za-z]+)?\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?/gim)]
    .map(m => ({ from: m[1], to: m[2], operation: m[3], protocol: m[4] || '' }));
  for (const m of clean.matchAll(/^\s*(\w+)\s*[-.]+>\s*(\w+)\s*:\s*(.+)$/gim)) relations.push({ from: m[1], to: m[2], operation: m[3], protocol: '' });
  for (const r of relations) {
    if (/^(?:HTTPS?|WSS?|TCP|SQL|PostgreSQL|Redis|WebSocket)(?:\b|\s*\/)/i.test(r.operation) && /por definir|^$/i.test(r.protocol)) {
      warnings.push('Despliegue por verificar: una relación usa el protocolo como operación y deja el canal por definir. Describe la operación en el tercer argumento de Rel y el protocolo aprobado en el cuarto.');
      break;
    }
  }
  const web = elements.filter(e => e.kind === 'Container' && /react(?! native)|tailwind|\bspa\b|angular|vue|aplicaci[oó]n web/i.test(e.text) && !/react native/i.test(e.tech));
  const isBrowser = e => e.parents.some(p => /dispositivo|tableta|tablet|navegador|computadora|ordenador|pantalla|estaci[oó]n de trabajo|\bpc\b|terminal/i.test(p.text));
  if (web.some(isBrowser) && !web.some(e => e.parents.length && !isBrowser(e))) {
    warnings.push('Despliegue por verificar: se muestra ejecución web en dispositivos, pero no un artefacto web alojado que distribuya sus recursos. Representa su alojamiento y entrega a navegadores; si no se decidió, indica Alojamiento web por definir sin elegir proveedor.');
  } else if (web.some(isBrowser) && !relations.some(r => web.filter(isBrowser).some(e => e.alias === r.from || e.alias === r.to) && web.filter(e => e.parents.length && !isBrowser(e)).some(e => e.alias === r.from || e.alias === r.to))) {
    warnings.push('Despliegue por verificar: conecta el artefacto web alojado con las instancias de navegador para mostrar la entrega de recursos.');
  }
  if (backupRequested) {
    const backup = /respaldo|backup|copia[s]? de seguridad|volcado|dump/i;
    const runners = elements.filter(e => /^(?:Container|Component)$/i.test(e.kind) && backup.test(e.text) && /proceso|tarea|ejecut|programad|scheduler|cron|job|export|dump/i.test(e.text));
    const stores = elements.filter(e => e.kind === 'ContainerDb' && backup.test(e.text));
    const data = elements.filter(e => e.kind === 'ContainerDb' && !stores.includes(e));
    if (!runners.length) warnings.push('Despliegue por verificar: el respaldo no tiene un proceso o tarea ejecutora identificable; una nota o un almacén no ejecutan la copia. Indica el mecanismo por definir sin inventar otro servidor.');
    if (!stores.length) warnings.push('Despliegue por verificar: falta un artefacto de almacenamiento de copias identificable. Un Boundary vacío no representa el destino; conserva las condiciones aprobadas o déjalas por definir.');
    const connected = (left, right) => relations.some(r => left.some(e => e.alias === r.from) && right.some(e => e.alias === r.to) || left.some(e => e.alias === r.to) && right.some(e => e.alias === r.from));
    if (runners.length && stores.length && (!connected(runners, data) || !connected(runners, stores))) warnings.push('Despliegue por verificar: conecta el ejecutor del respaldo tanto con los datos de origen como con el destino de copias.');
    const restores = r => /restaur|recuper|restore/i.test(r.operation);
    const directRestore = relations.some(r => restores(r) && stores.some(e => e.alias === r.from) && data.some(e => e.alias === r.to));
    const viaRunner = runners.some(runner => relations.some(r => restores(r) && r.from === runner.alias && data.some(e => e.alias === r.to)) &&
      relations.some(r => stores.some(e => e.alias === r.from) && r.to === runner.alias || stores.some(e => e.alias === r.to) && r.from === runner.alias && restores(r)));
    if (!directRestore && !viaRunner) {
      warnings.push('Despliegue por verificar: falta una ruta explícita de restauración desde las copias hacia los datos, directamente o mediante el ejecutor. La frecuencia de respaldo no acredita recuperación.');
    }
  }
  for (const provider of ['Vercel', 'Railway', 'AWS', 'Azure', 'GCP', 'DigitalOcean', 'Render', 'Heroku']) {
    const pattern = new RegExp(`\\b${provider}\\b`, 'i');
    if (elements.some(e => e.kind === 'Deployment_Node' && pattern.test(e.text)) && !pattern.test(approvedText)) warnings.push(`Despliegue por verificar: el proveedor ${provider} no se reconoce en los requisitos o decisiones confirmadas recibidos. Verifica su aprobación; si es una alternativa pendiente, usa Alojamiento por definir.`);
  }
  return [...new Set(warnings)];
}
module.exports = { review };
