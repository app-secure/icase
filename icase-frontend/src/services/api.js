const API_URL = 'http://localhost:5000';

// Gestión local de token de autenticación
export function getAuthToken() {
  return localStorage.getItem('icase_token') || '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem('icase_token', token);
  else localStorage.removeItem('icase_token');
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('icase_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem('icase_user', JSON.stringify(user));
  else localStorage.removeItem('icase_user');
}

export function clearAuth() {
  localStorage.removeItem('icase_token');
  localStorage.removeItem('icase_user');
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// === AUTENTICACIÓN ===
export async function registroApi({ nombre, apellido, correo, celular, password }) {
  const res = await fetch(`${API_URL}/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, apellido, correo, celular, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error al registrar usuario');
  }
  return data;
}

export async function loginApi(correo, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error al iniciar sesión');
  }
  return data;
}

export async function fetchPerfilApi() {
  try {
    const res = await fetch(`${API_URL}/auth/perfil`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al obtener perfil:', err.message);
    return null;
  }
}

// === PROYECTOS ===
export async function fetchProjects() {
  try {
    const res = await fetch(`${API_URL}/proyectos`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al listar proyectos');
    return await res.json();
  } catch (err) {
    console.warn('[API] Backend no disponible o error:', err.message);
    return null;
  }
}

export async function fetchProjectById(id) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${id}`, {
      headers: getAuthHeaders()
    });
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
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al crear proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al crear proyecto:', err.message);
    return null;
  }
}

export async function updateProjectApi(projectId, data) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al actualizar proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al actualizar proyecto:', err.message);
    return null;
  }
}

export async function deleteProjectApi(projectId) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al eliminar proyecto');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al eliminar proyecto:', err.message);
    return null;
  }
}

// === FUENTES ===
export async function uploadFuenteApi(projectId, file) {
  try {
    const formData = new FormData();
    formData.append('archivo', file);

    const res = await fetch(`${API_URL}/proyectos/${projectId}/fuentes`, {
      method: 'POST',
      headers: getAuthHeaders(),
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
    const res = await fetch(`${API_URL}/proyectos/${projectId}/fuentes`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al listar fuentes');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al listar fuentes:', err.message);
    return [];
  }
}

export async function updateFuenteApi(fuenteId, changes) {
  const res = await fetch(`${API_URL}/fuentes/${fuenteId}`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(changes)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Error al actualizar los detalles de la fuente');
  }
  return await res.json();
}

export async function suggestFuenteMetadataApi(fuenteId, provider = 'auto') {
  const res = await fetch(`${API_URL}/fuentes/${fuenteId}/sugerir-metadatos`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ provider })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'No fue posible sugerir los metadatos con IA');
  }
  return await res.json();
}

export async function deleteFuenteApi(fuenteId, proyectoId = null, nombreArchivo = null) {
  try {
    let url = `${API_URL}/fuentes/${fuenteId}`;
    if (proyectoId && nombreArchivo) {
      url = `${API_URL}/proyectos/${proyectoId}/fuentes/${encodeURIComponent(nombreArchivo)}`;
    } else if (proyectoId && fuenteId) {
      url = `${API_URL}/proyectos/${proyectoId}/fuentes/${fuenteId}`;
    }

    const res = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al eliminar fuente de la base de datos');
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al eliminar fuente:', err.message);
    return null;
  }
}

// === PROCESAMIENTO CON IA ===
export async function fetchAiModelsApi() {
  try {
    const res = await fetch(`${API_URL}/proyectos/modelos-ia`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al obtener modelos de IA');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al consultar modelos de IA:', err.message);
    return null;
  }
}

export async function processWithAiApi(projectId, insumoBruto = '', insumoAdicional = '', provider = 'auto', specificModel = null, objetivo = 'completo', tipoDiagrama = null) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/procesar-ia`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        insumo_bruto: insumoBruto,
        insumo_adicional: insumoAdicional,
        provider,
        specificModel,
        objetivo,
        tipo_diagrama: tipoDiagrama
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Error en procesamiento con IA');
    }
    return data;
  } catch (err) {
    console.error('[API] Error al procesar con IA:', err.message);
    throw err;
  }
}

// === FASES Y DOCUMENTO ===
export async function approvePhaseApi(projectId, fase) {
  const res = await fetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fase, aprobar_todos: true })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Error al aprobar fase');
  }
  return await res.json();
}

export async function approveDiagramApi(projectId, diagramType, observaciones = '') {
  const res = await fetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fase: 'diagrama', tipo_diagrama: diagramType, decision: 'aprobar', observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al aprobar el diagrama');
  return data;
}

export async function rejectDiagramApi(projectId, diagramType, observaciones) {
  const res = await fetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fase: 'diagrama', tipo_diagrama: diagramType, decision: 'rechazar', observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al solicitar cambios en el diagrama');
  return data;
}

export async function fetchDiagramWorkflowApi(projectId) {
  const res = await fetch(`${API_URL}/proyectos/${projectId}/flujo-diagramas`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al consultar el flujo de diagramas');
  return data;
}

export async function fetchDocumentoConsolidado(projectId) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/documento-consolidado`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al obtener documento');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al obtener documento consolidado:', err.message);
    return null;
  }
}

export async function updateDiagramApi(diagramId, data) {
  try {
    const res = await fetch(`${API_URL}/diagramas/${diagramId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al actualizar diagrama');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al actualizar diagrama:', err.message);
    return null;
  }
}

export async function fetchDiagramVersionsApi(diagramId) {
  const res = await fetch(`${API_URL}/diagramas/${diagramId}/versiones`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al consultar las versiones del diagrama');
  return data;
}

export async function restoreDiagramVersionApi(diagramId, version) {
  const res = await fetch(`${API_URL}/diagramas/${diagramId}/restaurar`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ version })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al restaurar la versión del diagrama');
  return data;
}

// === MOCKUPS ===
export async function generateMockupsApi(projectId, pantallas = [], insumoAdicional = '', requerimientos = null) {
  try {
    const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/generar`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pantallas, insumoAdicional, requerimientos })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status}: Fallo en la generación de mockups.`);
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Error generando mockups:', err.message);
    return {
      mockups: [],
      error: err.message,
      advertencias: [err.message]
    };
  }
}

export async function startMockupJobApi(projectId, pantallas = [], insumoAdicional = '', requerimientos = null) {
  const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/trabajos`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pantallas, insumoAdicional, requerimientos })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la generación de mockups.');
  return data;
}

export async function fetchMockupJobApi(jobId) {
  const res = await fetch(`${API_URL}/mockups/trabajos/${jobId}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la generación.');
  return data;
}

export async function fetchLatestMockupJobApi(projectId) {
  const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/trabajos/ultimo`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo recuperar la generación activa.');
  return data;
}

export async function fetchMockupsApi(projectId) {
  try {
    const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Error al obtener mockups');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al obtener mockups:', err.message);
    return { mockups: [] };
  }
}

export async function updateMockupDesignSystemApi(projectId, sistemaDiseno) {
  const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/sistema-diseno`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sistemaDiseno })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar la paleta.');
  return data;
}

export async function suggestMockupDesignSystemApi(projectId) {
  const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/sugerir-paleta`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar una sugerencia de paleta.');
  return data;
}

export async function updateMockupApi(projectId, nombrePantalla, previewCode) {
  try {
    const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/${encodeURIComponent(nombrePantalla)}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ previewCode })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar mockup');
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al actualizar mockup:', err.message);
    return null;
  }
}

export async function deleteMockupApi(projectId, nombrePantalla) {
  try {
    const res = await fetch(`${API_URL}/mockups/proyecto/${projectId}/${encodeURIComponent(nombrePantalla)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al eliminar mockup');
    }
    return await res.json();
  } catch (err) {
    console.warn('[API] Error al eliminar mockup:', err.message);
    return null;
  }
}

export async function syncProjectRequirementsApi(projectId, requerimientosList) {
  try {
    const res = await fetch(`${API_URL}/requerimientos/proyecto/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ requerimientos: requerimientosList })
    });
    if (!res.ok) throw new Error('Error al sincronizar requerimientos en base de datos');
    return await res.json();
  } catch (err) {
    console.warn('[API] Error sincronizando requerimientos:', err.message);
    return null;
  }
}


