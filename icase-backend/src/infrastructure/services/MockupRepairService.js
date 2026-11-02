const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

class MockupRepairService {
  constructor({ validator, traceability }) { this.validator = validator; this.traceability = traceability; }

  plan(mockups, manifest, requirements, selected = []) {
    const allowed = new Set(manifest.map(s => s.slug));
    const eligible = mockups.filter(m => allowed.has(m.nombre_pantalla) && (!selected.length || selected.includes(m.nombre_pantalla)) && (m.estado !== 'editado' || selected.includes(m.nombre_pantalla)));
    const targets = new Map();
    const add = (mockup, reason, criterion = null) => {
      const previous = targets.get(mockup.nombre_pantalla);
      targets.set(mockup.nombre_pantalla, { mockup, motivos: [...(previous?.motivos || []), reason], criterios: [...(previous?.criterios || []), ...(criterion ? [criterion] : [])] });
    };
    for (const mockup of eligible) {
      const quality = this.validator.validar(this.validator.sanitizar(mockup.preview_code).html);
      if (!quality.valido) add(mockup, 'HTML inválido: ' + quality.errores.join('; '));
    }
    const enriched = this.traceability.enrichAll(mockups, manifest, requirements);
    for (const requirement of this.traceability.functionalRequirements(requirements)) {
      const id = String(requirement.identificador || requirement.id || '').toUpperCase();
      const linked = enriched.filter(m => m.rf_trazabilidad.includes(id));
      const missing = this.traceability.functionalCoverage.validate(requirement, linked).filter(c => !c.presente);
      if (!missing.length) continue;
      const candidates = eligible.filter(m => linked.some(l => l.nombre_pantalla === m.nombre_pantalla) || manifest.find(s => s.slug === m.nombre_pantalla)?.rf_trazabilidad?.includes(id));
      const roles = (requirement.actores || []).map(normalize);
      const score = m => (m.roles || []).some(role => roles.some(r => normalize(role) === r || normalize(role).endsWith(' de ' + r))) ? 1 : 0;
      candidates.sort((a, b) => score(b) - score(a));
      if (candidates[0]) for (const criterion of missing) add(candidates[0], `${id}: falta ${criterion.tipo} (${criterion.valores.join(' / ')}); ${criterion.confianza}.`, { requisito: id, ...criterion });
    }
    return [...targets.values()];
  }

  accepts(previous, candidate, requirements, targetCriteria = null) {
    if (!candidate || candidate.nombre_pantalla !== previous.nombre_pantalla) return { valido: false, motivo: 'La IA cambió la identidad de la pantalla.' };
    if ((candidate.plataforma && previous.plataforma && candidate.plataforma !== previous.plataforma) || (Array.isArray(candidate.roles) && Array.isArray(previous.roles) && JSON.stringify(candidate.roles.map(normalize).sort()) !== JSON.stringify(previous.roles.map(normalize).sort()))) return { valido: false, motivo: 'La propuesta cambió la plataforma o los roles declarados.' };
    const quality = this.validator.validar(this.validator.sanitizar(candidate.preview_code).html);
    if (!quality.valido) return { valido: false, motivo: quality.errores.join('; ') };
    const coverage = this.traceability.functionalCoverage;
    const before = coverage.evidence(previous), after = coverage.evidence(candidate);
    const canonical = values => new Set(values.map(normalize).filter(Boolean));
    for (const kind of ['fields', 'actions']) {
      const current = canonical(after[kind]);
      if ([...canonical(before[kind])].some(value => !current.has(value))) return { valido: false, motivo: 'La propuesta eliminó o renombró campos/acciones existentes; se conserva el original.' };
    }
    let improvements = this.validator.validar(this.validator.sanitizar(previous.preview_code).html).valido ? 0 : 1;
    for (const requirement of this.traceability.functionalRequirements(requirements)) {
      const oldCriteria = coverage.validate(requirement, [previous]);
      const newCriteria = coverage.validate(requirement, [candidate]);
      if (oldCriteria.some((c, i) => c.presente && !newCriteria[i]?.presente)) return { valido: false, motivo: 'La propuesta perdió un criterio funcional ya presente.' };
      improvements += newCriteria.filter((c, i) => c.presente && !oldCriteria[i]?.presente && (!targetCriteria || targetCriteria.some(target => target.requisito === String(requirement.identificador || requirement.id || '').toUpperCase() && target.tipo === c.tipo && JSON.stringify(target.valores) === JSON.stringify(c.valores)))).length;
    }
    return improvements ? { valido: true } : { valido: false, motivo: 'La propuesta no mejoró los problemas detectados.' };
  }
}
module.exports = MockupRepairService;
