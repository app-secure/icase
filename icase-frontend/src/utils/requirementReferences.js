// Clasificar no implica validar cobertura: se conservan también referencias desconocidas.
export function groupRequirementReferences(references = []) {
  const ids = [...new Set(references.filter(id => typeof id === "string").map(id => id.trim()).filter(Boolean))];
  return [
    ["RF", ids.filter(id => /^RF[-_]/i.test(id))],
    ["RNF", ids.filter(id => /^RNF[-_]/i.test(id))],
    ["Otras referencias", ids.filter(id => !/^(RF|RNF)[-_]/i.test(id))]
  ].filter(([, values]) => values.length);
}
