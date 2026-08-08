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

async function parseJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del endpoint no es un JSON válido.');
  }
  return data;
}
