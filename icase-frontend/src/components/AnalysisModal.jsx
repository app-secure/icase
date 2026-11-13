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
    const onWheel = event => {
      let node = event.target instanceof Element ? event.target : dialog;
      while (node && node !== dialog.parentElement) {
        const style = getComputedStyle(node);
        const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
        if (canScroll) {
          const atTop = node.scrollTop <= 0;
          const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
          if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) return;
        }
        node = node.parentElement;
      }
      event.preventDefault();
    };
    dialog.addEventListener('wheel', onWheel, { passive: false });
    // The workspace scrolls independently of body. Lock every background
    // ancestor, not just the analysis section (which may not own the scroll).
    const elements = new Set([document.documentElement, document.body]);
    // Opening a dialog does not always focus the trigger (notably after
    // state updates). Locate the actual analysis scroll surface as well.
    document.querySelectorAll('.initial-analysis:not(dialog)').forEach(surface => {
      for (let element = surface; element; element = element.parentElement) elements.add(element);
    });
    for (let parent = previous?.parentElement; parent; parent = parent.parentElement) elements.add(parent);
    const locks = [...elements].filter(element => !dialog.contains(element)).map(element => {
      const value = element.style.getPropertyValue('overflow');
      const priority = element.style.getPropertyPriority('overflow');
      element.style.setProperty('overflow', 'hidden', 'important');
      return { element, value, priority };
    });
    return () => {
      dialog.removeEventListener('wheel', onWheel);
      dialog.close();
      locks.forEach(({ element, value, priority }) => {
        if (value) element.style.setProperty('overflow', value, priority);
        else element.style.removeProperty('overflow');
      });
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} aria-labelledby={titleId} className="analysis-modal initial-analysis"
    onCancel={event => { event.preventDefault(); if (!busy) close.current(); }}>
    <header className="analysis-modal__header"><h2 id={titleId}>{title}</h2><button type="button" aria-label="Cerrar formulario" disabled={busy} onClick={() => close.current()}><X size={18} /></button></header>
    <div className="analysis-modal__body">{children}</div>
  </dialog>, document.body);
}
