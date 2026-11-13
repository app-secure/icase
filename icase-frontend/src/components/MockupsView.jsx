import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Download,
  Info as InfoIcon, Layout, ListTree, Loader2, Monitor, Palette,
  RotateCcw, Smartphone, Tablet, WandSparkles
} from "lucide-react";
import {
  fetchLatestMockupJobApi, fetchMockupJobApi, fetchMockupsApi,
  startMockupJobApi, suggestMockupDesignSystemApi, updateMockupDesignSystemApi
} from "../services/api";
import { DEFAULT_DESIGN_SYSTEM, prepareMockupHtml } from "../utils/mockupHtml";
import DiagramProgressModal from "./DiagramProgressModal";

const formatName = (value = "") => value.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const SANITIZATION_NOTICES = /script peligroso|script no autorizado|manejadores inline|enlaces javascript|etiqueta potencialmente insegura|referencia a archivo local/i;
const validationIssues = (mockup) => [
  ...(mockup?.errores_validacion || []),
  ...(mockup?.advertencias_validacion || []).filter(message => !SANITIZATION_NOTICES.test(message))
];
const sanitizationNotices = (mockup) => [
  ...(mockup?.ajustes_sanitizacion || []),
  ...(mockup?.advertencias_validacion || []).filter(message => SANITIZATION_NOTICES.test(message))
];
const quality = (mockup) => {
  if ((mockup?.errores_validacion || []).length || mockup?.estado_calidad === "invalido") return "invalido";
  if (validationIssues(mockup).length) return "advertencia";
  return "valido";
};

const platformIcon = (platform, size = 13) => platform === "mobile"
  ? <Smartphone size={size} />
  : platform === "tablet" ? <Tablet size={size} /> : <Monitor size={size} />;

export default function MockupsView({
  mockups = [], onUpdateMockup, projectId, selectedScreen = 0, onSelectScreen, requirements = null,
  onTraceabilityChange, onActiveScreenChange, isFixing = false, fixingPrompt = null, onNotify = null
}) {
  const [viewMode, setViewMode] = useState("visual");
  const [activeId, setActiveId] = useState(mockups[selectedScreen]?.nombre_pantalla || "");
  const [manifest, setManifest] = useState([]);
  const [designSystem, setDesignSystem] = useState(DEFAULT_DESIGN_SYSTEM);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filter, setFilter] = useState("all");
  const [showPalette, setShowPalette] = useState(false);
  const [showCatalog, setShowCatalog] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [isModalDismissed, setIsModalDismissed] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [savingPalette, setSavingPalette] = useState(false);
  const [suggestingPalette, setSuggestingPalette] = useState(false);
  const [traceability, setTraceability] = useState(null);
  const handledJobRef = useRef(null);
  const initializedSelection = useRef(false);

  const notify = (payload) => {
    if (payload && onNotify) {
      onNotify(payload);
    }
  };

  const loadCatalog = async () => {
    if (!projectId) return;
    const data = await fetchMockupsApi(projectId);
    const catalog = data.manifiesto?.length ? data.manifiesto : (data.mockups || []).map((m, index) => ({
      pantalla_id: m.pantalla_id || m.nombre_pantalla, slug: m.nombre_pantalla,
      nombre: m.nombre_visible || formatName(m.nombre_pantalla), flujo: m.flujo || "General",
      modulo: m.modulo || "General", ruta: m.ruta || "", tipo: m.tipo || "otro",
      plataforma: m.plataforma || "web", roles: m.roles || ["Usuario"], shell: m.shell || "web-general", orden: index + 1
    }));
    setManifest(catalog);
    setTraceability(data.trazabilidad || null);
    onTraceabilityChange?.(data.trazabilidad || null);
    setDesignSystem(data.sistemaDiseno || DEFAULT_DESIGN_SYSTEM);
    if (!initializedSelection.current) {
      if (!data.mockups?.length) setShowPalette(true);
      setSelectedIds(new Set(catalog.map(p => p.slug)));
      initializedSelection.current = true;
    }
    if (data.mockups?.length && onUpdateMockup) onUpdateMockup(data.mockups);
    if (!activeId && catalog[0]) setActiveId(catalog[0].slug);
  };

  const applyJobResponse = (response, isInitialLoad = false) => {
    const job = response?.trabajo;
    if (!job) return;
    setActiveJob(job);
    if (["encolado", "procesando"].includes(job.estado)) {
      setIsModalDismissed(false);
    }
    if (job.estado === "completado" && handledJobRef.current !== job.id) {
      handledJobRef.current = job.id;
      if (response.mockups?.length && onUpdateMockup) onUpdateMockup(response.mockups);
      if (!isInitialLoad) {
        const repairWarnings = (job.advertencias || []).filter(message => /reparaci[oó]n no aplicada|reparables autom[aá]ticamente|quedan pendientes/i.test(message));
        notify({
          type: job.solo_reparar && !job.total_generados ? "error" : "success",
          message: job.solo_reparar
            ? `Reparación terminada: ${job.total_generados || 0} pantallas modificadas. ${repairWarnings.length ? repairWarnings.join(' ') : 'Revisa los controles antes de aprobar.'}`
            : `Generación completada: ${job.total_generados || 0} mockups disponibles.`
        });
      }
      loadCatalog().catch(() => {});
    } else if (job.estado === "fallido" && !isInitialLoad) {
      notify({ type: "error", message: job.error || "La generación falló." });
    }
  };

  // La carga remota inicializa catálogo, selección y sistema visual como una sola transacción de UI.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadCatalog().catch(() => {}); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    fetchLatestMockupJobApi(projectId).then(r => { if (!cancelled) applyJobResponse(r, true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeJob || !["encolado", "procesando"].includes(activeJob.estado)) return undefined;
    const timer = window.setInterval(() => fetchMockupJobApi(activeJob.id).then(r => applyJobResponse(r, false)).catch(e => notify({ type: "error", message: e.message })), 2000);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const mockupMap = useMemo(() => new Map(mockups.map((m, i) => [m.nombre_pantalla, { ...m, index: i }])), [mockups]);
  const screens = manifest.length ? manifest : [...mockupMap.values()].map((m, i) => ({
    pantalla_id: m.nombre_pantalla, slug: m.nombre_pantalla, nombre: formatName(m.nombre_pantalla),
    flujo: m.flujo || "General", modulo: m.modulo || "General", plataforma: m.plataforma || "web", orden: i + 1
  }));
  const visibleScreens = screens.filter(p => filter === "all" || p.plataforma === filter);
  const groups = useMemo(() => {
    const result = new Map();
    visibleScreens.forEach(screen => {
      const flow = screen.flujo || "General";
      const module = screen.modulo || "General";
      if (!result.has(flow)) result.set(flow, new Map());
      if (!result.get(flow).has(module)) result.get(flow).set(module, []);
      result.get(flow).get(module).push(screen);
    });
    return result;
  }, [visibleScreens]);
  const currentEntry = screens.find(p => p.slug === activeId) || screens[0];
  const currentMockup = currentEntry ? mockupMap.get(currentEntry.slug) : null;
  const currentPosition = currentEntry ? screens.findIndex(p => p.slug === currentEntry.slug) : -1;
  const busy = ["encolado", "procesando"].includes(activeJob?.estado);

  useEffect(() => {
    if (currentEntry) {
      onActiveScreenChange?.(currentEntry);
    }
  }, [currentEntry?.slug, currentEntry?.nombre]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isFixing && projectId && initializedSelection.current) {
      loadCatalog().catch(() => {});
    }
  }, [isFixing]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectScreen = (entry) => {
    setActiveId(entry.slug);
    onActiveScreenChange?.(entry);
    const generated = mockupMap.get(entry.slug);
    if (generated && onSelectScreen) onSelectScreen(generated.index);
    if (generated && quality(generated) !== "valido") setShowDetails(true);
  };
  const toggleScreen = (slug) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });
  const startGeneration = async (ids, label, soloReparar = false) => {
    if (!projectId || busy || (!ids.length && !soloReparar)) return;
    try {
      setIsModalDismissed(false);
      const response = await startMockupJobApi(projectId, ids, "", requirements, soloReparar);
      applyJobResponse(response, false);
    } catch (error) {
      notify({ type: "error", message: error.message });
    }
  };
  const savePalette = async () => {
    try {
      setSavingPalette(true);
      const response = await updateMockupDesignSystemApi(projectId, designSystem);
      setDesignSystem(response.sistemaDiseno);
      notify({ type: "success", message: "Paleta guardada sin regenerar pantallas." });
    } catch (error) { notify({ type: "error", message: error.message }); }
    finally { setSavingPalette(false); }
  };
  const applyPalette = async () => {
    if (busy) return;
    try {
      setSavingPalette(true);
      const response = await updateMockupDesignSystemApi(projectId, designSystem);
      setDesignSystem(response.sistemaDiseno);
      setShowPalette(false);
      await loadCatalog();
      notify({ type: "success", message: "Apariencia guardada sin regenerar ni consultar IA." });
    } catch (error) { notify({ type: "error", message: error.message }); }
    finally { setSavingPalette(false); }
  };
  const suggestPalette = async () => {
    try {
      setSuggestingPalette(true);
      const response = await suggestMockupDesignSystemApi(projectId);
      setDesignSystem(response.sistemaDiseno);
      notify({ type: "success", message: "La IA propuso una paleta. Revísala y guárdala si deseas aplicarla." });
    } catch (error) { notify({ type: "error", message: error.message }); }
    finally { setSuggestingPalette(false); }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {traceability && (
        <details open className={`rounded-xl border px-3 py-2 text-xs ${traceability.valido ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <summary className="cursor-pointer select-none"><span className="inline-flex w-[98%] flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold">{traceability.valido ? <Check size={13} /> : <AlertTriangle size={13} />}Trazabilidad árbol → mockups → RF</span>
            <span>{traceability.metricas?.mockups_generados || 0}/{traceability.metricas?.pantallas_arbol || 0} pantallas · {traceability.metricas?.cobertura_rf_altos_porcentaje ?? 0}% RF altos con vínculo</span>
          </span></summary>
          <p className="mt-1">{traceability.metricas?.criterios_ui_con_evidencia || 0}/{traceability.metricas?.criterios_ui_evaluados || 0} criterios UI específicos con evidencia. Vincular un RF no garantiza su implementación completa.</p>
          {[...(traceability.errores || []), ...(traceability.advertencias || [])].map((message, index) => <p key={index} className="mt-1">• {message}</p>)}
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {[['all', 'Todas'], ['web', 'Web'], ['tablet', 'Tablet'], ['mobile', 'Móvil']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-md px-2.5 py-1 text-xs ${filter === id ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-500"}`}>{label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowCatalog(value => !value)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${showCatalog ? 'border-[#CFC0F1] bg-[#F2EDFF] text-[#6D28D9]' : 'border-slate-200 text-slate-600'}`}><ListTree size={13} />Pantallas</button>
          <button onClick={() => setShowDetails(value => !value)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${showDetails ? 'border-[#CFC0F1] bg-[#F2EDFF] text-[#6D28D9]' : 'border-slate-200 text-slate-600'}`}><InfoIcon size={13} />Detalles</button>
          <button onClick={() => setSelectedIds(new Set(screens.filter(p => !mockupMap.has(p.slug) || quality(mockupMap.get(p.slug)) === 'invalido').map(p => p.slug)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">Solo faltantes o inválidas</button>
          <button disabled={busy || !mockups.length} onClick={() => startGeneration([], "Reparación de pendientes", true)} title="Una reparación por pantalla, hasta cinco por trabajo. Conserva originales si no mejora. No corrige vínculos o roles ambiguos." className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs text-violet-700 disabled:opacity-40">Reparar pendientes</button>
          <button onClick={() => setShowPalette(v => !v)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"><Palette size={13} />Paleta</button>
          <button disabled={busy || selectedIds.size === 0} onClick={() => startGeneration([...selectedIds], "Generación seleccionada")} className="flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-violet-900/10 hover:bg-[#6D28D9] disabled:opacity-40"><WandSparkles size={13} />Generar seleccionadas ({selectedIds.size})</button>
        </div>
      </div>

      {showPalette && <div className="absolute right-0 top-10 z-30 max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl" style={{ width: 'min(760px, calc(100vw - 2rem))' }}><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-800">Identidad visual · v{designSystem.version}</p><p className="text-[11px] text-slate-500">La previsualización refleja los colores al instante. Guardar aplica la apariencia sin consultar IA.</p></div><div className="flex items-center gap-2"><button disabled={suggestingPalette} onClick={suggestPalette} className="flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700 disabled:opacity-50">{suggestingPalette ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />}{suggestingPalette ? 'Consultando…' : 'Sugerencia IA'}</button><button onClick={() => setShowPalette(false)} className="text-lg leading-none text-slate-400">×</button></div></div><div className="mb-4 space-y-3"><label className="block text-xs">Nombre de la aplicación<input maxLength={100} value={designSystem.nombre_aplicacion || ""} onChange={e => setDesignSystem(prev => ({ ...prev, nombre_aplicacion: e.target.value }))} className="mt-1 block w-full rounded-lg border p-2" /></label><label className="block text-xs">Logo opcional · PNG, JPEG o WebP, máximo 1 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1048576 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { notify({ type: "error", message: "Usa PNG, JPEG o WebP de hasta 1 MB." }); return; } const reader = new FileReader(); reader.onload = () => setDesignSystem(prev => ({ ...prev, logo: reader.result })); reader.readAsDataURL(file); }} /></label>{designSystem.logo && <div className="flex items-center gap-3"><img src={designSystem.logo} alt="Logo de la aplicación" className="h-10 w-10 object-contain" /><button onClick={() => setDesignSystem(prev => ({ ...prev, logo: null }))}>Quitar logo</button></div>}<p className="text-xs text-slate-500">La estructura común se aplica a nuevas generaciones. Los mockups existentes se conservan.</p></div><div className="flex flex-wrap gap-3">{Object.entries(designSystem.colores || {}).map(([key, value]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-600"><input type="color" value={value} onChange={e => setDesignSystem(prev => ({ ...prev, origen: 'manual', colores: { ...prev.colores, [key]: e.target.value } }))} className="h-7 w-8 rounded border-0" /><span>{formatName(key)}</span></label>)}</div><div className="mt-4 flex flex-wrap justify-end gap-2"><button disabled={savingPalette} onClick={savePalette} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Guardar sin regenerar</button><button disabled={savingPalette || busy} onClick={applyPalette} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{savingPalette ? <Loader2 size={12} className="animate-spin" /> : <Palette size={12} />}Guardar apariencia</button></div></div>}

      <div className="flex min-h-[620px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {showCatalog && <aside className="w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-800">Flujos y pantallas</span><button onClick={() => setSelectedIds(selectedIds.size === screens.length ? new Set() : new Set(screens.map(p => p.slug)))} className="text-[11px] text-[#7C3AED]">{selectedIds.size === screens.length ? "Ninguna" : "Todas"}</button></div>
          {[...groups.entries()].map(([flow, modules]) => <div key={flow} className="mb-4"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{flow}</p>{[...modules.entries()].map(([module, items]) => <div key={module} className="mb-2"><p className="mb-1 pl-1 text-[11px] font-medium text-slate-600">{module}</p>{items.map(entry => { const generated = mockupMap.get(entry.slug); const state = generated ? quality(generated) : "faltante"; return <div key={entry.slug} className={`mb-1 flex items-start gap-2 rounded-lg border px-2 py-2 ${activeId === entry.slug ? "border-[#CFC0F1] bg-[#F2EDFF]" : "border-transparent hover:bg-white"}`}><input type="checkbox" checked={selectedIds.has(entry.slug)} onChange={() => toggleScreen(entry.slug)} className="mt-0.5 accent-[#7C3AED]" /><button onClick={() => selectScreen(entry)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-800">{platformIcon(entry.plataforma)}<span className="truncate">{entry.nombre || formatName(entry.slug)}</span></span><span className={`mt-1 flex items-center gap-1 text-[10px] ${state === 'invalido' ? 'text-red-600' : state === 'faltante' ? 'text-slate-400' : state === 'advertencia' ? 'text-amber-600' : 'text-[#4D7C0F]'}`}>{state === 'invalido' ? <AlertTriangle size={10} /> : state === 'valido' ? <Check size={10} /> : null}{state}</span></button></div>; })}</div>)}</div>)}
          {!screens.length && <p className="text-xs text-slate-400">El árbol no contiene pantallas reconocibles.</p>}
        </aside>}

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100/70">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{currentEntry?.nombre || "Selecciona una pantalla"}</p><p className="truncate text-[10px] text-slate-500">{currentEntry?.ruta || `${currentEntry?.flujo || ''} / ${currentEntry?.modulo || ''}`}</p></div><div className="flex items-center gap-1"><button disabled={currentPosition <= 0} onClick={() => selectScreen(screens[currentPosition - 1])} className="rounded p-1.5 disabled:opacity-30"><ChevronLeft size={15} /></button><span className="text-[10px] text-slate-500">{currentPosition + 1}/{screens.length}</span><button disabled={currentPosition < 0 || currentPosition >= screens.length - 1} onClick={() => selectScreen(screens[currentPosition + 1])} className="rounded p-1.5 disabled:opacity-30"><ChevronRight size={15} /></button><div className="ml-2 flex rounded-lg bg-slate-100 p-0.5"><button onClick={() => setViewMode('visual')} className={`rounded-md px-2 py-1 text-[11px] ${viewMode === 'visual' ? 'bg-white shadow-sm' : ''}`}>Diseño</button><button onClick={() => setViewMode('code')} className={`rounded-md px-2 py-1 text-[11px] ${viewMode === 'code' ? 'bg-white shadow-sm' : ''}`}>Código</button></div></div></div>
          {currentMockup && quality(currentMockup) !== "valido" && (
            <details open key={currentEntry?.slug} className={`border-b px-3 py-2 text-xs ${quality(currentMockup) === "invalido" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <summary className="cursor-pointer select-none font-semibold">{quality(currentMockup) === "invalido" ? "Problemas que impiden validar esta pantalla" : "Aspectos que conviene revisar"}</summary>
              {validationIssues(currentMockup).map((message, index) => <p key={index} className="mt-1 pl-5">• {message}</p>)}
            </details>
          )}
          <div className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto p-3">
            {isFixing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px] p-6 text-center">
                <div className="flex flex-col items-center rounded-2xl border border-violet-200 bg-white px-6 py-5 shadow-lg max-w-md">
                  <Loader2 size={28} className="animate-spin text-[#7C3AED] mb-2.5" />
                  <p className="text-sm font-semibold text-slate-900">
                    Procesando ajuste con IA en “{currentEntry?.nombre || currentEntry?.slug || "Mockup"}”...
                  </p>
                  {fixingPrompt && (
                    <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                      “{fixingPrompt}”
                    </p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[11px] font-medium text-violet-700 border border-violet-200">
                    Actualizando vista previa HTML...
                  </span>
                </div>
              </div>
            )}
            {currentMockup ? viewMode === "visual" ? <ScaledMockupPreview html={prepareMockupHtml(currentMockup.preview_code, designSystem)} platform={currentEntry?.plataforma} title={`Mockup ${currentMockup.nombre_pantalla}`} /> : <textarea value={currentMockup.preview_code} onChange={e => onUpdateMockup?.(currentMockup.nombre_pantalla, e.target.value)} className="h-full min-h-[540px] w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs" spellCheck="false" /> : <div className="m-auto max-w-sm text-center"><Layout className="mx-auto mb-3 text-slate-300" size={36} /><p className="text-sm font-semibold text-slate-700">Mockup pendiente</p><p className="mt-1 text-xs text-slate-500">Marca esta pantalla y usa “Generar seleccionadas” o escribe en el chat inferior para generarla con IA.</p></div>}
          </div>
        </main>

        {showDetails && <aside className="w-60 shrink-0 overflow-y-auto border-l border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-slate-800">Detalles de pantalla</p><button onClick={() => setShowDetails(false)} className="text-lg leading-none text-slate-400">×</button></div>{currentEntry && <div className="space-y-3 text-[11px]"><Info label="Plataforma" value={currentEntry.plataforma} icon={platformIcon(currentEntry.plataforma, 12)} /><Info label="Flujo" value={currentEntry.flujo} /><Info label="Módulo" value={currentEntry.modulo} /><Info label="Tipo" value={currentEntry.tipo} /><Info label="Roles" value={(currentEntry.roles || []).join(', ')} /><Info label="Shell compartido" value={currentEntry.shell} />{currentMockup && <><Info label="Estado" value={`${currentMockup.estado || 'generado'} · v${currentMockup.version || 1}`} /><div className={`rounded-lg border p-2 ${quality(currentMockup) === 'invalido' ? 'border-red-200 bg-red-50 text-red-700' : quality(currentMockup) === 'advertencia' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><p className="font-semibold">Calidad: {quality(currentMockup)}</p>{validationIssues(currentMockup).map((warning, i) => <p key={i} className="mt-1">• {warning}</p>)}</div>{sanitizationNotices(currentMockup).length > 0 && <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-700"><p className="font-semibold">Ajustes de seguridad aplicados</p>{sanitizationNotices(currentMockup).map((notice, i) => <p key={i} className="mt-1">• {notice}</p>)}</div>}<div className="flex flex-wrap gap-1"><button disabled={busy} onClick={() => startGeneration([currentEntry.slug], 'Regeneración')} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5"><RotateCcw size={11} />Regenerar</button><button onClick={() => navigator.clipboard.writeText(currentMockup.preview_code)} className="rounded-lg border border-slate-200 p-1.5" title="Copiar HTML"><Copy size={12} /></button><button onClick={() => { const url = URL.createObjectURL(new Blob([currentMockup.preview_code], { type: 'text/html' })); const a = document.createElement('a'); a.href = url; a.download = `${currentEntry.slug}.html`; a.click(); URL.revokeObjectURL(url); }} className="rounded-lg border border-slate-200 p-1.5" title="Descargar HTML"><Download size={12} /></button></div></>}</div>}</aside>}
      </div>

      <DiagramProgressModal
        isOpen={Boolean(busy && !isModalDismissed)}
        title="Generando wireframes y mockups"
        statusMessage={activeJob?.mensaje || ""}
        progress={activeJob?.progreso || 0}
        error={activeJob?.estado === "fallido" ? (activeJob.error || "La generación falló.") : null}
        onClose={() => setIsModalDismissed(true)}
      />
    </div>
  );
}

function ScaledMockupPreview({ html, platform = "web", title }) {
  const hostRef = useRef(null);
  const [scale, setScale] = useState(1);
  const baseWidth = platform === "mobile" ? 390 : platform === "tablet" ? 820 : 1440;
  const baseHeight = platform === "mobile" ? 844 : platform === "tablet" ? 900 : 820;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setScale(Math.min(1, Math.max(0.35, (host.clientWidth - 8) / baseWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [baseWidth]);

  return <div ref={hostRef} className="min-h-[540px] w-full overflow-auto"><div className="mx-auto overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" style={{ width: baseWidth * scale, height: baseHeight * scale }}><iframe srcDoc={html} sandbox="allow-scripts" title={title} style={{ width: baseWidth, height: baseHeight, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }} /></div><p className="mt-2 text-center text-[10px] text-slate-400">Vista {platform} · ajustada al {Math.round(scale * 100)}%</p></div>;
}

function Info({ label, value, icon = null }) {
  return <div><p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="flex items-center gap-1.5 break-words font-medium text-slate-700">{icon}{value || "No definido"}</p></div>;
}
