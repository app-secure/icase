import React, { useRef, useState } from 'react';
import { Upload, Download, FileCheck2, AlertTriangle, LoaderCircle } from 'lucide-react';
import AnalysisModal from './AnalysisModal';
import { exportProjectPackageApi, projectPackageApi } from '../services/api';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const labels = { proyecto: 'Proyecto', fuentes: 'Fuentes', analisis: 'Versiones de análisis', requisitos: 'Requisitos', diagramas: 'Diagramas / versiones', casos_uso: 'Casos de uso', disenos: 'Diseño', plan_codigo: 'Planes de código', artefactos_codigo: 'Artefactos de código', mockups: 'Mockups', archivos_codigo: 'Archivos de código' };
export default function ProjectTransferDialog({ open, onClose, projects, onImported }) {
  const [mode, setMode] = useState('export');
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 cursor-pointer disabled:cursor-default disabled:opacity-50';
  const field = 'mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-violet-500';
  function reset(next) { setMode(next); setError(''); setPreview(null); setResult(null); setFile(null); setName(''); setConfirmed(false); }
  async function run(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message || 'No se pudo completar la operación.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function exportPackage() {
    await run(async () => {
      const blob = await exportProjectPackageApi(projectId);
      const bundle = JSON.parse(await blob.text());
      download(blob, `proyecto-${projectId}.icase.json`);
      setResult({ counts: bundle.manifest.counts, report_markdown: bundle.report_markdown, exported: true });
    });
  }
  async function verify() {
    await run(async () => {
      const info = await projectPackageApi(file);
      setPreview(info); setName(`${info.nombre} (importado)`); setConfirmed(false);
    });
  }
  async function importPackage() {
    await run(async () => {
      const imported = await projectPackageApi(file, preview, name);
      setResult(imported); setPreview(null);
      await onImported?.();
    });
  }
  return <AnalysisModal open={open} title="Transferir proyecto" onClose={onClose} busy={busy} footer={
    <div className="flex flex-wrap items-center justify-end gap-2">
      {busy && <span role="status" className="mr-auto inline-flex items-center gap-2 text-sm text-violet-700"><LoaderCircle size={16} className="animate-spin" />Procesando transferencia…</span>}
      <button type="button" disabled={busy} onClick={onClose} className={button}>{result ? 'Cerrar' : 'Cancelar'}</button>
      {!result && mode === 'export' && <button type="button" disabled={busy || !projectId} onClick={exportPackage} className={`${button} !bg-violet-600 !text-white`}><Download size={16} />Exportar copia</button>}
      {!result && mode === 'import' && !preview && <button type="button" disabled={busy || !file} onClick={verify} className={`${button} !bg-violet-600 !text-white`}><FileCheck2 size={16} />Verificar paquete</button>}
      {!result && mode === 'import' && preview && <button type="button" disabled={busy || !confirmed || !name.trim()} onClick={importPackage} className={`${button} !bg-violet-600 !text-white`}><Upload size={16} />Crear copia importada</button>}
    </div>}>
    <div className="space-y-5 text-sm text-slate-600">
      <div className="flex gap-2" role="group" aria-label="Tipo de transferencia">
        {['export', 'import'].map(item => <button key={item} type="button" disabled={busy} onClick={() => reset(item)} aria-pressed={mode === item} className={`${button} ${mode === item ? '!bg-violet-50' : ''}`}>{item === 'export' ? 'Exportar' : 'Importar'}</button>)}
      </div>
      <p>Transfiere el avance guardado de un proyecto sin llamadas a IA. Incluye insumos originales, versiones, aprobaciones y artefactos. No incluye sesiones, claves de proveedores ni trabajos activos.</p>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
      {!result && mode === 'export' && <label className="block font-semibold text-slate-700">Proyecto para exportar<select aria-label="Proyecto para exportar" value={projectId} disabled={busy} onChange={e => setProjectId(e.target.value)} className={field}><option value="">Selecciona un proyecto guardado</option>{projects.map(p => <option key={p.id} value={p.backendId || p.id}>{p.name}</option>)}</select></label>}
      {!result && mode === 'import' && <>
        <label className="block font-semibold text-slate-700">Paquete .icase.json (máximo 64 MB)<input aria-label="Paquete para importar" type="file" accept=".json,.icase.json,application/json" disabled={busy} className={field} onChange={e => {
          const next = e.target.files?.[0]; setPreview(null); setConfirmed(false); setError('');
          if (next?.size > 64 * 1024 * 1024) { setFile(null); setError('El paquete supera 64 MB.'); return; }
          setFile(next || null);
        }} /></label>
        {preview && <>
          <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">Estructura, recuentos y huellas verificadas. Fase guardada: {preview.aprobaciones.fase}. Originales: {preview.archivos}.</p>
          <label className="block font-semibold text-slate-700">Nombre de la copia<input aria-label="Nombre de la copia" value={name} disabled={busy} onChange={e => setName(e.target.value)} maxLength={200} className={field} /></label>
          <label className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 accent-violet-600" /><span>Confío en la procedencia del paquete y confirmo crear una copia bajo mi usuario. Se conservarán aprobaciones históricas; no se sobrescribirá ningún proyecto.</span></label>
        </>}
      </>}
      {(preview || result) && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries((result || preview).counts).map(([key, count]) => <div key={key} className="rounded-xl border border-slate-200 bg-white p-3"><span className="block text-xs text-slate-500">{labels[key] || key}</span><strong className="text-lg text-slate-900">{count}</strong></div>)}</div>}
      {result && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{result.exported ? 'Paquete descargado. Guarda también el informe Markdown y comparte ambos archivos.' : 'Copia importada y verificada mediante lectura posterior. Ya está disponible en Mis proyectos.'}</div>}
      {(result || preview)?.report_markdown && <button type="button" className={button} onClick={() => download(new Blob([(result || preview).report_markdown], { type: 'text/markdown;charset=utf-8' }), result?.exported ? 'verificacion-exportacion.md' : result ? 'verificacion-importacion.md' : 'verificacion-paquete.md')}><Download size={16} />Descargar informe Markdown</button>}
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={16} className="shrink-0" />El paquete puede contener documentos y código sensibles del proyecto. SHA-256 no es una firma de autoría. Usa la misma versión de I-CASE en ambos equipos; las pruebas Docker y verificaciones de ejecución deben repetirse en el receptor.</p>
    </div>
  </AnalysisModal>;
}
