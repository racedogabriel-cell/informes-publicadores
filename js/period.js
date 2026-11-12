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
  // Orden legacy Informes: más antiguo → más reciente (el select inicia en el último).
  return lastNMonthsOptions(3).slice().reverse();
}

/** @param {string} key YYYY-MM */
export function nextPeriodKey(key) {
  if (!isPeriodKey(key)) return null;
  const [year, month] = String(key).split('-').map(Number);
  const date = new Date(year, month, 1); // mes siguiente (month es 1-12 → índice Date = month)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Período sugerido al abrir desde Informes: el mes siguiente al último cerrado.
 * Si no hay cerrado válido, usa el mes pasado del calendario.
 * @param {string} [lastClosedKey]
 * @returns {{ key: string, label: string } | null}
 */
export function suggestedOpenPeriod(lastClosedKey) {
  const next = nextPeriodKey(lastClosedKey);
  if (next) return { key: next, label: periodKeyToLabel(next) };
  const previous = lastNMonthsOptions(2)[1] || lastNMonthsOptions(2)[0];
  return previous || null;
}

/**
 * Últimos N meses de calendario (incluye el mes actual), del más reciente al más antiguo.
 * @param {number} [count=24]
 * @returns {{ key: string, label: string }[]}
 */
export function lastNMonthsOptions(count = 24) {
  const total = Math.max(1, Number(count) || 24);
  const now = new Date();
  const options = [];
  for (let offset = 0; offset < total; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    options.push({ key, label: periodKeyToLabel(key) });
  }
  return options;
}
