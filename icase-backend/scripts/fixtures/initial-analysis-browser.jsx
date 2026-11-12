import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectWorkspace from '../../../icase-frontend/src/components/ProjectWorkspace';
function Page() {
  const [project, setProject] = useState(null);
  useEffect(() => { fetch('/fixture').then(r => r.json()).then(data => { localStorage.setItem('icase_token', data.token); setProject(data.project); }); }, []);
  if (!project) return <p>Cargando prueba aislada…</p>;
  return <div className="h-screen flex flex-col"><p className="text-xs">PRUEBA AISLADA · repositorios en memoria · no modifica proyectos activos</p><ProjectWorkspace project={project} onUpdateProject={setProject} onBack={() => {}} /></div>;
}
createRoot(document.getElementById('root')).render(<Page />);
