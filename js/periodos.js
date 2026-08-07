/**
 * Módulo: Períodos
 * Objetivo: ciclo mensual — apertura y cierre reales vía Apps Script
 * Estado: En desarrollo
 * Sprint: Sprint — Cerrar período (closePeriod)
 *
 * Los informes se cargan a mes vencido: el período sugerido es el mes anterior.
 */

import { getSystemState, openPeriod, closePeriod } from './sheets.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

/** Mes vencido (ej. en agosto sugiere 2026-07). */
function defaultPeriodKey() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
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

function buildPeriodsFromSystem(system, lastResult) {
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
      counts: lastResult?.grupos || null,
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

  let lastResult = null;

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-period-action]');
    if (!button || button.disabled) return;

    const action = button.dataset.periodAction;
    const feedback = root.querySelector('#periodos-feedback');

    if (action === 'close') {
      button.disabled = true;
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.tone = 'info';
        feedback.textContent = 'Cerrando período…';
      }

      try {
        const result = await closePeriod();
        if (!result?.ok) {
          if (feedback) {
            feedback.hidden = false;
            feedback.dataset.tone = 'error';
            feedback.textContent = result?.message || result?.error || 'No se pudo cerrar el período.';
          }
          return;
        }

        lastResult = result;
        await refresh(root, lastResult);
        const feedbackAfter = root.querySelector('#periodos-feedback');
        if (feedbackAfter) {
          feedbackAfter.hidden = false;
          feedbackAfter.dataset.tone = 'success';
          feedbackAfter.textContent = `${result.message} Archivos: ${result.archived ?? '—'}.`;
        }
      } catch (error) {
        if (feedback) {
          feedback.hidden = false;
          feedback.dataset.tone = 'error';
          feedback.textContent = error.message || 'No se pudo cerrar el período.';
        }
      } finally {
        syncButtons(root);
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

      lastResult = result;
      await refresh(root, lastResult);
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
      syncButtons(root);
    }
  });

  refresh(root, lastResult);
}

function syncButtons(root) {
  const openBtn = root.querySelector('[data-period-action="open"]');
  const closeBtn = root.querySelector('[data-period-action="close"]');
  const hasOpen = Boolean(root.querySelector('[data-has-open="true"]'));
  if (openBtn) openBtn.disabled = hasOpen;
  if (closeBtn) closeBtn.disabled = !hasOpen;
}

async function refresh(root, lastResult) {
  root.innerHTML = `<p class="periodos-feedback" data-tone="info" role="status">Sincronizando estado del sistema…</p>`;

  try {
    const system = await getSystemState();
    if (!system?.ok && system?.ok !== true && system?.error) {
      throw new Error(system.message || system.error);
    }
    renderPeriodsScreen(root, system, lastResult);
  } catch (error) {
    root.innerHTML = `
      <p class="periodos-feedback" data-tone="error" role="status">
        ${escapeHtml(error.message || 'No se pudo leer la hoja Sistema.')}
      </p>
      <p class="muted">
        Verificá que Apps Script tenga action=system / openPeriod / closePeriod
        y que exista la hoja Sistema en la planilla.
      </p>
    `;
  }
}

function renderPeriodsScreen(root, system, lastResult) {
  const periods = buildPeriodsFromSystem(system, lastResult);
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
          <span class="muted">${open ? 'Listo para la carga de informes (mes vencido)' : 'No hay un período abierto'}</span>
        </p>
        <p class="periodos-system-meta muted">
          Apertura: ${formatTimestamp(system?.FechaApertura)}
          · Cierre: ${formatTimestamp(system?.FechaCierre)}
          · Versión: ${escapeHtml(system?.Version || '—')}
        </p>
      </div>
      <div class="periodos-actions">
        <label class="periodos-open-field">
          <span>Nuevo período (mes vencido)</span>
          <input
            id="periodos-open-key"
            class="periodos-open-input"
            type="text"
            inputmode="numeric"
            placeholder="YYYY-MM"
            value="${escapeHtml(open ? '' : suggested)}"
            ${open ? 'disabled' : ''}
            aria-label="Clave del período a abrir (YYYY-MM, mes vencido)"
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
        lastResult?.archived != null
          ? `<p class="periodos-note muted">Último cierre: ${escapeHtml(lastResult.archived)} registro(s) en Historial.</p>`
          : lastResult?.grupos
            ? `<p class="periodos-note muted">Última apertura: Grupo 1 = ${escapeHtml(lastResult.grupos['Grupo 1'])}, Grupo 2 = ${escapeHtml(lastResult.grupos['Grupo 2'])}.</p>`
            : ''
      }
      <p class="periodos-note muted">
        Cerrar período archiva Grupo 1/2 en Historial y marca Sistema como CERRADO. No limpia las hojas de trabajo ni abre el siguiente mes.
      </p>
    </section>
  `;
}
