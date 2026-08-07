/**
 * Utilidades de período alineadas a Sistema / Apps Script.
 * Etiquetas canónicas: "Julio 2026" (sin "de"), clave: YYYY-MM.
 */

const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const NETWORK_TIMEOUT_MS = 45000;

/** @param {string} key YYYY-MM */
export function periodKeyToLabel(key) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key || '')) return key || '—';
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS_ES[month - 1]} ${year}`;
}

export function isPeriodKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '').trim());
}

export function normalizeEstadoPeriodo(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isEstadoAbierto(value) {
  return normalizeEstadoPeriodo(value) === 'ABIERTO';
}

/** Meses de selector (actual y dos anteriores), etiquetas canónicas. */
export function calendarPeriodOptions() {
  const now = new Date();
  return [-2, -1, 0].map((offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: periodKeyToLabel(key) };
  });
}
