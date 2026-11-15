import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import RbixLogo from './RbixLogo';

export default function SourcesDrawer({ open, onClose, children, side = 'left', id = 'project-sources-drawer', label = 'Insumos del proyecto', closeLabel = 'Cerrar insumos' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const surfaces = [...document.querySelectorAll('main, .initial-analysis:not(dialog)')].filter(element => !dialog.contains(element));
    const saved = surfaces.map(element => [element, element.style.overflow]);
    surfaces.forEach(element => { element.style.overflow = 'hidden'; });
    return () => { dialog.close(); saved.forEach(([element, overflow]) => { element.style.overflow = overflow; }); previous?.focus?.({ preventScroll: true }); };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog id={id} ref={ref} aria-label={label} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => { const rect = ref.current.getBoundingClientRect(); if (event.target === ref.current && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeRef.current(); }} className={`fixed inset-y-0 m-0 h-dvh max-h-none w-80 max-w-[90vw] border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40 ${side === 'right' ? 'left-auto right-0' : 'left-0 right-auto'}`} style={{ overscrollBehavior: 'contain' }}>
    <div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 items-center justify-between bg-[#171425] px-4 py-3 text-white"><div className="flex min-w-0 flex-col gap-2"><RbixLogo size="sm" isDark /></div><button type="button" onClick={onClose} aria-label={closeLabel} className="cursor-pointer rounded-lg p-2 hover:bg-white/10"><X size={18} /></button></div><div className="min-h-0 flex-1">{children}</div></div>
  </dialog>, document.body);
}
