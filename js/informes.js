import { closePeriod, getMonthlyReports, getSystemState, openPeriod } from './sheets.js';
import {
  calendarPeriodOptions,
  isEstadoAbierto,
  periodKeyToLabel,
  suggestedOpenPeriod,
} from './period.js';
import {
  completenessClass,
  isReportComplete,
  normalizeIntegerField,
  normalizeText,
  normalizeYesNo,
  privilegeSlug,
} from './report-status.js';
import {
  createReportsEditor,
  renderEditableRow,
  seedPersonFromApi,
} from './reports-editor.js';
import { buildPrivilegeSummary } from './reports-summary.js';

/**
 * Módulo: Informes (Portal General)
 * Consulta consolidada por defecto; modo edición opcional reutiliza reports-editor.js
 */

/** Solo en memoria de la vista — nunca persistir. Siempre inicia en false. */
let editMode = false;
/** Panel Resumen cerrado por defecto (solo memoria de sesión de vista). */
let summaryOpen = false;
/** @type {ReturnType<typeof createReportsEditor> | null} */
let activeEditor = null;
/** @type {object | null} */
let viewSnapshot = null;
/** @type {{ period: string, onPeriodChange: ((key: string) => void) | null }} */
let bindContext = { period: '', onPeriodChange: null };

export function availablePeriods() {
  return calendarPeriodOptions();
}

export function reportsView(period) {
  return `<div class="informes-view" id="informes-view" data-period="${escapeHtml(period)}"></div>`;
}

export function bindReports(period, onPeriodChange) {
  const root = document.querySelector('#informes-view');
  if (!root) return;

  bindContext = { period, onPeriodChange };
  editMode = false;
  summaryOpen = false;
  destroyEditor();

  root.onclick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === 'retry-reports') {
      loadReports(period, onPeriodChange);
      return;
    }

    const summaryToggle = target.closest('#informes-summary-toggle');
    if (summaryToggle) {
      summaryOpen = !summaryOpen;
      applySummaryOpenState();
      return;
    }

    const closePeriodBtn = target.closest('#informes-close-period');
    if (closePeriodBtn) {
      handleClosePeriodFromSummary(closePeriodBtn);
      return;
    }

    if (target.id === 'informes-open-period') {
      handleOpenPeriodFromInformes(target);
      return;
    }

    if (target.id === 'edit-mode-toggle') {
      handleEditModeToggle(target);
      return;
    }

    if (target.id === 'edit-mode-cancel') {
      closeEditConfirm();
      return;
    }

    if (target.id === 'edit-mode-confirm') {
      closeEditConfirm();
      setEditMode(true);
      return;
    }

    if (target.id === 'informes-save-retry') {
      activeEditor?.retryLastFailedSave();
    }
  };

  root.onchange = (event) => {
    if (event.target.id === 'report-period') onPeriodChange(event.target.value);
  };

  loadReports(period, onPeriodChange);
}

function destroyEditor() {
  activeEditor?.destroy();
  activeEditor = null;
}

function handleEditModeToggle(toggle) {
  if (!(toggle instanceof HTMLInputElement)) return;
  if (!viewSnapshot?.canEdit) {
    toggle.checked = false;
    return;
  }

  if (toggle.checked) {
    toggle.checked = false;
    openEditConfirm();
    return;
  }

  setEditMode(false);
}

function openEditConfirm() {
  const root = document.querySelector('#informes-view');
  if (!root || root.querySelector('#edit-mode-dialog')) return;
  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="edit-mode-backdrop" id="edit-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-mode-dialog-title">
      <div class="edit-mode-dialog">
        <h2 id="edit-mode-dialog-title">Activar modo edición</h2>
        <p>Podrás modificar los informes de todos los grupos.</p>
        <div class="edit-mode-dialog-actions">
          <button type="button" class="button button-secondary" id="edit-mode-cancel">Cancelar</button>
          <button type="button" class="button" id="edit-mode-confirm">Activar</button>
        </div>
      </div>
    </div>
  `,
  );
}

function closeEditConfirm() {
  document.querySelector('#edit-mode-dialog')?.remove();
  const toggle = document.querySelector('#edit-mode-toggle');
  if (toggle instanceof HTMLInputElement) toggle.checked = editMode;
}

function setEditMode(enabled) {
  if (!viewSnapshot) return;
  if (enabled && !viewSnapshot.canEdit) return;

  editMode = Boolean(enabled);
  const people = activeEditor ? activeEditor.readAllPeople() : viewSnapshot.reports;
  const reports = mergePeopleIntoReports(viewSnapshot.reports, people);
  viewSnapshot = { ...viewSnapshot, reports };
  renderCurrentView();
}

function mergePeopleIntoReports(baseReports, people) {
  const byId = new Map(people.map((person) => [String(person.id), person]));
  return baseReports.map((report) => {
    const updated = byId.get(String(report.id));
    if (!updated) return report;
    return {
      ...report,
      privilegio: updated.privilegio,
      horas: updated.horas,
      estudios: updated.estudios,
      comentarios: updated.comentarios,
    };
  });
}

async function loadReports(period, onPeriodChange) {
  const root = document.querySelector('#informes-view');
  if (!root) return;

  destroyEditor();
  editMode = false;
  summaryOpen = false;
  viewSnapshot = null;

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

    if (systemKey && systemKey !== period && onPeriodChange) {
      onPeriodChange(systemKey);
      return;
    }

    const viewKey = systemKey || period;
    const viewLabel = periodKeyToLabel(viewKey);
    const periods = systemKey
      ? [{ key: systemKey, label: viewLabel }]
      : ensurePeriodOption(availablePeriods(), viewKey, viewLabel);

    const groups =
      systemKey && viewKey === systemKey
        ? data.groups || []
        : (data.groups || []).filter((group) => group.mes === viewLabel);

    const reports = groups.flatMap((group) =>
      (group.informes || [])
        .filter((report) => hasRequiredIdentity(report))
        .map((report) => ({
          ...report,
          grupo: group.grupo,
          grupoId: group.grupoId || '',
          grupoColor: group.color || '',
          mes: group.mes,
        })),
    );

    viewSnapshot = {
      viewKey,
      monthLabel: viewLabel,
      periods,
      systemKey,
      systemOpen,
      systemEstado: systemKey ? (systemOpen ? 'ABIERTO' : 'CERRADO') : null,
      canEdit: Boolean(systemKey && systemOpen),
      generatedAt: formatGeneratedAt(data.generatedAt),
      groups,
      reports,
    };

    renderCurrentView();
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

function renderCurrentView() {
  const root = document.querySelector('#informes-view');
  if (!root || !viewSnapshot) return;

  destroyEditor();

  const {
    viewKey,
    monthLabel,
    periods,
    systemEstado,
    systemOpen,
    canEdit,
    generatedAt,
    reports,
  } = viewSnapshot;

  const groupStatuses = buildGroupStatusesFromReports(reports);
  const openPeriodPanel = systemOpen
    ? ''
    : renderOpenPeriodPanel(viewSnapshot.systemKey || viewKey);
  const showSummary = Boolean(systemOpen);

  if (!reports.length) {
    const emptySummary = buildPrivilegeSummary(reports);
    const emptyProgress = buildSummaryProgress(reports);
    root.innerHTML = `
      ${openPeriodPanel}
      ${renderMetaHeader(viewKey, {
        monthLabel,
        periods,
        systemEstado,
        generatedAt,
        canEdit,
        editMode: false,
        summaryOpen,
        showSummary,
        summaryPanel: showSummary
          ? renderSummaryPanel(emptySummary, {
              open: summaryOpen,
              progress: emptyProgress,
            })
          : '',
      })}
      <p class="informes-empty muted">No hay informes para ${escapeHtml(monthLabel)}.</p>
    `;
    applySummaryOpenState();
    return;
  }

  const summary = buildPrivilegeSummary(reports);
  const progress = buildSummaryProgress(reports);

  root.innerHTML = `
    ${openPeriodPanel}
    ${renderMetaHeader(viewKey, {
      monthLabel,
      periods,
      systemEstado,
      generatedAt,
      canEdit,
      editMode,
      summaryOpen,
      showSummary,
      summaryPanel: showSummary
        ? renderSummaryPanel(summary, {
            open: summaryOpen,
            progress,
          })
        : '',
    })}
    ${editMode ? renderEditableBoard(reports, groupStatuses) : renderReportsBoard(reports, groupStatuses)}
  `;

  applySummaryOpenState();

  if (editMode) {
    mountEditor(reports);
  }
}

function mountEditor(reports) {
  const root = document.querySelector('#informes-view');
  if (!root || !viewSnapshot) return;

  const people = reports.map((report) => seedPersonFromApi(report));
  activeEditor = createReportsEditor({
    root,
    getSaveContext: (row) => ({
      grupo: row?.getAttribute?.('data-grupo') || '',
      grupoId: row?.getAttribute?.('data-grupo-id') || '',
      mes: viewSnapshot.monthLabel,
      periodo: viewSnapshot.systemKey,
    }),
    onSaveStateChange: setInformesSaveIndicator,
    onAfterChange: syncSummaryFromEditor,
  });
  activeEditor.seedLastSaved(people);
  activeEditor.bind();
  setInformesSaveIndicator({ state: 'saved', message: 'Guardado' });
}

function syncSummaryFromEditor() {
  if (!viewSnapshot || !activeEditor) return;
  const people = activeEditor.readAllPeople();
  const reports = mergePeopleIntoReports(viewSnapshot.reports, people);
  viewSnapshot = { ...viewSnapshot, reports };
  paintPrivilegeSummary(buildPrivilegeSummary(reports));
  paintSummaryProgress(buildSummaryProgress(reports));
}

async function handleClosePeriodFromSummary(button) {
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  if (!viewSnapshot?.systemOpen) return;

  const activeLabel = viewSnapshot.monthLabel || 'el período actual';
  const confirmed = window.confirm(
    `¿Cerrar ${activeLabel}?\n\nSe copiarán los informes a Historial y Sistema pasará a CERRADO.\nEsta acción no se puede deshacer desde la app.`,
  );
  if (!confirmed) return;

  button.disabled = true;
  paintSummaryProgressFeedback('Cerrando período…', 'info');

  try {
    const result = await closePeriod();
    if (!result?.ok) {
      paintSummaryProgressFeedback(
        result?.message || result?.error || 'No se pudo cerrar el período.',
        'error',
      );
      button.disabled = false;
      return;
    }

    const reloadPeriod = viewSnapshot.viewKey || bindContext.period;
    await loadReports(reloadPeriod, bindContext.onPeriodChange);
    summaryOpen = true;
    applySummaryOpenState();
    paintSummaryProgressFeedback(
      `${result.message || 'Período cerrado.'} Archivos: ${result.archived ?? '—'}.`,
      'success',
    );
  } catch (error) {
    paintSummaryProgressFeedback(error.message || 'No se pudo cerrar el período.', 'error');
    button.disabled = false;
  }
}

async function handleOpenPeriodFromInformes(button) {
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;

  const periodo = String(
    button.getAttribute('data-periodo') ||
      document.querySelector('#informes-open-period-key')?.value ||
      '',
  ).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    paintOpenPeriodFeedback('No hay un período siguiente válido para abrir.', 'error');
    return;
  }

  button.disabled = true;
  paintOpenPeriodFeedback('Abriendo período…', 'info');

  try {
    const result = await openPeriod(periodo);
    if (!result?.ok) {
      paintOpenPeriodFeedback(
        result?.message || result?.error || 'No se pudo abrir el período.',
        'error',
      );
      button.disabled = false;
      return;
    }

    paintOpenPeriodFeedback(result.message || 'Período abierto correctamente.', 'success');
    if (typeof bindContext.onPeriodChange === 'function') {
      bindContext.onPeriodChange(periodo);
      return;
    }
    await loadReports(periodo, null);
  } catch (error) {
    paintOpenPeriodFeedback(error.message || 'No se pudo abrir el período.', 'error');
    button.disabled = false;
  }
}

function paintOpenPeriodFeedback(message, tone = 'info') {
  const feedback = document.querySelector('#informes-open-period-feedback');
  if (!(feedback instanceof HTMLElement)) return;
  feedback.hidden = false;
  feedback.dataset.tone = tone;
  feedback.textContent = message;
}

function renderOpenPeriodPanel(lastClosedKey) {
  const suggested = suggestedOpenPeriod(lastClosedKey);
  if (!suggested) {
    return `
      <section class="informes-open-period" aria-label="Abrir nuevo período">
        <p class="informes-open-period-title">No hay un período abierto</p>
        <p class="informes-open-period-feedback" data-tone="error" role="status">
          No se pudo determinar el mes siguiente a abrir.
        </p>
      </section>
    `;
  }

  return `
    <section class="informes-open-period" aria-label="Abrir nuevo período">
      <div class="informes-open-period-row">
        <p class="informes-open-period-title">No hay un período abierto</p>
        <input type="hidden" id="informes-open-period-key" value="${escapeHtml(suggested.key)}" />
        <button
          type="button"
          class="button"
          id="informes-open-period"
          data-periodo="${escapeHtml(suggested.key)}"
        >
          Abrir ${escapeHtml(suggested.label)}
        </button>
      </div>
      <p id="informes-open-period-feedback" class="informes-open-period-feedback" hidden role="status"></p>
    </section>
  `;
}

function applySummaryOpenState() {
  const toggle = document.querySelector('#informes-summary-toggle');
  const panel = document.querySelector('#informes-summary-panel');
  if (toggle instanceof HTMLElement) {
    toggle.setAttribute('aria-expanded', summaryOpen ? 'true' : 'false');
    const caret = toggle.querySelector('[data-summary-caret]');
    if (caret) caret.textContent = summaryOpen ? '▴' : '▾';
  }
  if (panel instanceof HTMLElement) {
    panel.hidden = !summaryOpen;
  }
}

function paintPrivilegeSummary(summary) {
  const map = {
    'pub-cantidad': summary.publicadores.cantidad,
    'pub-estudios': summary.publicadores.estudios,
    'aux-cantidad': summary.auxiliares.cantidad,
    'aux-horas': summary.auxiliares.horas,
    'aux-estudios': summary.auxiliares.estudios,
    'reg-cantidad': summary.regulares.cantidad,
    'reg-horas': summary.regulares.horas,
    'reg-estudios': summary.regulares.estudios,
    activos: summary.publicadoresActivos,
  };
  Object.entries(map).forEach(([key, value]) => {
    const el = document.querySelector(`[data-summary="${key}"]`);
    if (el) el.textContent = String(value);
  });
}

function buildSummaryProgress(reports) {
  const total = reports.length;
  const completed = reports.filter((report) => isReportComplete(report)).length;
  const pending = Math.max(total - completed, 0);
  const complete = total > 0 && pending === 0;
  const canClose = complete && Boolean(viewSnapshot?.systemOpen);
  return { total, completed, pending, complete, canClose };
}

function renderSummaryProgress(progress) {
  if (!progress.complete) {
    const label = progress.pending === 1 ? 'informe' : 'informes';
    return `
      <div class="informes-summary-progress is-incomplete" data-summary-progress>
        <p class="informes-summary-progress-text">
          Resumen incompleto, aún faltan completar
          <strong data-summary-pending>${progress.pending}</strong> ${label}.
        </p>
      </div>
    `;
  }

  if (progress.canClose) {
    return `
      <div class="informes-summary-progress is-complete" data-summary-progress>
        <p class="informes-summary-progress-text">
          Resumen completo, luego de enviarlo puede
          <button type="button" id="informes-close-period" class="informes-summary-close">
            Cerrar y archivar
          </button>
          el período.
        </p>
        <p class="informes-summary-progress-feedback" data-summary-progress-feedback hidden role="status"></p>
      </div>
    `;
  }

  return `
    <div class="informes-summary-progress is-complete" data-summary-progress>
      <p class="informes-summary-progress-text">
        Resumen completo. El período ya está cerrado.
      </p>
      <p class="informes-summary-progress-feedback" data-summary-progress-feedback hidden role="status"></p>
    </div>
  `;
}

function paintSummaryProgress(progress) {
  const host = document.querySelector('[data-summary-progress]');
  if (!(host instanceof HTMLElement)) return;
  host.outerHTML = renderSummaryProgress(progress).trim();
}

function paintSummaryProgressFeedback(message, tone = 'info') {
  let feedback = document.querySelector('[data-summary-progress-feedback]');
  const host = document.querySelector('[data-summary-progress]');
  if (!(feedback instanceof HTMLElement) && host instanceof HTMLElement) {
    feedback = document.createElement('p');
    feedback.className = 'informes-summary-progress-feedback';
    feedback.setAttribute('data-summary-progress-feedback', '');
    feedback.setAttribute('role', 'status');
    host.appendChild(feedback);
  }
  if (!(feedback instanceof HTMLElement)) return;
  feedback.hidden = false;
  feedback.dataset.tone = tone;
  feedback.textContent = message;
}

function renderSummaryPanel(summary, { open = false, progress = null } = {}) {
  const progressBlock = progress ? renderSummaryProgress(progress) : '';
  return `
    <section
      id="informes-summary-panel"
      class="informes-summary-panel"
      aria-label="Resumen de privilegios del período"
      ${open ? '' : 'hidden'}
    >
      <div class="informes-summary-activos">
        <span class="informes-summary-activos-label">Todos los publicadores activos</span>
        <strong data-summary="activos">${summary.publicadoresActivos}</strong>
      </div>
      <div class="informes-summary-grid">
        <article class="informes-summary-card is-publicador">
          <h3 class="informes-summary-title">Publicadores</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad de informes</dt><dd data-summary="pub-cantidad">${summary.publicadores.cantidad}</dd></div>
            <div><dt>Cursos biblicos</dt><dd data-summary="pub-estudios">${summary.publicadores.estudios}</dd></div>
          </dl>
        </article>
        <article class="informes-summary-card is-auxiliar">
          <h3 class="informes-summary-title">Precursores auxiliares</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad de informes</dt><dd data-summary="aux-cantidad">${summary.auxiliares.cantidad}</dd></div>
            <div><dt>Horas</dt><dd data-summary="aux-horas">${summary.auxiliares.horas}</dd></div>
            <div><dt>Cursos biblicos</dt><dd data-summary="aux-estudios">${summary.auxiliares.estudios}</dd></div>
          </dl>
        </article>
        <article class="informes-summary-card is-regular">
          <h3 class="informes-summary-title">Precursores regulares</h3>
          <dl class="informes-summary-stats">
            <div><dt>Cantidad de informes</dt><dd data-summary="reg-cantidad">${summary.regulares.cantidad}</dd></div>
            <div><dt>Horas</dt><dd data-summary="reg-horas">${summary.regulares.horas}</dd></div>
            <div><dt>Cursos biblicos</dt><dd data-summary="reg-estudios">${summary.regulares.estudios}</dd></div>
          </dl>
        </article>
      </div>
      ${progressBlock}
    </section>
  `;
}

function setInformesSaveIndicator({ state, message }) {
  const el = document.querySelector('#informes-save-indicator');
  if (!el) return;
  el.hidden = false;
  el.dataset.state = state;
  const text = el.querySelector('.save-indicator-text');
  const retry = el.querySelector('#informes-save-retry');
  if (text) text.textContent = message;
  if (retry) retry.hidden = state !== 'error';
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

  const modeOn = Boolean(state.editMode);
  const canEdit = Boolean(state.canEdit);
  const editControl =
    state.loading || state.error
      ? ''
      : `
      <label class="edit-mode-control ${modeOn ? 'is-on' : 'is-off'} ${canEdit ? '' : 'is-disabled'}" title="${canEdit ? '' : 'Solo disponible con período ABIERTO'}">
        <span class="edit-mode-label">${modeOn ? 'Modo edición' : 'Modo consulta'}</span>
        <span class="edit-mode-switch">
          <input type="checkbox" id="edit-mode-toggle" ${modeOn ? 'checked' : ''} ${canEdit ? '' : 'disabled'} aria-label="Modo edición" />
          <span class="edit-mode-track" aria-hidden="true"></span>
        </span>
      </label>
      ${
        modeOn
          ? `<div id="informes-save-indicator" class="save-indicator" data-state="saved" role="status" aria-live="polite">
              <span class="save-indicator-dot" aria-hidden="true"></span>
              <span class="save-indicator-text">Guardado</span>
              <button type="button" class="save-indicator-retry" id="informes-save-retry" hidden>Reintentar</button>
            </div>`
          : ''
      }
    `;

  const summaryToggle = state.showSummary
    ? `<button
        type="button"
        id="informes-summary-toggle"
        class="informes-summary-toggle"
        aria-expanded="${state.summaryOpen ? 'true' : 'false'}"
        aria-controls="informes-summary-panel"
      >
        Resumen <span data-summary-caret aria-hidden="true">${state.summaryOpen ? '▴' : '▾'}</span>
      </button>`
    : '';

  return `
    <header class="informes-meta">
      <div class="informes-meta-main">
        <p class="informes-meta-title">Informes</p>
        <div class="informes-meta-chips" aria-label="Contexto del período">
          ${periodControl}
          ${estadoChip}
          ${editControl}
        </div>
      </div>
      <div class="informes-meta-actions">
        ${summaryToggle}
        ${state.summaryPanel || ''}
      </div>
    </header>
  `;
}

function renderProgressShell(reports, groupStatuses, { live = false } = {}) {
  const total = reports.length;
  const completed = reports.filter((report) => isReportComplete(report)).length;
  const pending = Math.max(total - completed, 0);
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const monthComplete = isMonthComplete(groupStatuses);

  const groupsLine = groupStatuses
    .map((group) => `${escapeHtml(group.grupo)}: ${group.completed}/${group.total}`)
    .join(' · ');

  const totalAttr = live ? 'data-stat="total"' : '';
  const completeAttr = live ? 'data-stat="complete"' : '';
  const pendingAttr = live ? 'data-stat="pending"' : '';
  const pctAttr = live ? 'data-stat="pct"' : '';
  const fillAttr = live ? 'data-progress-fill' : '';
  const trackAttr = live
    ? 'data-progress-track'
    : '';
  const groupsAttr = live ? 'data-groups-line' : '';

  return `
      <div class="encargados-progress informes-progress" data-complete="${monthComplete ? 'true' : 'false'}" aria-live="polite">
        <div class="informes-progress-row">
          <div class="progress-stats">
            <span class="progress-stat"><strong ${totalAttr}>${total}</strong><span class="progress-stat-label">personas</span></span>
            <span class="progress-stat is-complete-stat"><strong ${completeAttr}>${completed}</strong><span class="progress-stat-label">completas</span></span>
            <span class="progress-stat is-pending-stat"><strong ${pendingAttr}>${pending}</strong><span class="progress-stat-label">pendientes</span></span>
            <span class="progress-stat"><strong ${pctAttr}>${pct}%</strong><span class="progress-stat-label">avance</span></span>
          </div>
          <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso del mes: ${completed} de ${total} completas" ${trackAttr}>
            <i style="width:${pct}%" ${fillAttr}></i>
          </div>
        </div>
        ${groupsLine ? `<p class="informes-groups-line muted" ${groupsAttr}>${groupsLine}</p>` : ''}
      </div>`;
}

function renderReportsBoard(reports, groupStatuses) {
  return `
    <section class="encargados-board informes-board" aria-label="Informes consolidados">
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

function renderEditableBoard(reports, groupStatuses) {
  return `
    <section class="encargados-board informes-board is-edit-mode" aria-label="Informes editables">
      ${renderProgressShell(reports, groupStatuses, { live: true })}
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
            ${reports
              .map((report) => renderEditableRow(seedPersonFromApi(report), { layout: 'admin' }))
              .join('')}
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
  const hoursNoClass = hoursLabel === 'No' ? ' hours-no' : '';
  const studiesLabel = displayStudiesConsulta(report);
  const rawComments = normalizeText(report?.comentarios);
  const hasComment = Boolean(rawComments);
  const commentsLabel = hasComment ? rawComments : '';

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
      <td class="col-hours cell-value" data-label="Horas"><span class="hours-value${hoursNoClass}">${escapeHtml(hoursLabel)}</span></td>
      <td class="col-studies cell-value" data-label="Estudios">${escapeHtml(studiesLabel)}</td>
      <td class="col-comments cell-value${hasComment ? ' has-comment' : ''}" data-label="Comentarios">${escapeHtml(commentsLabel)}</td>
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

/** Modo consulta: null/vacío/0 → celda vacía (sin "—", "Est." ni "0"). */
function displayStudiesConsulta(report) {
  const value = normalizeIntegerField(report?.estudios);
  if (!value || value === '0') return '';
  if (/^\d+$/.test(value)) return value;
  const text = normalizeText(report?.estudios);
  if (!text || text === '0') return '';
  return text;
}

function displayComments(report) {
  const privilegio = normalizeText(report?.privilegio);
  if (!privilegio) return '—';
  return displayText(report?.comentarios);
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
