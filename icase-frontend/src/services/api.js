const API_URL = 'http://localhost:5000';

export async function fetchProjects() {
  try {
    const res = await fetch(`${API_URL}/proyectos`);
    if (!res.ok) throw new Error('Error al listar proyectos');
    return await res.json();
  } catch (err) {
    console.warn('[API] Backend no disponible o error:', err.message);
    return null;
  }
}

export async function fetchProjectById(id) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${id}`);
    if (!res.ok) throw new Error('Error al obtener proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al obtener proyecto:', err.message);
    return null;
  }
}

export async function createProjectApi(data) {
  try {
    const res = await fetch(`${API_URL}/proyectos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al crear proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al crear proyecto:', err.message);
    return null;
  }
}

export async function deleteProjectApi(projectId) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Error al eliminar proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al eliminar proyecto:', err.message);
    return null;
  }
}

export async function uploadFuenteApi(projectId, file) {
  try {
    const formData = new FormData();
    formData.append('archivo', file);

    const res = await fetch(`${API_URL}/proyectos/${projectId}/fuentes`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al subir y transcribir fuente');
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al subir fuente:', err.message);
    return null;
  }
}

export async function fetchFuentesApi(projectId) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/fuentes`);
    if (!res.ok) throw new Error('Error al listar fuentes');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al listar fuentes:', err.message);
    return [];
  }
}

export async function processWithAiApi(projectId, insumoBruto = '', insumoAdicional = '') {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/procesar-ia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        insumo_bruto: insumoBruto,
        insumo_adicional: insumoAdicional
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error en procesamiento agéntico');
    }
    return await res.json();
  } catch (err) {
    console.error('[API] Error al procesar con IA:', err.message);
    return null;
  }
}

export async function approvePhaseApi(projectId, fase) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fase, aprobar_todos: true })
    });
    if (!res.ok) throw new Error('Error al aprobar fase');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al aprobar fase:', err.message);
    return null;
  }
}

export async function fetchDocumentoConsolidado(projectId) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/documento-consolidado`);
    if (!res.ok) throw new Error('Error al obtener documento');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al obtener documento consolidado:', err.message);
    return null;
  }
}
