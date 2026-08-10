/**
 * Módulo: Períodos
 * Objetivo: ciclo mensual — apertura y cierre vía Apps Script
 * Estado: En desarrollo
 * Sprint: Estabilización 1 — confirmación de cierre + reintentos
 *
 * Los informes se cargan a mes vencido: el período sugerido es el mes anterior.
 */

import { getSystemState, openPeriod, closePeriod } from './sheets.js';
import { isEstadoAbierto, periodKeyToLabel } from './period.js';

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
  return periodKeyToLabel(key);
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

/** Conteo dinámico desde gruposList (preferido) o mapa grupos. */
function formatGruposCountsLine(result) {
  if (Array.isArray(result?.gruposList) && result.gruposList.length) {
    return result.gruposList
      .map((g) => `${g.nombre || g.sheetKey || g.id}: ${g.count ?? '—'}`)
      .join(' · ');
  }
  if (result?.grupos && typeof result.grupos === 'object') {
    return Object.entries(result.grupos)
      .map(([name, count]) => `${name}: ${count}`)
      .join(' · ');
  }
  return '';
}

function isOpenEstado(estado) {
  return isEstadoAbierto(estado);
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
    if (event.target.id === 'retry-periods') {
      await refresh(root, lastResult);
      return;
    }

    const button = event.target.closest('[data-period-action]');
    if (!button || button.disabled) return;

    const action = button.dataset.periodAction;
    const feedback = root.querySelector('#periodos-feedback');

    if (action === 'close') {
      const activeLabel =
        root.querySelector('.periodos-active-label')?.textContent?.trim() || 'el período actual';
      const confirmed = window.confirm(
        `¿Cerrar ${activeLabel}?\n\nSe copiarán los informes a Historial y Sistema pasará a CERRADO.\nLas hojas de grupo del período no se limpian.\nEsta acción no se puede deshacer desde la app.`,
      );
      if (!confirmed) return;

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
        const countsLine = formatGruposCountsLine(result);
        feedbackAfter.textContent = countsLine
          ? `${result.message} ${countsLine}.`
          : String(result.message || 'Período abierto correctamente.');
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
      <p><button type="button" class="button" id="retry-periods">Reintentar</button></p>
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
      <div class="periodos-hero-main">
        <p class="periodos-kicker">Período activo</p>
        <div class="periodos-active-row">
          <h2 class="periodos-active-label">${escapeHtml(activeLabel)}</h2>
          ${statusBadge(open ? 'Abierto' : 'Cerrado')}
          <span class="periodos-active-hint muted">${open ? 'Listo para la carga de informes (mes vencido)' : 'No hay un período abierto'}</span>
        </div>
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
        <button type="button" class="button periodos-action-btn" data-period-action="open" ${open ? 'disabled' : ''}>
          Abrir nuevo período
        </button>
        <button type="button" class="button button-secondary periodos-action-btn" data-period-action="close" ${open ? '' : 'disabled'}>
          Cerrar período
        </button>
      </div>
    </section>

    <p id="periodos-feedback" class="periodos-feedback" role="status" hidden></p>

    <section class="panel card periodos-list-panel" aria-label="Listado de períodos">
      <div class="panel-head periodos-panel-head">
        <h2>Períodos</h2>
        <span class="muted">${periods.length ? periods.length + ' en Sistema' : 'Sin período registrado'}</span>
      </div>
      <div class="encargados-table-scroll periodos-table-scroll">
        <table class="encargados-table periodos-table">
          <thead>
            <tr>
              <th class="col-name">Período</th>
              <th class="col-status">Estado</th>
              <th class="col-activo">Activo</th>
              <th class="col-apertura">Apertura</th>
              <th class="col-cierre">Cierre</th>
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
                          <td class="col-name periodos-name" data-label="Período">${escapeHtml(item.label)} <span class="muted">(${escapeHtml(item.id)})</span></td>
                          <td class="col-status" data-label="Estado">${statusBadge(item.status)}</td>
                          <td class="col-activo" data-label="Activo">${isActive ? 'Sí' : 'No'}</td>
                          <td class="col-apertura" data-label="Apertura">${formatTimestamp(item.openedAt)}</td>
                          <td class="col-cierre" data-label="Cierre">${formatTimestamp(item.closedAt)}</td>
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
          : (() => {
              const countsLine = formatGruposCountsLine(lastResult);
              return countsLine
                ? `<p class="periodos-note muted">Última apertura: ${escapeHtml(countsLine)}.</p>`
                : '';
            })()
      }
      <p class="periodos-note muted">
        Cerrar período archiva las hojas de grupo en Historial y marca Sistema como CERRADO. No limpia las hojas de trabajo ni abre el siguiente mes.
      </p>
    </section>
  `;
}
