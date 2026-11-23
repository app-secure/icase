import React from 'react';

/**
 * Pie de cada fase: ir a la anterior y, solo cuando esta fase ya se aprobó, a la siguiente. Separados para no pulsar uno por error.
 * `prev` y `next`: { label, onClick }; sin `next` (fase sin aprobar o última fase) solo sale el de la fase anterior.
 */
export default function PhaseFooter({ prev = null, next = null }) {
  if (!prev && !next) return null;
  return (
    <div className="z-10 w-full shrink-0 border-t border-slate-200 bg-white px-6 py-2.5 md:px-12">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        {prev ? <button type="button" onClick={prev.onClick} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">← {prev.label}</button> : <span />}
        {next ? <button type="button" onClick={next.onClick} className="rounded-full bg-[#7C3AED] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6D28D9]">{next.label} →</button> : <span />}
      </div>
    </div>
  );
}
