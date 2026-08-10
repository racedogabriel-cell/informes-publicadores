/**
 * Criterio único de completitud de informes (docs/07 + Portal Encargados).
 * Ambos portales deben importar desde aquí: no duplicar reglas.
 *
 * Completa = privilegio válido + horas válidas para ese privilegio.
 * Estudios / comentarios no cuentan.
 * Sheets puede devolver enteros como "12.0" / "12,0" (getDisplayValues).
 */

export const VALID_PRIVILEGES = ['Publicador', 'Auxiliar', 'Regular', 'Inactivo'];

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Normaliza Sí/No para validación y controles de Publicador.
 * Acepta equivalentes usados en la UI de Encargados.
 */
export function normalizeYesNo(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (token === 'si' || token === 's' || token === 'yes' || token === 'true' || token === '1') {
    return 'Sí';
  }
  if (token === 'no' || token === 'n' || token === 'false' || token === '0') return 'No';
  return '';
}

/**
 * Sheets suele devolver enteros como "12.0" / "5,0".
 * Se normaliza solo para validar / mostrar controles; no altera Sheets.
 */
export function normalizeIntegerField(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return '';
    return String(value);
  }

  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d+$/.test(text)) return text;
  const normalized = text.replace(',', '.');
  if (/^\d+\.0+$/.test(normalized)) return normalized.replace(/\.0+$/, '');
  if (/^\d+\.\d+$/.test(normalized)) {
    const num = Number(normalized);
    if (Number.isFinite(num) && num >= 0 && Number.isInteger(num)) return String(num);
  }
  return text;
}

export function isPublicadorHours(value) {
  return Boolean(normalizeYesNo(value));
}

export function isNumericHours(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;
  const text = normalizeIntegerField(value);
  if (!text) return false;
  if (normalizeYesNo(text)) return false;
  return /^\d+$/.test(text);
}

export function isValidPrivilege(privilegio) {
  return VALID_PRIVILEGES.includes(normalizeText(privilegio));
}

/** Completitud: privilegio + horas válidas. Estudios/comentarios no cuentan. */
export function isPersonComplete(privilegio, horas) {
  const privilege = normalizeText(privilegio);
  if (privilege === 'Inactivo') return true;
  if (privilege === 'Publicador') return isPublicadorHours(horas);
  if (privilege === 'Auxiliar' || privilege === 'Regular') return isNumericHours(horas);
  return false;
}

/** Misma regla, firma por objeto informe (Portal General). */
export function isReportComplete(report) {
  return isPersonComplete(report?.privilegio, report?.horas);
}

export function hasStarted(privilegio, horas, estudios, comentarios) {
  return Boolean(
    normalizeText(privilegio) ||
      normalizeText(horas) ||
      normalizeText(estudios) ||
      normalizeText(comentarios),
  );
}

/** Clase visual de fila: is-complete | is-editing | is-empty */
export function completenessClass(person) {
  const privilegio = person?.privilegio;
  const horas = person?.horas;
  if (isPersonComplete(privilegio, horas)) return 'is-complete';
  if (hasStarted(privilegio, horas, person?.estudios, person?.comentarios)) return 'is-editing';
  return 'is-empty';
}

export function privilegeSlug(privilegio) {
  const value = normalizeText(privilegio).toLowerCase();
  if (!value) return 'none';
  if (value === 'publicador') return 'publicador';
  if (value === 'auxiliar') return 'auxiliar';
  if (value === 'regular') return 'regular';
  if (value === 'inactivo') return 'inactivo';
  return 'none';
}
