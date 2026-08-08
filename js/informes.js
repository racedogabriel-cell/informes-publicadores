import { getMonthlyReports, getSystemState } from './sheets.js';
import { calendarPeriodOptions, isEstadoAbierto, periodKeyToLabel } from './period.js';

/**
 * Módulo: Informes
 * Objetivo: vista ejecutiva del período vigente según Sistema
 * Estado: En desarrollo
 * Sprint: Estabilización 1 — Sistema como autoridad del período
 */

const VALID_PRIVILEGES = ['Publicador', 'Auxiliar', 'Regular', 'Inactivo'];

export function availablePeriods() {
  return calendarPeriodOptions();
}

export function reportsView(period) {
  return `<div class="informes-view" id="informes-view" data-period="${escapeHtml(period)}"></div>`;
}

export function bindReports(period, onPeriodChange) {
  const root = document.querySelector('#informes-view');
  if (!root) return;

  root.onclick = (event) => {
    const target = event.target;
    if (target.id === 'refresh-reports' || target.id === 'retry-reports') {
      loadReports(period, onPeriodChange);
    }
  };
  root.onchange = (event) => {
    if (event.target.id === 'report-period') onPeriodChange(event.target.value);
  };

  loadReports(period, onPeriodChange);
}

async function loadReports(period, onPeriodChange) {
  const root = document.querySelector('#informes-view');
  if (!root) return;

  root.innerHTML = `
    ${renderVerdictShell(period, { loading: true })}
    <p class="informes-status" role="status">Sincronizando…</p>
  `;

  try {
    const [system, data] = await Promise.all([getSystemState(), getMonthlyReports()]);
    if (!data) throw new Error('El conector de Apps Script no está configurado.');
    if (data.error) throw new Error(String(data.error));
    if (system?.error) throw new Error(String(system.error || system.message));

    const systemKey = String(system?.PeriodoActivo || '').trim();
    const systemOpen = isEstadoAbierto(system?.EstadoPeriodo);

    // Sistema es la autoridad: alinear el selector al período vigente cuando exista.
    if (systemKey && systemKey !== period && onPeriodChange) {
      onPeriodChange(systemKey);
      return;
    }

    const viewKey = systemKey || period;
    const viewLabel = periodKeyToLabel(viewKey);
    const periods = systemKey
      ? [{ key: systemKey, label: viewLabel }]
      : ensurePeriodOption(availablePeriods(), viewKey, viewLabel);

    // Período de Sistema: las hojas de trabajo son la fuente de filas (no se filtra por B3).
    const groups =
      systemKey && viewKey === systemKey
        ? data.groups || []
        : (data.groups || []).filter((group) => group.mes === viewLabel);

    const reports = groups.flatMap((group) =>
      (group.informes || [])
        .filter((report) => hasRequiredIdentity(report))
        .map((report) => ({ ...report, grupo: group.grupo, mes: group.mes })),
    );
    const generatedAt = formatGeneratedAt(data.generatedAt);
    const groupStatuses = buildGroupStatuses(groups);
    const monthComplete = isMonthComplete(groupStatuses);
    const monthLabel = viewLabel;
    const systemNote = systemKey
      ? `Sistema: ${viewLabel} (${systemOpen ? 'ABIERTO' : 'CERRADO'})`
      : 'Sistema sin PeriodoActivo';

    if (!reports.length) {
      root.innerHTML = `
        ${renderVerdictShell(viewKey, {
          monthLabel,
          empty: true,
          periods,
          systemNote,
        })}
        <article class="panel card informes-empty">
          <p>No hay informes para ${escapeHtml(monthLabel)}.</p>
          <p class="muted">${escapeHtml(systemNote)}.</p>
          <p class="muted">Si el período está abierto, verificá que las hojas Grupo 1/2 tengan filas.</p>
        </article>
        ${renderSyncBlock(generatedAt)}
      `;
      return;
    }

    const pendingReports = reports.filter((report) => !isReportComplete(report));
    root.innerHTML = `
      ${renderVerdictShell(viewKey, {
        monthLabel,
        monthComplete,
        pendingCount: pendingReports.length,
        periods,
        systemNote,
      })}
      ${renderPendingBlock(pendingReports, monthComplete)}
      ${renderGroupStatusBlock(groupStatuses)}
      ${renderSyncBlock(generatedAt)}
      ${renderDetailTable(reports)}
    `;
  } catch (error) {
    root.innerHTML = `
      ${renderVerdictShell(period, { error: true })}
      <article class="panel card">
        <p class="status-missing">No se pudieron obtener los informes.</p>
        <p class="muted">${escapeHtml(error.message || 'Error desconocido')}</p>
        <p><button type="button" class="button" id="retry-reports">Reintentar</button></p>
      </article>
    `;
  }
}

function ensurePeriodOption(periods, key, label) {
  if (!key || periods.some((item) => item.key === key)) return periods;
  return [...periods, { key, label }];
}

function renderVerdictShell(period, state = {}) {
  const periods = state.periods || availablePeriods();
  const select = `
    <div class="month-picker month-picker-inline">
      <label for="report-period">Mes:</label>
      <select id="report-period" aria-label="Mes">
        ${periods
          .map((item) => `<option value="${item.key}" ${item.key === period ? 'selected' : ''}>${item.label}</option>`)
          .join('')}
      </select>
    </div>
    ${state.systemNote ? `<p class="muted informes-system-note">${escapeHtml(state.systemNote)}</p>` : ''}
  `;

  let verdict = '';
  if (state.loading) {
    verdict = `<p class="month-verdict-label muted">Cargando estado del mes…</p>`;
  } else if (state.error) {
    verdict = `<p class="month-verdict-label status-missing">Sin datos</p>`;
  } else if (state.empty) {
    verdict = `<p class="month-verdict-label muted">Sin informes para este mes</p>`;
  } else if (state.monthComplete) {
    verdict = `
      <p class="month-verdict-label is-complete">✔ Mes completo</p>
    `;
  } else {
    verdict = `
      <p class="month-verdict-label is-incomplete">⚠ Mes incompleto</p>
      <p class="month-verdict-pending">Pendientes: ${state.pendingCount}</p>
    `;
  }

  return `
    <section class="month-verdict-block ${state.monthComplete ? 'is-complete' : ''} ${state.monthComplete === false ? 'is-incomplete' : ''}">
      ${select}
      <div class="month-verdict-body">${verdict}</div>
    </section>
  `;
}

function renderPendingBlock(pendingReports, monthComplete) {
  if (monthComplete || pendingReports.length === 0) {
    return `
      <section class="informes-pending-block card">
        <p class="informes-pending-empty">No hay personas pendientes.</p>
      </section>
    `;
  }

  const byGroup = new Map();
  for (const report of pendingReports) {
    const key = report.grupo || 'Sin grupo';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(report);
  }

  const groupsHtml = [...byGroup.entries()]
    .map(([grupo, people]) => {
      const names = people
        .map((person) => `<li class="person-name">${escapeHtml(displayText(person.nombre))}</li>`)
        .join('');
      return `
        <div class="pending-group">
          <p class="pending-group-name">${escapeHtml(grupo)}</p>
          <ul class="pending-list">${names}</ul>
        </div>
      `;
    })
    .join('');

  return `<section class="informes-pending-block card">${groupsHtml}</section>`;
}

function renderGroupStatusBlock(groupStatuses) {
  return `
    <section class="informes-groups-block">
      ${groupStatuses
        .map((group) => {
          const icon = group.complete ? '✔' : '⚠';
          return `
            <div class="group-status-row">
              <span class="group-status-name">${escapeHtml(group.grupo)}</span>
              <span class="group-status-metric">${icon} ${group.completed}/${group.total}</span>
            </div>
          `;
        })
        .join('')}
    </section>
  `;
}

function renderSyncBlock(generatedAt) {
  return `
    <section class="informes-sync-block">
      <p class="informes-sync-meta muted">Última sincronización: ${escapeHtml(generatedAt)}</p>
      <button class="button" id="refresh-reports" type="button">Sincronizar</button>
    </section>
  `;
}

function renderDetailTable(reports) {
  return `
    <article class="card table-wrap report-list">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Grupo</th>
            <th>Privilegio</th>
            <th>Horas</th>
            <th>Estudios</th>
            <th>Comentarios</th>
          </tr>
        </thead>
        <tbody>
          ${reports
            .map((report) => {
              const pending = !isReportComplete(report);
              return `
            <tr class="${pending ? 'is-pending-row' : ''}">
              <td class="person-name">${escapeHtml(displayText(report.nombre))}</td>
              <td><span class="badge">${escapeHtml(report.grupo)}</span></td>
              <td>${escapeHtml(displayText(report.privilegio))}</td>
              <td>${escapeHtml(displayHours(report))}</td>
              <td>${escapeHtml(displayText(report.estudios))}</td>
              <td>${escapeHtml(displayText(report.comentarios))}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </article>
  `;
}

/** §4: id y nombre obligatorios para incluir la fila en el consolidado. */
function hasRequiredIdentity(report) {
  return Boolean(normalizeText(report?.id) && normalizeText(report?.nombre));
}

/** §3.1 */
function isValidPrivilege(privilegio) {
  return VALID_PRIVILEGES.includes(normalizeText(privilegio));
}

/** §3.3 / §3.4 */
function isValidHoursForPrivilege(privilegio, horas) {
  const privilege = normalizeText(privilegio);

  if (privilege === 'Inactivo') return true;
  if (privilege === 'Publicador') return isPublicadorHours(horas);
  if (privilege === 'Auxiliar' || privilege === 'Regular') return isNumericHours(horas);
  return false;
}

/**
 * Normalización solo para validar Sí/No (mayúsculas/minúsculas/tilde).
 * No altera el valor recibido ni su presentación.
 */
function normalizeYesNoToken(value) {
  const text = normalizeText(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (text === 'si') return 'si';
  if (text === 'no') return 'no';
  return null;
}

function isPublicadorHours(value) {
  const token = normalizeYesNoToken(value);
  return token === 'si' || token === 'no';
}

function isNumericHours(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;

  const text = normalizeText(value);
  if (!text) return false;
  if (normalizeYesNoToken(text)) return false;
  return /^\d+$/.test(text);
}

/** §5 */
function isReportComplete(report) {
  const privilegio = normalizeText(report?.privilegio);
  if (privilegio === 'Inactivo') return true;
  if (!isValidPrivilege(privilegio)) return false;
  return isValidHoursForPrivilege(privilegio, report?.horas);
}

/** §6 */
function buildGroupStatuses(groups) {
  return groups.map((group) => {
    const members = (group.informes || []).filter((report) => hasRequiredIdentity(report));
    const completed = members.filter((report) => isReportComplete(report)).length;
    return {
      grupo: group.grupo,
      total: members.length,
      completed,
      complete: members.length > 0 && completed === members.length,
    };
  });
}

/** §7 — evaluado solo sobre grupos incluidos en la vista del mes. */
function isMonthComplete(groupStatuses) {
  return groupStatuses.length > 0 && groupStatuses.every((group) => group.complete);
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function displayText(value) {
  const text = normalizeText(value);
  return text === '' ? '—' : text;
}

/** §10: Inactivo con horas vacío puede mostrarse como guion sin afectar completitud. */
function displayHours(report) {
  if (normalizeText(report?.privilegio) === 'Inactivo' && normalizeText(report?.horas) === '') {
    return '—';
  }
  if (report?.horas === 0 || report?.horas === '0') return '0';
  return displayText(report?.horas);
}

function formatGeneratedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-AR');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}
