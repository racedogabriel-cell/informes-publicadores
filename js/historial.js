import { getHistorial } from './sheets.js';
import { lastNMonthsOptions, periodKeyToLabel } from './period.js';
import {
  completenessClass,
  isReportComplete,
  normalizeIntegerField,
  normalizeText,
  normalizeYesNo,
  privilegeSlug,
} from './report-status.js';
import { buildPrivilegeSummary } from './reports-summary.js';

/**
 * Módulo: Historial (Portal General)
 * Consulta de solo lectura de informes de los últimos 24 meses.
 * No crea, edita ni elimina. No monta reports-editor ni llama a save.
 */

const HISTORIAL_MONTHS = 24;

/** Panel Resumen cerrado por defecto (solo memoria de sesión de vista). */
let summaryOpen = false;

export function historialPeriods() {
  return lastNMonthsOptions(HISTORIAL_MONTHS);
}

export function historialView(period) {
  const key = period || historialPeriods()[0].key;
  return `<div class="informes-view historial-view" id="historial-view" data-period="${escapeHtml(key)}"></div>`;
}

export function bindHistorial(period, onPeriodChange) {
  const root = document.querySelector('#historial-view');
  if (!root) return;

  summaryOpen = false;

  root.onclick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === 'retry-historial') {
      loadHistorial(period, onPeriodChange);
      return;
    }

    const summaryToggle = target.closest('#historial-summary-toggle');
    if (summaryToggle) {
      summaryOpen = !summaryOpen;
      applySummaryOpenState();
    }
  };

  root.onchange = (event) => {
    if (event.target.id === 'historial-period') onPeriodChange(event.target.value);
  };

  loadHistorial(period, onPeriodChange);
}

async function loadHistorial(period, onPeriodChange) {
  const root = document.querySelector('#historial-view');
  if (!root) return;

  summaryOpen = false;
  const periods = historialPeriods();
  const viewKey = periods.some((item) => item.key === period) ? period : periods[0].key;
  if (viewKey !== period && onPeriodChange) {
    onPeriodChange(viewKey);
    return;
  }

  const monthLabel = periodKeyToLabel(viewKey);

  root.innerHTML = `
    ${renderMetaHeader(viewKey, { loading: true, periods, monthLabel })}
    <p class="informes-status" role="status">Sincronizando…</p>
  `;

  try {
    const data = await getHistorial(viewKey);
    if (!data) throw new Error('El conector de Apps Script no está configurado.');
    if (data.ok === false || data.error) {
      throw new Error(String(data.error || data.message || 'No se pudo leer el Historial.'));
    }

    const groups = data.groups || [];
    const reports = groups.flatMap((group) =>
      (group.informes || [])
        .filter((report) => hasRequiredIdentity(report))
        .map((report) => ({
          ...report,
          grupo: group.grupo,
          grupoId: group.grupoId || '',
          grupoColor: group.color || '',
          mes: group.mes || monthLabel,
        })),
    );

    renderHistorialView({
      viewKey,
      monthLabel: data.mes || monthLabel,
      periods,
      generatedAt: formatGeneratedAt(data.generatedAt),
      source: data.source || 'historial',
      reports,
    });
  } catch (error) {
    root.innerHTML = `
      ${renderMetaHeader(viewKey, { error: true, periods, monthLabel })}
      <article class="panel card">
        <p class="status-missing">No se pudieron obtener los informes del Historial.</p>
        <p class="muted">${escapeHtml(error.message || 'Error desconocido')}</p>
        <p><button type="button" class="button" id="retry-historial">Reintentar</button></p>
      </article>
    `;
  }
}

function renderHistorialView(snapshot) {
  const root = document.querySelector('#historial-view');
  if (!root) return;

  const { viewKey, monthLabel, periods, generatedAt, reports } = snapshot;
  const groupStatuses = buildGroupStatusesFromReports(reports);
  const summary = buildPrivilegeSummary(reports);

  if (!reports.length) {
    root.innerHTML = `
      ${renderMetaHeader(viewKey, {
        monthLabel,
        periods,
        generatedAt,
        summaryOpen,
        showSummary: true,
        summaryPanel: renderSummaryPanel(summary, { open: summaryOpen }),
      })}
      <p class="informes-empty muted">No hay informes en el Historial para ${escapeHtml(monthLabel)}.</p>
    `;
    applySummaryOpenState();
    return;
  }

  root.innerHTML = `
    ${renderMetaHeader(viewKey, {
      monthLabel,
      periods,
      generatedAt,
      summaryOpen,
      showSummary: true,
      summaryPanel: renderSummaryPanel(summary, { open: summaryOpen }),
    })}
    ${renderReportsBoard(reports, groupStatuses)}
  `;
  applySummaryOpenState();
}

function applySummaryOpenState() {
  const toggle = document.querySelector('#historial-summary-toggle');
  const panel = document.querySelector('#historial-summary-panel');
  if (toggle instanceof HTMLElement) {
    toggle.setAttribute('aria-expanded', summaryOpen ? 'true' : 'false');
    const caret = toggle.querySelector('[data-summary-caret]');
    if (caret) caret.textContent = summaryOpen ? '▴' : '▾';
  }
  if (panel instanceof HTMLElement) {
    panel.hidden = !summaryOpen;
  }
}

function renderSummaryPanel(summary, { open = false } = {}) {
  return `
    <section
      id="historial-summary-panel"
      class="informes-summary-panel"
      aria-label="Resumen de privilegios del período"
      ${open ? '' : 'hidden'}
    >
      <div class="informes-summary-activos">
        <span class="informes-summary-activos-label">Publicadores activos</span>
        <strong>${summary.publicadoresActivos}</strong>
      </div>
      <div class="informes-summary-grid">
        <article class="informes-summary-card is-publicador">
          <h3 class="informes-summary-title">Publicadores</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad</dt><dd>${summary.publicadores.cantidad}</dd></div>
            <div><dt>Estudios</dt><dd>${summary.publicadores.estudios}</dd></div>
          </dl>
        </article>
        <article class="informes-summary-card is-auxiliar">
          <h3 class="informes-summary-title">Auxiliar</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad</dt><dd>${summary.auxiliares.cantidad}</dd></div>
            <div><dt>Horas</dt><dd>${summary.auxiliares.horas}</dd></div>
            <div><dt>Estudios</dt><dd>${summary.auxiliares.estudios}</dd></div>
          </dl>
        </article>
        <article class="informes-summary-card is-regular">
          <h3 class="informes-summary-title">Regular</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad</dt><dd>${summary.regulares.cantidad}</dd></div>
            <div><dt>Horas</dt><dd>${summary.regulares.horas}</dd></div>
            <div><dt>Estudios</dt><dd>${summary.regulares.estudios}</dd></div>
          </dl>
        </article>
      </div>
    </section>
  `;
}

function renderMetaHeader(period, state = {}) {
  const periods = state.periods || historialPeriods();
  const monthLabel = state.monthLabel || periodKeyToLabel(period);

  const periodControl = state.loading || state.error
    ? `<span class="informes-meta-chip"><span class="informes-meta-label">Período</span><strong>${escapeHtml(monthLabel)}</strong></span>`
    : `
      <label class="informes-meta-chip informes-meta-period" for="historial-period">
        <span class="informes-meta-label">Período</span>
        <select id="historial-period" aria-label="Mes del Historial">
          ${periods
            .map((item) => `<option value="${item.key}" ${item.key === period ? 'selected' : ''}>${item.label}</option>`)
            .join('')}
        </select>
      </label>
    `;

  const modoChip = state.loading || state.error
    ? ''
    : `
      <span class="informes-meta-chip">
        <span class="informes-meta-label">Modo</span>
        <strong>Solo lectura</strong>
      </span>
    `;

  const summaryToggle = state.showSummary
    ? `<button
        type="button"
        id="historial-summary-toggle"
        class="informes-summary-toggle"
        aria-expanded="${state.summaryOpen ? 'true' : 'false'}"
        aria-controls="historial-summary-panel"
      >
        Resumen <span data-summary-caret aria-hidden="true">${state.summaryOpen ? '▴' : '▾'}</span>
      </button>`
    : '';

  return `
    <header class="informes-meta">
      <div class="informes-meta-main">
        <p class="informes-meta-title">Historial</p>
        <div class="informes-meta-chips" aria-label="Contexto del período">
          ${periodControl}
          ${modoChip}
        </div>
      </div>
      <div class="informes-meta-actions">
        ${summaryToggle}
        ${state.summaryPanel || ''}
      </div>
    </header>
  `;
}

function renderProgressShell(reports, groupStatuses) {
  const total = reports.length;
  const completed = reports.filter((report) => isReportComplete(report)).length;
  const pending = Math.max(total - completed, 0);
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const monthComplete = isMonthComplete(groupStatuses);

  const groupsLine = groupStatuses
    .map((group) => `${escapeHtml(group.grupo)}: ${group.completed}/${group.total}`)
    .join(' · ');

  return `
      <div class="encargados-progress informes-progress" data-complete="${monthComplete ? 'true' : 'false'}" aria-live="polite">
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
      </div>`;
}

function renderReportsBoard(reports, groupStatuses) {
  return `
    <section class="encargados-board informes-board" aria-label="Informes históricos">
      ${renderProgressShell(reports, groupStatuses)}
      <div class="encargados-table-scroll informes-table-scroll">
        <table class="encargados-table informes-table">
          <thead>
            <tr>
              <th class="col-name">Nombre</th>
              <th class="col-group">Grupo</th>
              <th class="col-privilege">Privilegio</th>
              <th class="col-hours">Horas</th>
              <th class="col-studies">Est.</th>
              <th class="col-comments">Comentarios</th>
            </tr>
          </thead>
          <tbody>
            ${reports.map(renderSupervisionRow).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSupervisionRow(report) {
  const state = completenessClass(report);
  const nombre = normalizeText(report.nombre);
  const privilegio = normalizeText(report.privilegio);
  const slug = privilegeSlug(privilegio);
  const privilegeLabel = privilegio || '—';
  const hoursLabel = displayHours(report);
  const studiesLabel = displayStudies(report);
  const rawComments = normalizeText(report?.comentarios);
  const hasComment = Boolean(rawComments);
  const commentsLabel = hasComment ? rawComments : '+';

  return `
    <tr class="${state}" data-privilege="${slug}">
      <td class="col-name person-name" data-label="Nombre" title="${escapeHtml(nombre)}">
        <span class="completeness-dot" aria-hidden="true"></span>${escapeHtml(nombre)}
      </td>
      <td class="col-group" data-label="Grupo">
        ${groupBadgeHtml(report)}
      </td>
      <td class="col-privilege" data-label="Privilegio">
        <span class="privilege-chip privilege-${slug}">${escapeHtml(privilegeLabel)}</span>
      </td>
      <td class="col-hours cell-value" data-label="Horas">${escapeHtml(hoursLabel)}</td>
      <td class="col-studies cell-value" data-label="Estudios">${escapeHtml(studiesLabel === '—' ? 'Est.' : studiesLabel)}</td>
      <td class="col-comments cell-value ${hasComment ? 'has-comment' : 'is-empty-comment'}" data-label="Comentarios">${escapeHtml(commentsLabel)}</td>
    </tr>`;
}

function shortGroupLabel(reportOrGrupo) {
  if (reportOrGrupo && typeof reportOrGrupo === 'object') {
    const id = normalizeText(reportOrGrupo.grupoId);
    if (id) return `G${id}`;
    return shortGroupLabel(reportOrGrupo.grupo);
  }
  const text = normalizeText(reportOrGrupo);
  const match = text.match(/^grupo\s*(\d+)$/i);
  if (match) return `G${match[1]}`;
  if (/^\d+$/.test(text)) return `G${text}`;
  return text || '—';
}

function groupBadgeHtml(report) {
  const label = shortGroupLabel(report);
  const title = normalizeText(report?.grupo) || label;
  const color = normalizeText(report?.grupoColor);
  const colorAttr = /^#[0-9A-Fa-f]{6}$/.test(color)
    ? ` style="--grupo-color:${escapeHtml(color)}" data-has-color="true"`
    : '';
  return `<span class="grupo-badge"${colorAttr} title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function hasRequiredIdentity(report) {
  return Boolean(normalizeText(report?.id) && normalizeText(report?.nombre));
}

function buildGroupStatusesFromReports(reports) {
  const byGroup = new Map();
  reports.forEach((report) => {
    const grupo = report.grupo || '—';
    if (!byGroup.has(grupo)) byGroup.set(grupo, []);
    byGroup.get(grupo).push(report);
  });
  return Array.from(byGroup.entries()).map(([grupo, members]) => {
    const completed = members.filter((report) => isReportComplete(report)).length;
    return {
      grupo,
      total: members.length,
      completed,
      complete: members.length > 0 && completed === members.length,
    };
  });
}

function isMonthComplete(groupStatuses) {
  return groupStatuses.length > 0 && groupStatuses.every((group) => group.complete);
}

function displayText(value) {
  const text = normalizeText(value);
  return text === '' ? '—' : text;
}

function displayHours(report) {
  const privilegio = normalizeText(report?.privilegio);
  if (privilegio === 'Inactivo') return '—';
  if (privilegio === 'Publicador') {
    return normalizeYesNo(report?.horas) || '—';
  }
  if (privilegio === 'Auxiliar' || privilegio === 'Regular') {
    const value = normalizeIntegerField(report?.horas);
    return /^\d+$/.test(value) ? value : displayText(report?.horas);
  }
  return displayText(report?.horas);
}

function displayStudies(report) {
  const privilegio = normalizeText(report?.privilegio);
  if (!privilegio) return '—';
  const value = normalizeIntegerField(report?.estudios);
  if (/^\d+$/.test(value)) return value;
  return displayText(report?.estudios);
}

function formatGeneratedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day} ${time}`;
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
