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
  } catch (e) {
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
export async function processWithAiApi(projectId, insumoBruto = '', insumoAdicional = '') {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/procesar-ia`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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

// === FASES Y DOCUMENTO ===
export async function approvePhaseApi(projectId, fase) {
  try {
    const res = await fetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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

