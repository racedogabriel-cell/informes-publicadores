import { getMonthlyReports, getSystemState } from './sheets.js';
import { calendarPeriodOptions, isEstadoAbierto, periodKeyToLabel } from './period.js';

/**
 * Módulo: Informes
 * Objetivo: consulta consolidada RO del período vigente (META → PROGRESO → TABLA)
 * Estado: En desarrollo
 * Sprint: Simplificación UI — patrón progreso + listado
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
    ${renderMetaHeader(period, { loading: true })}
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
    const monthLabel = viewLabel;
    const systemEstado = systemKey ? (systemOpen ? 'ABIERTO' : 'CERRADO') : null;

    if (!reports.length) {
      root.innerHTML = `
        ${renderMetaHeader(viewKey, {
          monthLabel,
          periods,
          systemEstado,
          generatedAt,
        })}
        <p class="informes-empty muted">No hay informes para ${escapeHtml(monthLabel)}.</p>
      `;
      return;
    }

    root.innerHTML = `
      ${renderMetaHeader(viewKey, {
        monthLabel,
        periods,
        systemEstado,
        generatedAt,
      })}
      ${renderProgressBlock(reports, groupStatuses)}
      ${renderDetailTable(reports)}
    `;
  } catch (error) {
    root.innerHTML = `
      ${renderMetaHeader(period, { error: true })}
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

function renderMetaHeader(period, state = {}) {
  const periods = state.periods || availablePeriods();
  const monthLabel = state.monthLabel || periodKeyToLabel(period);

  const periodControl = state.loading || state.error
    ? `<span class="informes-meta-chip"><span class="informes-meta-label">Período</span><strong>${escapeHtml(monthLabel)}</strong></span>`
    : `
      <label class="informes-meta-chip informes-meta-period" for="report-period">
        <span class="informes-meta-label">Período</span>
        <select id="report-period" aria-label="Mes">
          ${periods
            .map((item) => `<option value="${item.key}" ${item.key === period ? 'selected' : ''}>${item.label}</option>`)
            .join('')}
        </select>
      </label>
    `;

  let estadoChip = '';
  if (state.loading) {
    estadoChip = `<span class="informes-meta-chip"><span class="informes-meta-label">Sistema</span><strong class="muted">…</strong></span>`;
  } else if (state.error) {
    estadoChip = `<span class="informes-meta-chip"><span class="informes-meta-label">Sistema</span><strong class="status-missing">Sin datos</strong></span>`;
  } else if (state.systemEstado) {
    const open = state.systemEstado === 'ABIERTO';
    estadoChip = `
      <span class="informes-meta-chip">
        <span class="informes-meta-label">Sistema</span>
        <strong class="informes-estado ${open ? 'is-open' : 'is-closed'}">${escapeHtml(state.systemEstado)}</strong>
      </span>
    `;
  } else {
    estadoChip = `
      <span class="informes-meta-chip">
        <span class="informes-meta-label">Sistema</span>
        <strong class="muted">Sin PeriodoActivo</strong>
      </span>
    `;
  }

  const syncMeta = state.generatedAt
    ? `<span class="informes-sync-meta muted">Última sincronización: ${escapeHtml(state.generatedAt)}</span>`
    : state.loading
      ? `<span class="informes-sync-meta muted">Sincronizando…</span>`
      : '';

  const syncButton =
    state.loading || state.error
      ? ''
      : `<button class="button" id="refresh-reports" type="button">Sincronizar</button>`;

  return `
    <header class="informes-meta">
      <div class="informes-meta-main">
        <p class="informes-meta-title">Informes</p>
        <div class="informes-meta-chips" aria-label="Contexto del período">
          ${periodControl}
          ${estadoChip}
        </div>
      </div>
      <div class="informes-meta-actions">
        ${syncMeta}
        ${syncButton}
      </div>
    </header>
  `;
}

function renderProgressBlock(reports, groupStatuses) {
  const total = reports.length;
  const completed = reports.filter((report) => isReportComplete(report)).length;
  const pending = Math.max(total - completed, 0);
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const monthComplete = isMonthComplete(groupStatuses);

  const groupsLine = groupStatuses
    .map((group) => `${escapeHtml(group.grupo)}: ${group.completed}/${group.total}`)
    .join(' · ');

  return `
    <section class="informes-progress" data-complete="${monthComplete ? 'true' : 'false'}" aria-live="polite">
      <div class="informes-progress-row">
        <div class="progress-stats">
          <span class="progress-stat"><strong>${total}</strong><span class="progress-stat-label">personas</span></span>
          <span class="progress-stat is-complete-stat"><strong>${completed}</strong><span class="progress-stat-label">completas</span></span>
          <span class="progress-stat is-pending-stat"><strong>${pending}</strong><span class="progress-stat-label">pendientes</span></span>
          <span class="progress-stat"><strong>${pct}%</strong><span class="progress-stat-label">avance</span></span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso del mes: ${completed} de ${total} completas">
          <i style="width:${pct}%"></i>
        </div>
      </div>
      ${groupsLine ? `<p class="informes-groups-line muted">${groupsLine}</p>` : ''}
    </section>
  `;
}

function renderDetailTable(reports) {
  return `
    <article class="informes-board" aria-label="Informes consolidados">
      <div class="informes-table-scroll">
        <table class="data-table informes-table">
          <thead>
            <tr>
              <th class="col-name">Nombre</th>
              <th class="col-group">Grupo</th>
              <th class="col-privilege">Privilegio</th>
              <th class="col-hours">Horas</th>
              <th class="col-studies">Estudios</th>
              <th class="col-comments">Comentarios</th>
            </tr>
          </thead>
          <tbody>
            ${reports
              .map((report) => {
                const pending = !isReportComplete(report);
                return `
            <tr class="${pending ? 'is-pending-row' : ''}">
              <td class="col-name person-name" data-label="Nombre">${escapeHtml(displayText(report.nombre))}</td>
              <td class="col-group" data-label="Grupo"><span class="badge">${escapeHtml(report.grupo)}</span></td>
              <td class="col-privilege" data-label="Privilegio">${escapeHtml(displayText(report.privilegio))}</td>
              <td class="col-hours" data-label="Horas">${escapeHtml(displayHours(report))}</td>
              <td class="col-studies" data-label="Estudios">${escapeHtml(displayText(report.estudios))}</td>
              <td class="col-comments" data-label="Comentarios">${escapeHtml(displayText(report.comentarios))}</td>
            </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
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
