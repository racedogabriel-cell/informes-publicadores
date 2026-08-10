import { GOOGLE_REPORTS_ENDPOINT } from './config.js';
import { NETWORK_TIMEOUT_MS } from './period.js';

/**
 * Infraestructura Apps Script compartida.
 * Lectura de informes/Sistema, ciclo de períodos y guardado real de Encargados.
 */

async function fetchJson(url, options = {}, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('La operación tardó demasiado. Reintentá.');
    }
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
}

export async function getMonthlyReports() {
  if (!GOOGLE_REPORTS_ENDPOINT) return null;
  return fetchJson(`${GOOGLE_REPORTS_ENDPOINT}?action=reports`);
}

/** Lectura del estado global (hoja Sistema). */
export async function getSystemState() {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }
  return fetchJson(`${GOOGLE_REPORTS_ENDPOINT}?action=system`);
}

/**
 * Abre un período (Portal General → Apps Script).
 * @param {string} periodo Clave YYYY-MM (mes vencido, p. ej. 2026-07)
 */
export async function openPeriod(periodo) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  const key = String(periodo || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    throw new Error('Indicá un período válido con formato YYYY-MM.');
  }

  return fetchJson(
    `${GOOGLE_REPORTS_ENDPOINT}?action=openPeriod&periodo=${encodeURIComponent(key)}`,
  );
}

/** Cierra el período abierto (Portal General → Apps Script). */
export async function closePeriod() {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }
  return fetchJson(`${GOOGLE_REPORTS_ENDPOINT}?action=closePeriod`);
}

/**
 * Guarda el lote del grupo (escritura real C–F). Fallback / rollback.
 * Content-Type: text/plain para evitar preflight CORS con Apps Script.
 */
export async function postSaveGroup(payload) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  return fetchJson(GOOGLE_REPORTS_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Auto-save Encargados: una sola persona (action=savePerson).
 * Content-Type: text/plain para evitar preflight CORS con Apps Script.
 */
export async function postSavePerson(payload) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  return fetchJson(GOOGLE_REPORTS_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
}

/** Listado del padrón Personas (A–H). */
export async function getPersonas() {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }
  return fetchJson(`${GOOGLE_REPORTS_ENDPOINT}?action=personas`);
}

/** Catálogo de grupos (hoja Grupos). */
export async function getGrupos({ soloActivos = false } = {}) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }
  const q = soloActivos ? '&activos=1' : '';
  return fetchJson(`${GOOGLE_REPORTS_ENDPOINT}?action=grupos${q}`);
}

function postPersonasAction(payload) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }
  return fetchJson(GOOGLE_REPORTS_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
}

/** Alta en padrón Personas. El ID lo genera el backend. */
export async function createPersona(persona) {
  return postPersonasAction({ action: 'createPersona', ...persona });
}

/** Actualización de padrón por ID (ID inmutable). */
export async function updatePersona(persona) {
  return postPersonasAction({ action: 'updatePersona', ...persona });
}

/** Baja/reactivación lógica (Activo Sí/No). */
export async function setPersonaActivo(id, activo) {
  return postPersonasAction({ action: 'setPersonaActivo', id, activo });
}

/** Alta en catálogo Grupos. El ID lo genera el backend. */
export async function createGrupo(grupo) {
  return postPersonasAction({ action: 'createGrupo', ...grupo });
}

/** Edición de nombre/color por ID (ID inmutable). */
export async function updateGrupo(grupo) {
  return postPersonasAction({ action: 'updateGrupo', ...grupo });
}

/** Activar/desactivar grupo (bloqueo si hay personas activas). */
export async function setGrupoActivo(id, activo) {
  return postPersonasAction({ action: 'setGrupoActivo', id, activo });
}

async function parseJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del endpoint no es un JSON válido.');
  }
  return data;
}
