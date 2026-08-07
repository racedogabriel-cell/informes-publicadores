/**
 * Módulo: Períodos
 * Objetivo: administrar el ciclo mensual; apertura real vía action=openPeriod
 * Estado: En desarrollo
 * Sprint: Sprint — Motor de Períodos (apertura; sin cierre)
 */

import { getSystemState, openPeriod } from './sheets.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function defaultPeriodKey() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function labelFromPeriodKey(key) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key || '')) return key || '—';
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
    .format(date)
    .replace(/^./, (char) => char.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(
    new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  );
}

function isOpenEstado(estado) {
  return String(estado || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') === 'ABIERTO';
}

function statusBadge(status) {
  const open = status === 'Abierto' || status === 'ABIERTO';
  const tone = open ? 'is-open' : 'is-closed';
  const label = open ? 'Abierto' : 'Cerrado';
  return `<span class="periodos-badge ${tone}">${label}</span>`;
}

function buildPeriodsFromSystem(system, lastOpenResult) {
  const periods = [];
  const activo = system?.PeriodoActivo || '';
  const open = isOpenEstado(system?.EstadoPeriodo);

  if (activo) {
    periods.push({
      id: activo,
      label: labelFromPeriodKey(activo),
      status: open ? 'Abierto' : 'Cerrado',
      closedAt: open ? null : system?.FechaCierre || null,
      openedAt: system?.FechaApertura || null,
      counts: lastOpenResult?.grupos || null,
    });
  }

  return periods;
}

export function periodsView() {
  return `<div class="periodos-view" id="periodos-view"></div>`;
}

export function bindPeriods() {
  const root = document.querySelector('#periodos-view');
  if (!root) return;

  let lastOpenResult = null;

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-period-action]');
    if (!button || button.disabled) return;

    const action = button.dataset.periodAction;
    const feedback = root.querySelector('#periodos-feedback');

    if (action === 'close') {
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.tone = 'info';
        feedback.textContent =
          'El cierre de período se implementará en el próximo sprint. Google Sheets no fue modificado.';
      }
      return;
    }

    if (action !== 'open') return;

    const input = root.querySelector('#periodos-open-key');
    const periodo = (input?.value || '').trim();
    button.disabled = true;
    if (feedback) {
      feedback.hidden = false;
      feedback.dataset.tone = 'info';
      feedback.textContent = 'Abriendo período…';
    }

    try {
      const result = await openPeriod(periodo);
      if (!result?.ok) {
        if (feedback) {
          feedback.hidden = false;
          feedback.dataset.tone = 'error';
          feedback.textContent = result?.message || result?.error || 'No se pudo abrir el período.';
        }
        return;
      }

      lastOpenResult = result;
      await refresh(root, lastOpenResult);
      const feedbackAfter = root.querySelector('#periodos-feedback');
      if (feedbackAfter) {
        feedbackAfter.hidden = false;
        feedbackAfter.dataset.tone = 'success';
        const g1 = result.grupos?.['Grupo 1'] ?? '—';
        const g2 = result.grupos?.['Grupo 2'] ?? '—';
        feedbackAfter.textContent = `${result.message} Grupo 1: ${g1} · Grupo 2: ${g2}.`;
      }
    } catch (error) {
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.tone = 'error';
        feedback.textContent = error.message || 'No se pudo abrir el período.';
      }
    } finally {
      const openBtn = root.querySelector('[data-period-action="open"]');
      const closeBtn = root.querySelector('[data-period-action="close"]');
      const hasOpen = Boolean(root.querySelector('[data-has-open="true"]'));
      if (openBtn) openBtn.disabled = hasOpen;
      if (closeBtn) closeBtn.disabled = !hasOpen;
    }
  });

  refresh(root, lastOpenResult);
}

async function refresh(root, lastOpenResult) {
  root.innerHTML = `<p class="periodos-feedback" data-tone="info" role="status">Sincronizando estado del sistema…</p>`;

  try {
    const system = await getSystemState();
    if (!system?.ok && system?.ok !== true && system?.error) {
      throw new Error(system.message || system.error);
    }
    renderPeriodsScreen(root, system, lastOpenResult);
  } catch (error) {
    root.innerHTML = `
      <p class="periodos-feedback" data-tone="error" role="status">
        ${escapeHtml(error.message || 'No se pudo leer la hoja Sistema.')}
      </p>
      <p class="muted">
        Verificá que Apps Script tenga la versión con action=system / action=openPeriod
        y que exista la hoja Sistema en la planilla.
      </p>
    `;
  }
}

function renderPeriodsScreen(root, system, lastOpenResult) {
  const periods = buildPeriodsFromSystem(system, lastOpenResult);
  const open = isOpenEstado(system?.EstadoPeriodo);
  const activeKey = system?.PeriodoActivo || '';
  const activeLabel = activeKey ? labelFromPeriodKey(activeKey) : 'Ninguno';
  const suggested = defaultPeriodKey();

  root.innerHTML = `
    <section class="periodos-hero" aria-label="Período activo" data-has-open="${open ? 'true' : 'false'}">
      <div>
        <p class="periodos-kicker">Período activo</p>
        <h2 class="periodos-active-label">${escapeHtml(activeLabel)}</h2>
        <p class="periodos-active-meta">
          ${statusBadge(open ? 'Abierto' : 'Cerrado')}
          <span class="muted">${open ? 'Listo para la carga de informes' : 'No hay un período abierto'}</span>
        </p>
        <p class="periodos-system-meta muted">
          Apertura: ${formatTimestamp(system?.FechaApertura)}
          · Cierre: ${formatTimestamp(system?.FechaCierre)}
          · Versión: ${escapeHtml(system?.Version || '—')}
        </p>
      </div>
      <div class="periodos-actions">
        <label class="periodos-open-field">
          <span>Nuevo período</span>
          <input
            id="periodos-open-key"
            class="periodos-open-input"
            type="text"
            inputmode="numeric"
            placeholder="YYYY-MM"
            value="${escapeHtml(open ? '' : suggested)}"
            ${open ? 'disabled' : ''}
            aria-label="Clave del período a abrir (YYYY-MM)"
          />
        </label>
        <button type="button" class="button" data-period-action="open" ${open ? 'disabled' : ''}>
          Abrir nuevo período
        </button>
        <button type="button" class="button button-secondary" data-period-action="close" ${open ? '' : 'disabled'}>
          Cerrar período
        </button>
      </div>
    </section>

    <p id="periodos-feedback" class="periodos-feedback" role="status" hidden></p>

    <section class="panel card periodos-list-panel" aria-label="Listado de períodos">
      <div class="panel-head">
        <h2>Períodos</h2>
        <span class="muted">${periods.length ? periods.length + ' en Sistema' : 'Sin período registrado'}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table periodos-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Estado</th>
              <th>Activo</th>
              <th>Apertura</th>
              <th>Cierre</th>
            </tr>
          </thead>
          <tbody>
            ${
              periods.length
                ? periods
                    .map((item) => {
                      const isActive = item.status === 'Abierto';
                      return `
                        <tr class="${isActive ? 'is-active-period' : ''}">
                          <td class="periodos-name">${escapeHtml(item.label)} <span class="muted">(${escapeHtml(item.id)})</span></td>
                          <td>${statusBadge(item.status)}</td>
                          <td>${isActive ? 'Sí' : 'No'}</td>
                          <td>${formatTimestamp(item.openedAt)}</td>
                          <td>${formatTimestamp(item.closedAt)}</td>
                        </tr>
                      `;
                    })
                    .join('')
                : `<tr><td colspan="5" class="muted">Todavía no hay un período en la hoja Sistema.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      ${
        lastOpenResult?.grupos
          ? `<p class="periodos-note muted">Última apertura: Grupo 1 = ${escapeHtml(lastOpenResult.grupos['Grupo 1'])}, Grupo 2 = ${escapeHtml(lastOpenResult.grupos['Grupo 2'])}.</p>`
          : ''
      }
      <p class="periodos-note muted">
        La apertura regenera Grupo 1/2 desde Personas y actualiza Sistema. El cierre aún no está implementado.
      </p>
    </section>
  `;
}
