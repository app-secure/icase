import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RequirementsView from '../../../icase-frontend/src/components/RequirementsView';
import RequirementJobStatus from '../../../icase-frontend/src/components/RequirementJobStatus';
import { RequirementsReferencePanel } from '../../../icase-frontend/src/components/ApprovedRequirementsSidebar';

function TestPage() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [job, setJob] = useState({ id: 'synthetic', estado: 'interrumpido', mensaje: 'Trabajo interrumpido de prueba', total_recuperadas: 2, progreso_requisitos: { etapa: 'revision_semantica', proveedor: 'ollama', modelo: 'qwen3:8b' } });
  async function load() { setState(await (await fetch('/fixture')).json()); }
  useEffect(() => { load(); }, []);
  if (!state) return <p>Cargando escenario aislado…</p>;
  if (location.search.includes('sidebar=1')) return <div className="relative flex h-screen"><RequirementsReferencePanel open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} requirements={state.requirements} audit={state.audit} side="right" /></div>;
  const send = async (route, body) => {
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.syntheticToken}` }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  const review = async payload => {
    const path = `/proyectos/${state.id}`;
    const result = payload.scope === 'necesidad' ? await send(`${path}/necesidades/${payload.id}/resolver`, payload.data) : await send(`${path}/revision-requisitos`, payload);
    setState(current => ({ ...current, audit: result.auditoria_requisitos }));
  };
  return <><p>ENTORNO AISLADO DE PRUEBA · sin base de datos · no es el recorrido completo de la aplicación</p>
    <RequirementJobStatus job={job} onResume={() => setJob({ ...job, estado: 'procesando', mensaje: 'Reanudación solicitada de prueba' })} />
    <p role="status">{message}</p><div style={{ height: '85vh' }}><RequirementsView requirements={state.requirements} audit={state.audit} onReview={review} isApproved={false}
      onApprovePhase={async () => { try { await send(`/proyectos/${state.id}/aprobar-fase`, { fase: 'analisis', aprobarTodos: true }); setMessage('Aprobación aceptada'); } catch (error) { setMessage(error.message); } }} /></div></>;
}
createRoot(document.getElementById('root')).render(<TestPage />);
