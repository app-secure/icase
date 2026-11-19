export function mockupCorrectionResult(result, previous, targetSlug) {
  const updated = result?.mockups?.find(m => m.nombre_pantalla === targetSlug);
  const adjustment = result?.ajustes?.find(item => item.nombre_pantalla === targetSlug);
  const changed = Boolean(updated?.preview_code?.trim())
    && updated.preview_code.trim() !== String(previous?.preview_code || '').trim();
  return {
    applied: result?.totalProcesados > 0 && changed && adjustment?.aplicado !== false,
    remainingWarnings: updated?.advertencias_validacion || [],
    resolvedWarnings: adjustment?.advertencias_resueltas || [],
    error: result?.error || adjustment?.motivo || 'No se confirmó una corrección en esta pantalla. Se conserva la versión anterior.'
  };
}
