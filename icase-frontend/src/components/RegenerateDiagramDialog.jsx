import React, { useEffect, useRef } from 'react';

export default function RegenerateDiagramDialog({ target, busy, onCancel, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (target && !dialog.current.open) dialog.current.showModal();
    if (!target && dialog.current.open) dialog.current.close();
  }, [target]);

  return (
    <dialog ref={dialog} aria-labelledby="regenerate-diagram-title"
      aria-describedby="regenerate-diagram-description"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 p-6 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="regenerate-diagram-title" className="text-lg font-semibold text-slate-900">¿Regenerar {target?.label}?</h2>
      <div id="regenerate-diagram-description" className="mt-3 space-y-2 text-sm text-slate-600">
        <p>La IA generará de nuevo únicamente este diagrama desde los requisitos y dependencias aprobados, sin reutilizar la versión en caché. Consumirá una nueva solicitud de IA.</p>
        <p>La versión anterior seguirá en el historial. La nueva necesitará aprobación y los artefactos dependientes podrán requerir revisión.</p>
        {target?.unsaved && <p className="font-medium text-amber-700">Tienes cambios de código sin guardar: se descartarán si la regeneración se inicia correctamente.</p>}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" autoFocus disabled={busy} onClick={onCancel}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Cancelar</button>
        <button type="button" disabled={busy} onClick={onConfirm}
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Iniciando…' : 'Sí, regenerar diagrama'}
        </button>
      </div>
    </dialog>
  );
}
