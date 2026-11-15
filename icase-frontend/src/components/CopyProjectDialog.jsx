import React, { useRef, useState } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import AnalysisModal from './AnalysisModal';
import { exportProjectPackageApi, projectPackageApi } from '../services/api';

export default function CopyProjectDialog({ project, onClose, onCopied }) {
  const [name, setName] = useState(`${project.name} (copia)`.slice(0, 200));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const prepared = useRef(null);
  const lock = useRef(false);
  const button = 'cursor-pointer rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50 disabled:cursor-default';
  async function copy() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      // Reutilizar el paquete y el identificador en un reintento evita copias duplicadas.
      if (!prepared.current) {
        const blob = await exportProjectPackageApi(project.backendId || project.id);
        const file = new File([blob], 'copia.icase.json', { type: 'application/json' });
        prepared.current = { file, preview: await projectPackageApi(file) };
      }
      const { file, preview } = prepared.current;
      const created = await projectPackageApi(file, preview, name.trim());
      setResult(created);
      await onCopied?.();
    } catch (e) { setError(e.message || 'No se pudo copiar el proyecto.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AnalysisModal open title="Copiar proyecto" busy={busy} onClose={onClose} footer={
    <div className="flex justify-end gap-2">
      <button type="button" className={button} disabled={busy} onClick={onClose}>{result ? 'Cerrar' : 'Cancelar'}</button>
      {!result && <button type="button" className={`${button} bg-violet-600 !text-white inline-flex items-center gap-2`} disabled={busy || !name.trim()} onClick={copy}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Copy size={16} />}{busy ? 'Copiando…' : 'Crear copia'}
      </button>}
    </div>}>
    <div className="space-y-4 text-sm text-slate-600">
      <p>Se creará una copia independiente de <strong>{project.name}</strong> con sus insumos, versiones, aprobaciones y artefactos guardados. El original no se modificará ni se realizarán llamadas a IA.</p>
      {!result && <label className="block font-semibold text-slate-700">Nombre de la copia<input aria-label="Nombre de la copia" maxLength={200} disabled={busy || Boolean(prepared.current)} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-violet-500" /></label>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
      {busy && <p role="status">Verificando y copiando los datos guardados…</p>}
      {result && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">Copia creada y verificada. Ya está disponible en Mis proyectos.</p>}
      <p className="rounded-xl bg-violet-50 p-3">Finaliza los trabajos activos antes de copiar. No se copian sesiones ni trabajos de IA; las verificaciones de ejecución del código deberán repetirse.</p>
    </div>
  </AnalysisModal>;
}
