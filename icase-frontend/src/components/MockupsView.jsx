import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, Download,
  Info as InfoIcon, Layout, ListTree, Loader2, Monitor, Palette,
  Ellipsis, ExternalLink, Maximize2, PanelLeftClose, RotateCcw, Smartphone, Tablet, Trash2, WandSparkles
} from "lucide-react";
import {
  deleteMockupApi, fetchLatestMockupJobApi, fetchMockupJobApi, fetchMockupsApi, markMockupControlsUiApi,
  startMockupJobApi, suggestMockupDesignSystemApi, updateMockupDesignSystemApi
} from "../services/api";
import { DEFAULT_DESIGN_SYSTEM, prepareMockupHtml } from "../utils/mockupHtml";
import DiagramProgressIndicator from "./DiagramProgressModal";
import { htmlZip, mockupFilename, downloadMockupBlob } from '../utils/mockupDownload';

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
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [traceability, setTraceability] = useState(null);
  const [markingUi, setMarkingUi] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [zoom, setZoom] = useState('fit');
  const handledJobRef = useRef(null);
  const savedProgressRef = useRef('');
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
      // Cada lote se guarda al terminar: las pantallas ya hechas aparecen sin esperar al final del trabajo.
      if (/guardad[oa]s?$/.test(job.mensaje || '') && savedProgressRef.current !== `${job.id}:${job.mensaje}`) {
        savedProgressRef.current = `${job.id}:${job.mensaje}`;
        loadCatalog().catch(() => {});
      }
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
            : /^Se generaron \d+ de \d+/.test(job.mensaje || '') ? `${job.mensaje}. Vuelve a generar las que faltan.` : `Generación completada: ${job.total_generados || 0} mockups disponibles.`
        });
      }
      loadCatalog().catch(() => {});
    } else if (job.estado === "fallido" && !isInitialLoad && handledJobRef.current !== job.id) {
      handledJobRef.current = job.id;
      // Lo que se alcanzó a guardar antes del fallo se muestra, y el error queda visible hasta que se cierre.
      setIsModalDismissed(false);
      notify({ type: "error", message: job.error || "La generación falló." });
      loadCatalog().catch(() => {});
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
  const downloadableMockups = mockups.filter(m => typeof m.preview_code === 'string' && m.preview_code.trim());
  const downloadHtml = () => downloadMockupBlob(new Blob([prepareMockupHtml(currentMockup.preview_code, designSystem)], { type: 'text/html;charset=utf-8' }), mockupFilename(currentMockup.nombre_pantalla));
  // En el ZIP cada enlace entre pantallas apunta al archivo de su destino, así se puede navegar el prototipo sin la aplicación.
  const downloadAllHtml = () => {
    const links = Object.fromEntries(downloadableMockups.map((m, i) => [m.nombre_pantalla, mockupFilename(m.nombre_pantalla, i + 1)]));
    downloadMockupBlob(htmlZip(downloadableMockups.map((m, i) => ({ name: mockupFilename(m.nombre_pantalla, i + 1), html: prepareMockupHtml(m.preview_code, designSystem, { links }) }))), 'mockups-html.zip');
  };
  // Abre el prototipo en una pestaña propia: la pantalla actual a todo el tamaño de la ventana y, con los enlaces del propio diseño o las
  // flechas del teclado, el resto de pantallas generadas.
  const openFullscreen = () => {
    if (!currentMockup?.preview_code?.trim()) return;
    const data = {};
    const order = [];
    screens.forEach((entry) => {
      const generated = mockupMap.get(entry.slug);
      if (!generated?.preview_code?.trim()) return;
      data[entry.slug] = { name: entry.nombre || formatName(entry.slug), platform: entry.plataforma || 'web', html: prepareMockupHtml(generated.preview_code, designSystem) };
      order.push(entry.slug);
    });
    const safe = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '');
    const page = [
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mockup</title>',
      '<style>html,body{margin:0;height:100%;background:#e2e8f0;font-family:system-ui,sans-serif}#w{height:100%}#w.phone{display:flex;align-items:center;justify-content:center}',
      '#w.phone #f{width:min(430px,100%);height:min(932px,100%);border-radius:24px;box-shadow:0 10px 40px rgba(15,23,42,.25)}#f{border:0;width:100%;height:100%;background:#fff;display:block}',
      '#n{position:fixed;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.88);color:#fff;border-radius:999px;padding:5px 10px;font-size:12px;opacity:.35;transition:opacity .15s}#n:hover{opacity:1}',
      '#n button{background:none;border:0;color:#fff;cursor:pointer;font-size:15px;padding:0 4px}</style></head><body>',
      '<div id="w"><iframe id="f" title="Mockup" sandbox="allow-scripts"></iframe></div>',
      '<div id="n"><button id="p" aria-label="Pantalla anterior">‹</button><span id="l"></span><button id="x" aria-label="Pantalla siguiente">›</button></div>',
      '<script>var S=' + safe(data) + ',O=' + safe(order) + ',C=' + safe(currentEntry.slug) + ';',
      'var f=document.getElementById("f"),w=document.getElementById("w"),l=document.getElementById("l");',
      'function show(k){if(!S[k])return;C=k;f.srcdoc=S[k].html;document.title=S[k].name+" · Mockup";w.className=S[k].platform==="mobile"?"phone":"";l.textContent=S[k].name+" ("+(O.indexOf(k)+1)+"/"+O.length+")";}',
      'function go(d){var i=O.indexOf(C)+d;if(i>=0&&i<O.length)show(O[i]);}',
      'document.getElementById("p").onclick=function(){go(-1)};document.getElementById("x").onclick=function(){go(1)};',
      'window.addEventListener("keydown",function(e){if(e.key==="ArrowRight")go(1);if(e.key==="ArrowLeft")go(-1);});',
      'window.addEventListener("message",function(e){if(e.data&&e.data.type==="icase-navigate"&&S[e.data.slug])show(e.data.slug);});',
      'show(C);</script></body></html>'
    ].join('');
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
    const tab = window.open(url, '_blank');
    if (!tab) notify({ type: 'warning', message: 'El navegador bloqueó la pestaña nueva. Permite las ventanas emergentes para este sitio.' });
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const currentPosition = currentEntry ? screens.findIndex(p => p.slug === currentEntry.slug) : -1;
  const busy = ["encolado", "procesando"].includes(activeJob?.estado);
  const orphanMockups = useMemo(() => {
    if (!manifest.length) return [];
    const validIds = new Set(manifest.flatMap(item => [item.slug, item.pantalla_id]).filter(Boolean));
    return mockups.filter(m => ![m.nombre_pantalla, m.pantalla_id].some(id => validIds.has(id)));
  }, [manifest, mockups]);

  const removeOrphanMockups = async () => {
    if (!projectId || !orphanMockups.length || cleaningOrphans) return;
    try {
      setCleaningOrphans(true);
      for (const orphan of orphanMockups) {
        await deleteMockupApi(projectId, orphan.nombre_pantalla);
      }
      const remaining = mockups.filter(m => !orphanMockups.some(o => o.nombre_pantalla === m.nombre_pantalla));
      onUpdateMockup?.(remaining);
      await loadCatalog();
      notify({ type: "success", message: `Se eliminaron ${orphanMockups.length} mockup(s) fuera del árbol aprobado.` });
    } catch (error) {
      notify({ type: "error", message: error.message || "No se pudieron eliminar los mockups obsoletos." });
    } finally {
      setCleaningOrphans(false);
    }
  };

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

  // Los enlaces del mockup (pestañas, «volver», botones entre pantallas) piden mostrar otra pantalla.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type !== 'icase-navigate' || typeof event.data.slug !== 'string') return;
      const entry = screens.find((item) => item.slug === event.data.slug);
      if (entry) selectScreen(entry);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  const selectScreen = (entry) => {
    setActiveId(entry.slug);
    onActiveScreenChange?.(entry);
    const generated = mockupMap.get(entry.slug);
    if (generated && onSelectScreen) onSelectScreen(generated.index);
    if (generated && quality(generated) !== "valido") setShowDetails(true);
  };
  const setMany = (slugs, on) => setSelectedIds(prev => {
    const next = new Set(prev);
    slugs.forEach(slug => { if (on) next.add(slug); else next.delete(slug); });
    return next;
  });
  const toggleScreen = (slug) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });
  const markUiOnly = async (mockup, modo = 'ui') => {
    setMarkingUi(true);
    try {
      const result = await markMockupControlsUiApi(projectId, mockup.nombre_pantalla, null, modo);
      if (result.mockups) onUpdateMockup?.(result.mockups);
      const name = mockup.nombre_visible || mockup.nombre_pantalla;
      if (!result.marcados.length) notify({ type: "warning", message: `No había una operación clara para ${(result.pendientes || []).join(", ") || "esos controles"} en "${name}". Márcalos como solo interfaz o pídelo por chat.` });
      else notify({ type: "success", message: modo === 'enlazar' ? `Enlazado en "${name}": ${result.marcados.join("; ")}.${result.pendientes?.length ? ` Sin resolver: ${result.pendientes.join(", ")}.` : ""}` : `Se marcaron ${result.marcados.length} control(es) como solo interfaz en "${name}".` });
    } catch (error) {
      notify({ type: "error", message: error.message });
    }
    setMarkingUi(false);
  };

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

  const issues = currentMockup ? validationIssues(currentMockup) : [];
  const issueTone = currentMockup ? quality(currentMockup) : "valido";
  const menuItem = "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-40";
  const closeMenus = () => { setShowMore(false); setShowTrace(false); };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-slate-50">
      {/* Barra de herramientas: una sola fila; lo secundario va en «Más» */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
        <button type="button" onClick={() => setShowCatalog(value => !value)} aria-pressed={showCatalog} title="Mostrar u ocultar la lista de pantallas" className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${showCatalog ? 'border-[#CFC0F1] bg-[#F2EDFF] text-[#6D28D9]' : 'border-slate-200 text-slate-600'}`}><ListTree size={13} />Pantallas</button>
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {[['all', 'Todas'], ['web', 'Web'], ['tablet', 'Tablet'], ['mobile', 'Móvil']].map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`cursor-pointer rounded-md px-2.5 py-1 text-xs ${filter === id ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-500"}`}>{label}</button>)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {traceability && <button type="button" onClick={() => { setShowTrace(value => !value); setShowMore(false); }} aria-expanded={showTrace} title="Trazabilidad árbol → mockups → RF" className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${traceability.valido ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{traceability.valido ? <Check size={12} /> : <AlertTriangle size={12} />}{traceability.metricas?.mockups_generados || 0}/{traceability.metricas?.pantallas_arbol || 0} pantallas · {traceability.metricas?.cobertura_rf_altos_porcentaje ?? 0}% RF</button>}
          <button disabled={busy || selectedIds.size === 0} onClick={() => startGeneration([...selectedIds], "Generación seleccionada")} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-violet-900/10 hover:bg-[#6D28D9] disabled:opacity-40"><WandSparkles size={13} />Generar seleccionadas ({selectedIds.size})</button>
          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={showMore} onClick={() => { setShowMore(value => !value); setShowTrace(false); }} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Ellipsis size={14} />Más</button>
            {showMore && <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              <button role="menuitem" type="button" disabled={!currentMockup?.preview_code?.trim()} onClick={() => { downloadHtml(); closeMenus(); }} className={menuItem}><Download size={13} />Descargar HTML de esta pantalla</button>
              <button role="menuitem" type="button" disabled={!downloadableMockups.length} onClick={() => { downloadAllHtml(); closeMenus(); }} title="Descarga todos los mockups generados, sin limitarse al filtro o selección" className={menuItem}><Download size={13} />Descargar todos en ZIP ({downloadableMockups.length})</button>
              <div className="my-1 border-t border-slate-100" />
              <button role="menuitem" type="button" onClick={() => { setSelectedIds(new Set(screens.filter(p => !mockupMap.has(p.slug) || quality(mockupMap.get(p.slug)) === 'invalido').map(p => p.slug))); closeMenus(); }} className={menuItem}><ListTree size={13} />Seleccionar faltantes o inválidas</button>
              <button role="menuitem" type="button" disabled={busy || !mockups.length} onClick={() => { startGeneration([], "Reparación de pendientes", true); closeMenus(); }} title="Una reparación por pantalla, hasta cinco por trabajo. Conserva originales si no mejora. No corrige vínculos o roles ambiguos." className={menuItem}><RotateCcw size={13} />Reparar pendientes</button>
              <div className="my-1 border-t border-slate-100" />
              <button role="menuitem" type="button" onClick={() => { setShowPalette(value => !value); closeMenus(); }} className={menuItem}><Palette size={13} />Paleta y apariencia</button>
              <button role="menuitem" type="button" onClick={() => { setShowDetails(value => !value); closeMenus(); }} className={menuItem}><InfoIcon size={13} />{showDetails ? "Ocultar detalles de la pantalla" : "Detalles de la pantalla"}</button>
            </div>}
          </div>
        </div>
      </div>

      {showTrace && traceability && (
        <div className={`absolute right-3 top-12 z-40 max-h-[60vh] w-[min(560px,calc(100%-1.5rem))] overflow-y-auto rounded-xl border p-3 text-xs shadow-xl ${traceability.valido ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div className="mb-1 flex items-center justify-between"><p className="font-semibold">Trazabilidad árbol → mockups → RF</p><button type="button" onClick={() => setShowTrace(false)} aria-label="Cerrar" className="cursor-pointer text-base leading-none opacity-60">×</button></div>
          <p className="mt-1">{traceability.metricas?.criterios_ui_con_evidencia || 0}/{traceability.metricas?.criterios_ui_evaluados || 0} criterios UI específicos con evidencia. Vincular un RF no garantiza su implementación completa.</p>
          {[...(traceability.errores || []), ...(traceability.advertencias || [])].map((message, index) => <p key={index} className="mt-1">• {message}</p>)}
          {orphanMockups.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || cleaningOrphans}
                onClick={removeOrphanMockups}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                <Trash2 size={12} />
                {cleaningOrphans ? "Eliminando obsoletos…" : `Eliminar mockups fuera del árbol (${orphanMockups.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {showPalette && <div className="absolute right-3 top-12 z-30 max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl" style={{ width: 'min(760px, calc(100vw - 2rem))' }}><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-800">Identidad visual · v{designSystem.version}</p><p className="text-[11px] text-slate-500">La previsualización refleja los colores al instante. Guardar aplica la apariencia sin consultar IA.</p></div><div className="flex items-center gap-2"><button disabled={suggestingPalette} onClick={suggestPalette} className="flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700 disabled:opacity-50">{suggestingPalette ? <Loader2 size={12} className="animate-spin" /> : <WandSparkles size={12} />}{suggestingPalette ? 'Consultando…' : 'Sugerencia IA'}</button><button onClick={() => setShowPalette(false)} className="text-lg leading-none text-slate-400">×</button></div></div><div className="mb-4 space-y-3"><label className="block text-xs">Nombre de la aplicación<input maxLength={100} value={designSystem.nombre_aplicacion || ""} onChange={e => setDesignSystem(prev => ({ ...prev, nombre_aplicacion: e.target.value }))} className="mt-1 block w-full rounded-lg border p-2" /></label><label className="block text-xs">Logo opcional · PNG, JPEG o WebP, máximo 1 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1048576 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { notify({ type: "error", message: "Usa PNG, JPEG o WebP de hasta 1 MB." }); return; } const reader = new FileReader(); reader.onload = () => setDesignSystem(prev => ({ ...prev, logo: reader.result })); reader.readAsDataURL(file); }} /></label>{designSystem.logo && <div className="flex items-center gap-3"><img src={designSystem.logo} alt="Logo de la aplicación" className="h-10 w-10 object-contain" /><button onClick={() => setDesignSystem(prev => ({ ...prev, logo: null }))}>Quitar logo</button></div>}<p className="text-xs text-slate-500">La estructura común se aplica a nuevas generaciones. Los mockups existentes se conservan.</p></div><div className="flex flex-wrap gap-3">{Object.entries(designSystem.colores || {}).map(([key, value]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-600"><input type="color" value={value} onChange={e => setDesignSystem(prev => ({ ...prev, origen: 'manual', colores: { ...prev.colores, [key]: e.target.value } }))} className="h-7 w-8 rounded border-0" /><span>{formatName(key)}</span></label>)}</div><div className="mt-4 flex flex-wrap justify-end gap-2"><button disabled={savingPalette} onClick={savePalette} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Guardar sin regenerar</button><button disabled={savingPalette || busy} onClick={applyPalette} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{savingPalette ? <Loader2 size={12} className="animate-spin" /> : <Palette size={12} />}Guardar apariencia</button></div></div>}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showCatalog && <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-800">Flujos y pantallas</span><span className="flex items-center gap-1"><button type="button" onClick={() => setSelectedIds(selectedIds.size === screens.length ? new Set() : new Set(screens.map(p => p.slug)))} className="cursor-pointer text-[11px] text-[#7C3AED]">{selectedIds.size === screens.length ? "Ninguna" : "Todas"}</button><button type="button" onClick={() => setShowCatalog(false)} aria-label="Ocultar la lista de pantallas" title="Ocultar la lista de pantallas" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><PanelLeftClose size={14} /></button></span></div>
          {[...groups.entries()].map(([flow, modules]) => <div key={flow} className="mb-4"><SectionCheck label={flow} slugs={[...modules.values()].flat().map(entry => entry.slug)} selectedIds={selectedIds} onToggle={setMany} className="mb-1.5 px-1" labelClass="text-[10px] font-bold uppercase tracking-wide text-slate-500" />{[...modules.entries()].map(([module, items]) => <div key={module} className="mb-2"><SectionCheck label={module} slugs={items.map(entry => entry.slug)} selectedIds={selectedIds} onToggle={setMany} className="mb-1 pl-3 pr-1" labelClass="text-[11px] font-medium text-slate-600" />{items.map(entry => { const generated = mockupMap.get(entry.slug); const state = generated ? quality(generated) : "faltante"; return <div key={entry.slug} className={`mb-1 flex items-start gap-2 rounded-lg border px-2 py-2 ${activeId === entry.slug ? "border-[#CFC0F1] bg-[#F2EDFF]" : "border-transparent hover:bg-white"}`}><input type="checkbox" checked={selectedIds.has(entry.slug)} onChange={() => toggleScreen(entry.slug)} className="mt-0.5 accent-[#7C3AED]" /><button onClick={() => selectScreen(entry)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-800">{platformIcon(entry.plataforma)}<span className="truncate">{entry.nombre || formatName(entry.slug)}</span></span><span className={`mt-1 flex items-center gap-1 text-[10px] ${state === 'invalido' ? 'text-red-600' : state === 'faltante' ? 'text-slate-400' : state === 'advertencia' ? 'text-amber-600' : 'text-[#4D7C0F]'}`}>{state === 'invalido' ? <AlertTriangle size={10} /> : state === 'valido' ? <Check size={10} /> : null}{state}</span></button></div>; })}</div>)}</div>)}
          {!screens.length && <p className="text-xs text-slate-400">El árbol no contiene pantallas reconocibles.</p>}
        </aside>}

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100/70">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
            <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{currentEntry?.nombre || "Selecciona una pantalla"}</p><p className="truncate text-[10px] text-slate-500">{currentEntry?.ruta || `${currentEntry?.flujo || ''} / ${currentEntry?.modulo || ''}`}</p></div>
            <div className="flex items-center gap-1.5">
              {currentMockup && issueTone !== "valido" && <button type="button" onClick={() => setShowIssues(value => !value)} aria-expanded={showIssues} className={`flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${issueTone === "invalido" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}><AlertTriangle size={12} />{issues.length} {issues.length === 1 ? "aviso" : "avisos"}</button>}
              <button disabled={currentPosition <= 0} onClick={() => selectScreen(screens[currentPosition - 1])} aria-label="Pantalla anterior" className="cursor-pointer rounded p-1.5 disabled:opacity-30"><ChevronLeft size={15} /></button>
              <span className="text-[10px] text-slate-500">{currentPosition + 1}/{screens.length}</span>
              <button disabled={currentPosition < 0 || currentPosition >= screens.length - 1} onClick={() => selectScreen(screens[currentPosition + 1])} aria-label="Pantalla siguiente" className="cursor-pointer rounded p-1.5 disabled:opacity-30"><ChevronRight size={15} /></button>
              <div className="ml-1 flex rounded-lg bg-slate-100 p-0.5"><button type="button" onClick={() => setViewMode('visual')} className={`cursor-pointer rounded-md px-2 py-1 text-[11px] ${viewMode === 'visual' ? 'bg-white shadow-sm' : ''}`}>Diseño</button><button type="button" onClick={() => setViewMode('code')} className={`cursor-pointer rounded-md px-2 py-1 text-[11px] ${viewMode === 'code' ? 'bg-white shadow-sm' : ''}`}>Código</button></div>
              {currentMockup?.preview_code?.trim() && <button type="button" onClick={openFullscreen} title="Abrir el mockup a pantalla completa en una pestaña nueva" className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"><ExternalLink size={12} />Pantalla completa</button>}
              {viewMode === 'visual' && <button type="button" onClick={() => setZoom(value => value === 'fit' ? '100' : 'fit')} title={zoom === 'fit' ? 'Mostrar al 100 % (con desplazamiento)' : 'Ajustar a la ventana'} className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"><Maximize2 size={12} />{zoom === 'fit' ? 'Ajustado' : '100 %'}</button>}
            </div>
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-2">
            {showIssues && currentMockup && issueTone !== "valido" && (
              <div key={currentEntry?.slug} className={`absolute inset-x-3 top-3 z-30 max-h-[55%] overflow-y-auto rounded-xl border p-3 text-xs shadow-xl ${issueTone === "invalido" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <div className="mb-1 flex items-center justify-between"><p className="font-semibold">{issueTone === "invalido" ? "Problemas que impiden validar esta pantalla" : "Aspectos que conviene revisar"}</p><button type="button" onClick={() => setShowIssues(false)} aria-label="Cerrar" className="cursor-pointer text-base leading-none opacity-60">×</button></div>
                {issues.map((message, index) => <p key={index} className="mt-1">• {message}</p>)}
              {issues.some(message => /^sin enlace: /.test(message)) && <div className="mt-2">
                  <button type="button" disabled={markingUi || busy} onClick={() => markUiOnly(currentMockup, 'enlazar')} title="Enlaza cada botón con la operación de su pantalla según su texto y los campos de su formulario. No usa IA." className="mr-2 rounded-lg border border-violet-600 bg-violet-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50">{markingUi ? 'Aplicando…' : 'Enlazar con la operación de la pantalla'}</button>
                  <button type="button" disabled={markingUi || busy} onClick={() => markUiOnly(currentMockup)} title="Marca como solo interfaz (data-accion=&quot;ui&quot;) los botones que no ejecutan ninguna operación. No usa IA y no cambia nada más." className="rounded-lg border border-violet-300 bg-white px-2.5 py-1 font-semibold text-violet-700 disabled:opacity-50">{markingUi ? 'Aplicando…' : 'Marcar controles sin enlace como solo interfaz'}</button>
                  <span className="ml-2 text-[11px] opacity-80">«Enlazar» hace que guarde datos; «solo interfaz» lo deja sin acción.</span>
                </div>}
              </div>
            )}
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
            {currentMockup ? viewMode === "visual" ? <ScaledMockupPreview zoom={zoom} html={prepareMockupHtml(currentMockup.preview_code, designSystem)} platform={currentEntry?.plataforma} title={`Mockup ${currentMockup.nombre_pantalla}`} /> : <textarea value={currentMockup.preview_code} onChange={e => onUpdateMockup?.(currentMockup.nombre_pantalla, e.target.value)} className="absolute inset-2 resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs" spellCheck="false" /> : <div className="m-auto max-w-sm text-center"><Layout className="mx-auto mb-3 text-slate-300" size={36} /><p className="text-sm font-semibold text-slate-700">Mockup pendiente</p><p className="mt-1 text-xs text-slate-500">Marca esta pantalla y usa “Generar seleccionadas” o escribe en el chat inferior para generarla con IA.</p></div>}
          </div>
        </main>

        {showDetails && <aside className="w-60 shrink-0 overflow-y-auto border-l border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-slate-800">Detalles de pantalla</p><button onClick={() => setShowDetails(false)} className="text-lg leading-none text-slate-400">×</button></div>{currentEntry && <div className="space-y-3 text-[11px]"><Info label="Plataforma" value={currentEntry.plataforma} icon={platformIcon(currentEntry.plataforma, 12)} /><Info label="Flujo" value={currentEntry.flujo} /><Info label="Módulo" value={currentEntry.modulo} /><Info label="Tipo" value={currentEntry.tipo} /><Info label="Roles" value={(currentEntry.roles || []).join(', ')} /><Info label="Shell compartido" value={currentEntry.shell} />{currentMockup && <><Info label="Estado" value={`${currentMockup.estado || 'generado'} · v${currentMockup.version || 1}`} /><div className={`rounded-lg border p-2 ${quality(currentMockup) === 'invalido' ? 'border-red-200 bg-red-50 text-red-700' : quality(currentMockup) === 'advertencia' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><p className="font-semibold">Calidad: {quality(currentMockup)}</p>{validationIssues(currentMockup).map((warning, i) => <p key={i} className="mt-1">• {warning}</p>)}</div>{sanitizationNotices(currentMockup).length > 0 && <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-700"><p className="font-semibold">Ajustes de seguridad aplicados</p>{sanitizationNotices(currentMockup).map((notice, i) => <p key={i} className="mt-1">• {notice}</p>)}</div>}<div className="flex flex-wrap gap-1"><button disabled={busy} onClick={() => startGeneration([currentEntry.slug], 'Regeneración')} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5"><RotateCcw size={11} />Regenerar</button><button onClick={() => navigator.clipboard.writeText(currentMockup.preview_code)} className="rounded-lg border border-slate-200 p-1.5" title="Copiar HTML"><Copy size={12} /></button><button onClick={() => { const url = URL.createObjectURL(new Blob([currentMockup.preview_code], { type: 'text/html' })); const a = document.createElement('a'); a.href = url; a.download = `${currentEntry.slug}.html`; a.click(); URL.revokeObjectURL(url); }} className="rounded-lg border border-slate-200 p-1.5" title="Descargar HTML"><Download size={12} /></button></div></>}</div>}</aside>}
      </div>

      <DiagramProgressIndicator
        job={activeJob}
        diagramLabel="mockups"
        isOpen={Boolean((busy || (activeJob?.estado === "fallido" && handledJobRef.current === activeJob.id)) && !isModalDismissed)}
        title="Generando wireframes y mockups"
        statusMessage={activeJob?.mensaje || ""}
        progress={activeJob?.progreso || 0}
        error={activeJob?.estado === "fallido" ? (activeJob.error || "La generación falló.") : null}
        onClose={() => setIsModalDismissed(true)}
      />
    </div>
  );
}

function ScaledMockupPreview({ html, platform = "web", title, zoom = "fit" }) {
  const hostRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const mobile = platform === "mobile";
  const baseWidth = mobile ? 390 : platform === "tablet" ? 820 : 1280;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setBox({ width: host.clientWidth, height: host.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Web y tableta: el ancho del dispositivo se reduce para caber y la altura se aprovecha entera (como una ventana de navegador).
  // Móvil: el teléfono completo cabe en el alto disponible. Con «100 %» no se reduce y se desplaza.
  const availableWidth = Math.max(Math.floor(box.width) - 14, 200);
  const availableHeight = Math.max(Math.floor(box.height) - 14, 240);
  const phoneHeight = 844;
  const scale = zoom === "100" ? 1 : Math.min(1, availableWidth / baseWidth, mobile ? availableHeight / phoneHeight : 1);
  const frameHeight = mobile ? phoneHeight : zoom === "100" ? Math.max(availableHeight, 800) : availableHeight / scale;

  return (
    // El tamaño se mide en un contenedor que nunca muestra barras de desplazamiento (si no, una barra cambiaría el ancho medido, la escala y
    // el alto, y la vista «vibraría»). El desplazamiento solo existe en el contenedor interior, y únicamente con «100 %».
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      <div className={`absolute inset-0 p-1.5 ${zoom === "100" ? "overflow-auto" : "overflow-hidden"}`}>
        <div className="mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" style={{ width: Math.floor(baseWidth * scale), height: Math.floor(frameHeight * scale) }}>
          <iframe srcDoc={html} sandbox="allow-scripts" title={title} style={{ width: baseWidth, height: frameHeight, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }} />
        </div>
      </div>
    </div>
  );
}

/** Casilla de un flujo o módulo: marca o desmarca todas sus pantallas y muestra «algunas» cuando la selección es parcial. */
function SectionCheck({ label, slugs, selectedIds, onToggle, className = "", labelClass = "" }) {
  const count = slugs.filter(slug => selectedIds.has(slug)).length;
  const all = slugs.length > 0 && count === slugs.length;
  return (
    <label className={`flex cursor-pointer items-center gap-1.5 ${className}`}>
      <input type="checkbox" checked={all} ref={element => { if (element) element.indeterminate = count > 0 && !all; }} onChange={() => onToggle(slugs, !all)} aria-label={`Seleccionar ${label}`} className="accent-[#7C3AED]" />
      <span className={`min-w-0 truncate ${labelClass}`}>{label}</span>
      <span className="ml-auto shrink-0 text-[10px] text-slate-400">{count}/{slugs.length}</span>
    </label>
  );
}

function Info({ label, value, icon = null }) {
  return <div><p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="flex items-center gap-1.5 break-words font-medium text-slate-700">{icon}{value || "No definido"}</p></div>;
}
