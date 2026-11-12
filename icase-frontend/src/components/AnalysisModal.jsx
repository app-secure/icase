import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function AnalysisModal({ open, title, onClose, busy = false, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.querySelector('[autofocus], textarea, input, select')?.focus({ preventScroll: true });
    const parent = previous?.closest('.initial-analysis');
    const scroll = parent?.style.overflow;
    if (parent) parent.style.overflow = 'hidden';
    return () => { dialog.close(); if (parent) parent.style.overflow = scroll; previous?.focus?.({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} aria-labelledby={titleId} className="analysis-modal initial-analysis"
    onCancel={event => { event.preventDefault(); if (!busy) close.current(); }}>
    <header className="analysis-modal__header"><h2 id={titleId}>{title}</h2><button type="button" aria-label="Cerrar formulario" disabled={busy} onClick={() => close.current()}><X size={18} /></button></header>
    <div className="analysis-modal__body">{children}</div>
  </dialog>, document.body);
}
