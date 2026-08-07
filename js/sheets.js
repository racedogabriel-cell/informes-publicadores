import { GOOGLE_REPORTS_ENDPOINT } from './config.js';

/**
 * Infraestructura Apps Script compartida.
 * Lectura de informes, estado Sistema, apertura de período y POST dry-run Encargados.
 */

export async function getMonthlyReports() {
  if (!GOOGLE_REPORTS_ENDPOINT) return null;

  let response;
  try {
    response = await fetch(`${GOOGLE_REPORTS_ENDPOINT}?action=reports`);
  } catch {
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
}

/** Lectura del estado global (hoja Sistema). */
export async function getSystemState() {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  let response;
  try {
    response = await fetch(`${GOOGLE_REPORTS_ENDPOINT}?action=system`);
  } catch {
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
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

  let response;
  try {
    response = await fetch(
      `${GOOGLE_REPORTS_ENDPOINT}?action=openPeriod&periodo=${encodeURIComponent(key)}`,
    );
  } catch {
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
}

/** Cierra el período abierto (Portal General → Apps Script). */
export async function closePeriod() {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  let response;
  try {
    response = await fetch(`${GOOGLE_REPORTS_ENDPOINT}?action=closePeriod`);
  } catch {
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
}

/**
 * Envía el lote completo del grupo (fase dryRun).
 * Usa text/plain para evitar preflight CORS con Apps Script.
 */
export async function postSaveGroupDryRun(payload) {
  if (!GOOGLE_REPORTS_ENDPOINT) {
    throw new Error('El conector de Apps Script no está configurado.');
  }

  let response;
  try {
    response = await fetch(GOOGLE_REPORTS_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('No hay conexión con el endpoint de Apps Script.');
  }

  if (!response.ok) {
    throw new Error(`El endpoint respondió con error HTTP ${response.status}.`);
  }

  return parseJsonResponse(response);
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
