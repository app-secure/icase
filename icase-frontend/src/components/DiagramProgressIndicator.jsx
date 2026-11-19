import React from 'react';
import RequirementJobStatus from './RequirementJobStatus';

export default function DiagramProgressIndicator({ isOpen, title, isCorrection = false, diagramLabel = 'Diagrama', progress = 0, statusMessage = '', correctionPrompt, error, onClose, job = null }) {
  if (!isOpen) return null;
  const message = title || (isCorrection ? `Actualizando ${diagramLabel} con IA` : `Generando ${diagramLabel}`);
  const normalized = { ...job, tipo: 'diagrama', estado: error ? 'fallido' : 'procesando',
    mensaje: error ? `Error al generar ${diagramLabel}` : message, error, progreso: progress,
    progreso_requisitos: { etapa: job?.mensaje || diagramLabel,
      proveedor: job?.proveedor_usado || job?.proveedor || job?.provider,
      modelo: job?.modelo || job?.specific_model } };
  return <RequirementJobStatus key={job?.id || diagramLabel} job={normalized} showProgress showRecovery={false} onDismiss={error ? onClose : undefined}>
    {statusMessage && <p className="mt-2 text-slate-600">{statusMessage}</p>}
    {correctionPrompt && <div className="mt-3 border-t border-slate-100 pt-3"><strong>Instrucción solicitada</strong><p className="mt-1 whitespace-pre-wrap text-slate-600">{correctionPrompt}</p></div>}
  </RequirementJobStatus>;
}
