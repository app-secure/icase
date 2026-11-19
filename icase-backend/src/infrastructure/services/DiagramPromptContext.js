// Proyección conservadora: elimina metadatos de auditoría, no RF ni obligaciones.
// Solo descarta contexto claramente exclusivo de otra vista; lo ambiguo se conserva.
function selectAnalysis(analysis = {}, type) {
  const infrastructure = /backup|copia.*seguridad|replica|failover|balanceador|hosting|despliegue|servidor|infraestructura|contenedor docker/i;
  const interaction = /pantalla|interfaz|dispositivo|tableta|movil|naveg|acceso|rol|usab|accesib/i;
  const sections = ['reglas_negocio', 'restricciones_tecnicas', 'contexto', 'decisiones', 'preguntas_pendientes'];
  return Object.fromEntries(sections.map(section => [section, (analysis[section] || []).filter(item => {
    const text = String(item.necesidad || '');
    // Las exclusiones y decisiones pendientes nunca se silencian.
    if (section === 'decisiones' || section === 'preguntas_pendientes' || section === 'restricciones_tecnicas' || item.objetivos_relacionados?.length) return true;
    if (['arbol_navegacion', 'clases_diseno', 'clases_dominio'].includes(type) && infrastructure.test(text) && !interaction.test(text)) return false;
    // En despliegue, las reglas de negocio pertenecen a la arquitectura lógica ya aprobada.
    if (type === 'arquitectura_sistema' && section === 'reglas_negocio' && !infrastructure.test(text) && !interaction.test(text)) return false;
    return true;
  }).map(item => ({ id: item.id, tipo: item.tipo, necesidad: item.necesidad, estado: item.estado,
    ...(item.objetivos_relacionados ? { objetivos_relacionados: item.objetivos_relacionados } : {}) }))]));
}

function diagramDirectives(text, type) {
  const sections = String(text).split(/(?=^### )/m);
  const marker = {
    casos_de_uso: '### 1.', arquitectura_software: '### 2.', arquitectura_sistema: '### 3.',
    clases_dominio: '### 4.', arbol_navegacion: '### 5.'
  }[type];
  return sections.filter((section, index) => index === 0 || section.startsWith('### REGLA') || (marker && section.startsWith(marker))).join('');
}
module.exports = { selectAnalysis, diagramDirectives };
