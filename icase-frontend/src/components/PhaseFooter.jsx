import React, { useEffect, useRef, useState } from 'react';

/**
 * Pie de cada fase: ir a la anterior y, solo cuando esta fase ya se aprobó, a la siguiente. Separados para no pulsar uno por error.
 * `prev` y `next`: { label, onClick }; sin `next` (fase sin aprobar o última fase) solo sale el de la fase anterior.
 */
export default function PhaseFooter({ prev = null, next = null, overlay = false }) {
  const ref = useRef(null);
  const [offset, setOffset] = useState(0);
  // En «overlay» el pie flota sobre toda la vista, incluida la barra de pasos de la izquierda (con su botón «Mis proyectos»):
  // se desplaza lo que mida esa barra, contraída o no, observándola para seguirla mientras cambia de ancho.
  useEffect(() => {
    if (!overlay || !ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const host = ref.current.offsetParent || ref.current.parentElement;
    const measure = () => {
      const aside = host?.querySelector('aside');
      setOffset(aside ? Math.max(0, aside.getBoundingClientRect().right - host.getBoundingClientRect().left) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    const aside = host?.querySelector('aside');
    if (aside) observer.observe(aside);
    if (host) observer.observe(host);
    return () => observer.disconnect();
  }, [overlay]);
  if (!prev && !next) return null;
  // «overlay»: sin franja propia, flotando a la altura de la barra de acciones de la vista (modelamiento), para no restar espacio.
  if (overlay) {
    return (
      <div ref={ref} style={{ left: offset }} className="pointer-events-none absolute right-0 bottom-3 z-20 flex items-center justify-between gap-3 px-5">
        {prev ? <button type="button" onClick={prev.onClick} className="pointer-events-auto rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">← {prev.label}</button> : <span />}
        {next ? <button type="button" onClick={next.onClick} className="pointer-events-auto rounded-full bg-[#7C3AED] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6D28D9]">{next.label} →</button> : <span />}
      </div>
    );
  }
  return (
    <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-2.5 md:px-12">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        {prev ? <button type="button" onClick={prev.onClick} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">← {prev.label}</button> : <span />}
        {next ? <button type="button" onClick={next.onClick} className="rounded-full bg-[#7C3AED] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6D28D9]">{next.label} →</button> : <span />}
      </div>
    </div>
  );
}
