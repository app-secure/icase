import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleDashed, Download, FolderTree, LockKeyhole, RotateCcw, XCircle } from 'lucide-react';
import GenerationReport from './GenerationReport';

/** Estado de una pieza de la entrega, resumido en una palabra y un color. */
function stateOf(piece) {
  const artifact = piece.artifact;
  if (!artifact) return piece.blockedReason ? { key: 'blocked', label: 'Bloqueada', icon: LockKeyhole, tone: 'text-slate-400', ring: 'border-slate-200 bg-slate-50' } : { key: 'empty', label: 'Sin generar', icon: CircleDashed, tone: 'text-slate-500', ring: 'border-slate-200 bg-white' };
  if (artifact.aprobado) return { key: 'approved', label: 'Aprobada', icon: Check, tone: 'text-emerald-600', ring: 'border-emerald-200 bg-emerald-50/40' };
  if (artifact.estado === 'rechazado') return { key: 'rejected', label: 'Rechazada', icon: XCircle, tone: 'text-red-600', ring: 'border-red-200 bg-red-50/40' };
  return { key: 'review', label: 'En revisión', icon: CircleDashed, tone: 'text-amber-600', ring: 'border-amber-200 bg-amber-50/30' };
}

/** Resultado de la verificación en Docker, si ya se ejecutó. */
function verificationOf(artifact) {
  if (!artifact) return null;
  if (artifact.pendiente_reverificacion) return { label: 'Corrección por verificar', tone: 'border-amber-200 bg-amber-50 text-amber-800' };
  const result = artifact.verificacion?.estado;
  if (!result) return { label: 'Sin verificar', tone: 'border-slate-200 bg-slate-50 text-slate-500' };
  return { label: `Verificación: ${result}`, tone: /fall|error/i.test(result) ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

/** Los archivos agrupados por carpeta («backend/src · 42»), en lugar de una lista larga de rutas. */
function groupFiles(files = []) {
  const groups = new Map();
  files.forEach((file) => {
    const parts = String(file.ruta).split('/');
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts.length === 2 ? parts[0] : '(raíz)';
    groups.set(key, [...(groups.get(key) || []), file.ruta]);
  });
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

function FilesSummary({ files }) {
  const groups = useMemo(() => groupFiles(files), [files]);
  if (!groups.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Archivos ({files.length})</p>
      <div className="space-y-1">
        {groups.map(([folder, paths]) => (
          <details key={folder} className="rounded-lg border border-slate-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-xs text-slate-700"><span className="truncate font-mono">{folder}/</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{paths.length}</span></summary>
            <ul className="max-h-40 overflow-y-auto border-t border-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-600">{paths.map((path) => <li key={path} className="truncate">{path.slice(folder.length + 1) || path}</li>)}</ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function PieceCard({ index, piece, busy, notes, setNotes, rejecting, onRejectToggle, renderVerification, projectId }) {
  const [open, setOpen] = useState(false);
  const state = stateOf(piece);
  const artifact = piece.artifact;
  const check = verificationOf(artifact);
  const Icon = state.icon;
  const warnings = artifact?.advertencias || [];
  const reviewing = artifact?.estado === 'en_revision';
  const blocked = Boolean(piece.blockedReason);
  return (
    <li className={`rounded-xl border ${state.ring}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${state.key === 'approved' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-500'}`}>
          {state.key === 'approved' ? <Check size={14} strokeWidth={3} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-900">{piece.title}<span className={`inline-flex items-center gap-1 text-xs font-medium ${state.tone}`}><Icon size={12} />{state.label}</span></p>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={blocked ? piece.blockedReason : piece.subtitle}>
            {artifact ? `Versión ${artifact.version} · ${artifact.archivos?.length || 0} archivos` : blocked ? piece.blockedReason : piece.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {check && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${check.tone}`}>{check.label}</span>}
          {warnings.length > 0 && <span title="Hay advertencias en el detalle" className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">{warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}</span>}
          {reviewing && <>
            <button type="button" disabled={busy} onClick={onRejectToggle} className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">Rechazar</button>
            <button type="button" disabled={busy} onClick={() => piece.onReview('aprobar')} className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={12} className="mr-1 inline" />Aprobar</button>
          </>}
          {piece.generateButtons.map((button) => (
            <button key={button.label} type="button" disabled={busy || blocked} onClick={button.onClick} title={blocked ? piece.blockedReason : undefined}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${artifact ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
              {artifact && <RotateCcw size={12} />}{artifact ? `Regenerar${button.platform ? ` ${button.platform}` : ''}` : button.label}
            </button>
          ))}
          {artifact && <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Ocultar el detalle' : 'Ver el detalle'} title={open ? 'Ocultar el detalle' : 'Ver el detalle'} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"><ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></button>}
        </div>
      </div>

      {rejecting && reviewing && (
        <div className="border-t border-red-100 bg-red-50/40 px-4 py-3">
          <label className="block text-xs font-semibold text-slate-700">¿Qué debe cambiar?
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Indica el motivo o los ajustes que necesitas…" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal outline-none focus:border-violet-500" />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onRejectToggle} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-white">Cancelar</button>
            <button type="button" disabled={busy} onClick={() => { piece.onReview('rechazar'); onRejectToggle(); }} className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirmar rechazo</button>
          </div>
        </div>
      )}

      {piece.extra && reviewing && <div className="border-t border-slate-100 px-4 py-2">{piece.extra}</div>}

      {open && artifact && (
        <div className="space-y-4 border-t border-slate-100 bg-white/70 px-4 py-4">
          {warnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="mb-1 font-semibold">Advertencias</p><ul className="list-disc space-y-0.5 pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {piece.key === 'backend' && <GenerationReport projectId={projectId} artifact={artifact} />}
          {renderVerification(piece)}
          <FilesSummary files={artifact.archivos || []} />
        </div>
      )}
    </li>
  );
}

/**
 * «Generación y entrega»: las seis piezas de la entrega como una lista de pasos, cada una con su estado, su acción principal y, al abrirla,
 * su detalle (advertencias, verificación y archivos agrupados por carpeta). Todo lo secundario queda plegado.
 */
export default function DeliveryStage({ projectId, pieces, delivery, busy, notes, setNotes, gate, summaryChip, renderVerification }) {
  const [rejectingKey, setRejectingKey] = useState(null);
  const approved = pieces.filter((piece) => piece.artifact?.aprobado).length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Generación y entrega</h2>
            <p className="mt-0.5 text-xs text-slate-500">Genera, revisa y aprueba cada pieza en orden. Al final se arma el paquete descargable.</p>
          </div>
          <div className="flex items-center gap-2">{summaryChip}<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{approved} de {pieces.length} aprobadas</span></div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={pieces.length} aria-valuenow={approved}>
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(approved / pieces.length) * 100}%` }} />
        </div>
      </div>

      <ol className="space-y-2.5">
        {pieces.map((piece, index) => (
          <PieceCard key={piece.key} index={index + 1} piece={piece} busy={busy} notes={notes} setNotes={setNotes} projectId={projectId}
            rejecting={rejectingKey === piece.key} onRejectToggle={() => setRejectingKey((key) => (key === piece.key ? null : piece.key))} renderVerification={renderVerification} />
        ))}
      </ol>

      {gate}

      <div className={`rounded-2xl border p-5 ${delivery.artifact?.aprobado ? 'border-emerald-200 bg-emerald-50/40' : 'border-violet-200 bg-violet-50/40'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900"><FolderTree size={16} className="text-violet-600" />Paquete final de entrega</h3>
            <p className="mt-0.5 text-xs text-slate-500">{delivery.artifact ? `Entrega v${delivery.artifact.version} · ${delivery.artifact.archivos?.length || 0} archivos · ${delivery.artifact.aprobado ? 'aprobada' : delivery.artifact.estado}` : delivery.blockedReason || 'Consolida código, pruebas, infraestructura, CI/CD y huellas en un solo paquete.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {delivery.artifact?.aprobado && <button type="button" disabled={busy} onClick={delivery.onDownload} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Download size={14} />Descargar ZIP</button>}
            {delivery.artifact?.estado === 'en_revision' && <>
              <button type="button" disabled={busy} onClick={() => setRejectingKey((key) => (key === 'delivery' ? null : 'delivery'))} className="cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600">Rechazar</button>
              <button type="button" disabled={busy} onClick={() => delivery.onReview('aprobar')} className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprobar entrega</button>
            </>}
            <button type="button" disabled={busy || Boolean(delivery.blockedReason)} onClick={delivery.onGenerate} title={delivery.blockedReason || undefined}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${delivery.artifact ? 'border border-slate-200 bg-white text-slate-700' : 'bg-violet-700 text-white'}`}>
              {delivery.artifact ? <><RotateCcw size={12} />Regenerar paquete</> : 'Generar paquete final'}
            </button>
          </div>
        </div>
        {rejectingKey === 'delivery' && delivery.artifact?.estado === 'en_revision' && (
          <div className="mt-3 rounded-lg border border-red-100 bg-white p-3">
            <label className="block text-xs font-semibold text-slate-700">¿Qué debe cambiar?
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal outline-none focus:border-violet-500" />
            </label>
            <div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setRejectingKey(null)} className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-slate-600">Cancelar</button><button type="button" disabled={busy} onClick={() => { delivery.onReview('rechazar'); setRejectingKey(null); }} className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Confirmar rechazo</button></div>
          </div>
        )}
        {delivery.artifact?.estado === 'en_revision' && delivery.extra && <div className="mt-3 border-t border-violet-100 pt-3">{delivery.extra}</div>}
        {delivery.artifact && (
          <details className="mt-3 rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Detalle de la entrega</summary>
            <div className="space-y-4 border-t border-slate-100 p-3">{delivery.renderVerification}<FilesSummary files={delivery.artifact.archivos || []} /></div>
          </details>
        )}
        {delivery.afterApproval}
      </div>
    </div>
  );
}
