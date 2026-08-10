/**
 * Resumen de privilegios del período (Portal General).
 * Misma fuente que el listado: array de informes/personas.
 * No altera completitud ni reglas de Encargados.
 *
 * PUBLICADORES (cantidad/estudios): solo Publicador + Horas = Sí.
 * PUBLICADORES ACTIVOS: todo Publicador + Auxiliar + Regular (sin filtrar Horas).
 */

import { normalizeIntegerField, normalizeText, normalizeYesNo } from './report-status.js';

function toSumInt(value) {
  const text = normalizeIntegerField(value);
  if (!/^\d+$/.test(text)) return 0;
  return Number(text);
}

function emptyBucket() {
  return { cantidad: 0, horas: 0, estudios: 0 };
}

/**
 * @param {Array<{ privilegio?: string, horas?: string|number, estudios?: string|number }>} reports
 */
export function buildPrivilegeSummary(reports) {
  const publicadores = emptyBucket();
  const auxiliares = emptyBucket();
  const regulares = emptyBucket();
  let publicadoresActivos = 0;

  (reports || []).forEach((report) => {
    const privilegio = normalizeText(report?.privilegio);

    if (privilegio === 'Publicador') {
      publicadoresActivos += 1;
      if (normalizeYesNo(report?.horas) === 'Sí') {
        publicadores.cantidad += 1;
        publicadores.estudios += toSumInt(report?.estudios);
      }
      return;
    }

    if (privilegio === 'Auxiliar') {
      publicadoresActivos += 1;
      auxiliares.cantidad += 1;
      auxiliares.horas += toSumInt(report?.horas);
      auxiliares.estudios += toSumInt(report?.estudios);
      return;
    }

    if (privilegio === 'Regular') {
      publicadoresActivos += 1;
      regulares.cantidad += 1;
      regulares.horas += toSumInt(report?.horas);
      regulares.estudios += toSumInt(report?.estudios);
    }
  });

  return {
    publicadores,
    auxiliares,
    regulares,
    publicadoresActivos,
  };
}
