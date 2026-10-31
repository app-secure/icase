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

/**
 * Todas las llamadas al backend pasan por aquí. Un 401 con una sesión guardada significa que caducó, fue
 * revocada o dejó de ser válida: se avisa a la aplicación para volver a la pantalla de acceso.
 * El inicio de sesión y el registro devuelven 401/409 por motivos propios y quedan fuera.
 */
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401 && getAuthToken() && !/\/auth\/(login|registro)$/.test(String(url))) {
    window.dispatchEvent(new Event('icase:session-expired'));
  }
  return res;
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
    const res = await apiFetch(`${API_URL}/auth/perfil`, {
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
    const res = await apiFetch(`${API_URL}/proyectos`, {
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
    const res = await apiFetch(`${API_URL}/proyectos/${id}`, {
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
    const res = await apiFetch(`${API_URL}/proyectos`, {
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
    const res = await apiFetch(`${API_URL}/proyectos/${projectId}`, {
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
    const res = await apiFetch(`${API_URL}/proyectos/${projectId}`, {
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

    const res = await apiFetch(`${API_URL}/proyectos/${projectId}/fuentes`, {
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
    const res = await apiFetch(`${API_URL}/proyectos/${projectId}/fuentes`, {
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
  const res = await apiFetch(`${API_URL}/fuentes/${fuenteId}`, {
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
  const res = await apiFetch(`${API_URL}/fuentes/${fuenteId}/sugerir-metadatos`, {
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

    const res = await apiFetch(url, {
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
    const res = await apiFetch(`${API_URL}/proyectos/modelos-ia`, {
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
    const res = await apiFetch(`${API_URL}/proyectos/${projectId}/procesar-ia`, {
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
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
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

export async function startDiagramJobApi(projectId, diagramType, insumoBruto = '', insumoAdicional = '', provider = 'auto', specificModel = null) {
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/trabajos-diagramas`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tipo_diagrama: diagramType, insumo_bruto: insumoBruto, insumo_adicional: insumoAdicional, provider, specificModel })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la generación del diagrama.');
  return data;
}

export async function fetchDiagramJobApi(jobId) {
  const res = await apiFetch(`${API_URL}/proyectos/trabajos-diagramas/${jobId}`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la generación del diagrama.');
  return data;
}

export async function fetchLatestDiagramJobApi(projectId) {
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/trabajos-diagramas/ultimo`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo recuperar la generación del diagrama.');
  return data;
}

export async function approveDiagramApi(projectId, diagramType, observaciones = '') {
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fase: 'diagrama', tipo_diagrama: diagramType, decision: 'aprobar', observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al aprobar el diagrama');
  return data;
}

export async function rejectDiagramApi(projectId, diagramType, observaciones) {
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/aprobar-fase`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fase: 'diagrama', tipo_diagrama: diagramType, decision: 'rechazar', observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al solicitar cambios en el diagrama');
  return data;
}

export async function fetchDiagramWorkflowApi(projectId) {
  const res = await apiFetch(`${API_URL}/proyectos/${projectId}/flujo-diagramas`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al consultar el flujo de diagramas');
  return data;
}

export async function fetchDocumentoConsolidado(projectId) {
  try {
    const res = await apiFetch(`${API_URL}/proyectos/${projectId}/documento-consolidado`, {
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
    const res = await apiFetch(`${API_URL}/diagramas/${diagramId}`, {
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
  const res = await apiFetch(`${API_URL}/diagramas/${diagramId}/versiones`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error al consultar las versiones del diagrama');
  return data;
}

export async function restoreDiagramVersionApi(diagramId, version) {
  const res = await apiFetch(`${API_URL}/diagramas/${diagramId}/restaurar`, {
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
    const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/generar`, {
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
  const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/trabajos`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pantallas, insumoAdicional, requerimientos })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la generación de mockups.');
  return data;
}

export async function fetchMockupJobApi(jobId) {
  const res = await apiFetch(`${API_URL}/mockups/trabajos/${jobId}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la generación.');
  return data;
}

export async function fetchLatestMockupJobApi(projectId) {
  const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/trabajos/ultimo`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo recuperar la generación activa.');
  return data;
}

export async function fetchMockupsApi(projectId) {
  try {
    const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}`, {
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
  const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/sistema-diseno`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sistemaDiseno })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar la paleta.');
  return data;
}

export async function suggestMockupDesignSystemApi(projectId) {
  const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/sugerir-paleta`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar una sugerencia de paleta.');
  return data;
}

export async function updateMockupApi(projectId, nombrePantalla, previewCode) {
  try {
    const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/${encodeURIComponent(nombrePantalla)}`, {
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
    const res = await apiFetch(`${API_URL}/mockups/proyecto/${projectId}/${encodeURIComponent(nombrePantalla)}`, {
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
    const res = await apiFetch(`${API_URL}/requerimientos/proyecto/${projectId}`, {
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

const fetchCodeApi = apiFetch;

export async function fetchCodePlanApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el plan de codificación.');
  return data;
}

export async function proposeCodePhaseApi(projectId, phase, propuesta, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/etapas/${phase}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ propuesta, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar la propuesta.');
  return data;
}

export async function suggestCodePhaseApi(projectId, phase) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/etapas/${phase}/sugerencia`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar la propuesta.');
  return data;
}

export async function reviewCodePhaseApi(projectId, phase, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/etapas/${phase}/revision`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo registrar la revisión.');
  return data;
}

export async function executeOneClickModeApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/un-clic`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar el modo un clic.');
  return data;
}

export async function fetchGenerationReportApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/informe-generacion`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo calcular el informe de generación.');
  return data;
}

export async function generateBackendArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/backend/generar`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar el backend.');
  return data;
}

export async function fetchGeneratedArtifactsApi(projectId, type = '') {
  const query = type ? `?tipo=${encodeURIComponent(type)}` : '';
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos${query}`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los artefactos generados.');
  return data;
}

export async function verifyGeneratedArtifactApi(projectId, artifactId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos/${artifactId}/verificar`, {
    method: 'POST', headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo verificar el artefacto.');
  return data;
}

export async function startArtifactVerificationJobApi(projectId, artifactId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos/${artifactId}/verificar-async`, {
    method: 'POST', headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el trabajo de verificación.');
  return data;
}

export async function fetchArtifactVerificationJobApi(projectId, artifactId, jobId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos/${artifactId}/verificar-trabajo/${jobId}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar el trabajo de verificación.');
  return data;
}

export async function fetchLatestArtifactVerificationJobApi(projectId, artifactId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos/${artifactId}/verificar-trabajo/ultimo`, {
    headers: getAuthHeaders()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo consultar la última verificación.');
  return data;
}

export async function updateGeneratedArtifactFileApi(projectId, artifactId, ruta, contenido) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/artefactos/${artifactId}/archivos`, {
    method: 'PUT', headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ruta, contenido })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar el archivo.');
  return data;
}

export async function reviewBackendArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/backend/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar el backend.');
  return data;
}

export async function generateFrontendArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/frontend/generar`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar el frontend.');
  return data;
}

export async function reviewFrontendArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/frontend/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar el frontend.');
  return data;
}

export async function generateTestArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/pruebas/generar`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudieron generar las pruebas.');
  return data;
}

export async function reviewTestArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/pruebas/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar la suite de pruebas.');
  return data;
}

export async function generateInfrastructureArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/infraestructura/generar`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar la infraestructura.');
  return data;
}

export async function reviewInfrastructureArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/infraestructura/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar la infraestructura.');
  return data;
}

export async function generatePipelineArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/ci-cd/generar`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar el pipeline CI/CD.');
  return data;
}

export async function reviewPipelineArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/ci-cd/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar el pipeline CI/CD.');
  return data;
}

export async function generateDeliveryArtifactApi(projectId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/paquete/generar`, { method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo generar el paquete final.');
  return data;
}

export async function reviewDeliveryArtifactApi(projectId, artifactId, decision, observaciones = '') {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/paquete/${artifactId}/revision`, {
    method: 'POST', headers: getAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ decision, observaciones })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo revisar el paquete final.');
  return data;
}

export async function downloadDeliveryArtifactApi(projectId, artifactId) {
  const res = await fetchCodeApi(`${API_URL}/proyectos/${projectId}/codificacion/paquete/${artifactId}/descargar`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo descargar el paquete final.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'icase-entrega.zip';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}


