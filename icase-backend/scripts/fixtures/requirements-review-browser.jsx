import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RequirementsView from '../../../icase-frontend/src/components/RequirementsView';

function TestPage() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');
  async function load() { setState(await (await fetch('/fixture')).json()); }
  useEffect(() => { load(); }, []);
  if (!state) return <p>Cargando escenario aislado…</p>;
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
    <p role="status">{message}</p><div style={{ height: '85vh' }}><RequirementsView requirements={state.requirements} audit={state.audit} onReview={review} isApproved={false}
      onApprovePhase={async () => { try { await send(`/proyectos/${state.id}/aprobar-fase`, { fase: 'analisis', aprobarTodos: true }); setMessage('Aprobación aceptada'); } catch (error) { setMessage(error.message); } }} /></div></>;
}
createRoot(document.getElementById('root')).render(<TestPage />);
