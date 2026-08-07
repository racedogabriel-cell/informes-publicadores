import { GOOGLE_REPORTS_ENDPOINT } from './config.js';

/**
 * Módulo: Informes (infraestructura de lectura / canal POST dry-run)
 * Objetivo: obtener JSON de informes y enviar lote de prueba a Apps Script
 * Estado: En desarrollo
 * Sprint: Portal Encargados — canal POST sin escritura
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

/**
 * Envía el lote completo del grupo (fase dryRun).
 * Usa text/plain para evitar preflight CORS con Apps Script.
 * No implica escritura en Google Sheets en esta fase.
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
