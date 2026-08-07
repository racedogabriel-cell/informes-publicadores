import { GOOGLE_REPORTS_ENDPOINT } from './config.js';

/**
 * Módulo: Informes (infraestructura de lectura)
 * Objetivo: obtener el JSON de informes desde Apps Script
 * Estado: En desarrollo
 * Sprint: Sprint Informes — consulta consolidada
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

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del endpoint no es un JSON válido.');
  }

  return data;
}
