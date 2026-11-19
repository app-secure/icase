import React from 'react';

export default function AnalysisEvidence({ item }) {
  const entries = item.evidencias?.length ? item.evidencias : item.evidencia ? [{ texto: item.evidencia }] : [];
  const groups = new Map();
  for (const entry of entries) {
    const source = entry.fuente || 'insumo directo';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(entry);
  }
  return [...groups].map(([source, fragments]) => <blockquote key={source}>
    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold"><span>{source}</span>{fragments.length > 1 && <span className="rounded-full bg-white px-2 py-0.5 text-violet-700">{fragments.length} fragmentos del mismo archivo</span>}</div>
    {fragments.map((entry, index) => <React.Fragment key={index}>{index > 0 && <div className="my-1 text-violet-400" aria-label="Fragmento no continuo">[…]</div>}<p className="whitespace-pre-wrap">“{entry.texto}”</p></React.Fragment>)}
    {fragments.filter(entry => entry.codigo === 'evidencia_ambigua' && entry.candidatos?.length).map((entry, index) => <details key={`candidates-${index}`} className="mt-2 rounded border border-amber-200 p-2"><summary className="cursor-pointer">Cita repetida: consultar ubicaciones ({entry.total_coincidencias})</summary><p className="mt-2 text-xs">Amplía la cita en el editor con el fragmento que sustenta esta afirmación. Ninguna ubicación se selecciona automáticamente.</p>{entry.candidatos.map((candidate, i) => <div key={i} className="mt-2 border-t pt-2"><strong className="text-xs">{candidate.fuente} · posición {candidate.inicio}</strong><p className="whitespace-pre-wrap">{candidate.contexto}</p></div>)}{entry.total_coincidencias > entry.candidatos.length && <p className="text-xs">Se muestran las primeras {entry.candidatos.length} coincidencias; consulta la fuente para las restantes.</p>}</details>)}
  </blockquote>);
}
