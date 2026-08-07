/**
 * Módulo: Períodos
 * Objetivo: pantalla de administración del ciclo mensual (UI + arquitectura preparada)
 * Estado: En desarrollo
 * Sprint: Sprint Períodos — interfaz de administración (sin acciones en Sheets)
 *
 * Esta etapa no llama a Apps Script ni modifica Google Sheets / Historial.
 */

/** Datos de presentación locales. Sustituir por lectura real en un sprint posterior. */
const DEMO_PERIODS = [
  {
    id: '2026-06',
    label: 'Junio 2026',
    status: 'Cerrado',
    closedAt: '2026-07-01',
  },
  {
    id: '2026-07',
    label: 'Julio 2026',
    status: 'Cerrado',
    closedAt: '2026-08-01',
  },
  {
    id: '2026-08',
    label: 'Agosto 2026',
    status: 'Abierto',
    closedAt: null,
  },
];

/**
 * Punto de extensión: apertura real (Apps Script / Sheets).
 * No ejecuta escritura en esta etapa.
 */
export async function requestOpenPeriod() {
  return {
    ok: false,
    deferred: true,
    message:
      'Abrir período está preparado en la interfaz. La apertura real (regenerar Grupo 1/2 desde Personas) se implementará tras la auditoría. Google Sheets no fue modificado.',
  };
}

/**
 * Punto de extensión: cierre real (copiar a Historial).
 * No ejecuta escritura en esta etapa.
 */
export async function requestClosePeriod() {
  return {
    ok: false,
    deferred: true,
    message:
      'Cerrar período está preparado en la interfaz. El cierre real (copiar a Historial) se implementará tras la auditoría. Google Sheets no fue modificado.',
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function formatClosedAt(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(
    new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date),
  );
}

function getActivePeriod(periods) {
  return periods.find((item) => item.status === 'Abierto') || null;
}

function statusBadge(status) {
  const tone = status === 'Abierto' ? 'is-open' : 'is-closed';
  return `<span class="periodos-badge ${tone}">${escapeHtml(status)}</span>`;
}

export function periodsView() {
  return `<div class="periodos-view" id="periodos-view"></div>`;
}

export function bindPeriods() {
  const root = document.querySelector('#periodos-view');
  if (!root) return;

  renderPeriodsScreen(root, DEMO_PERIODS);

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-period-action]');
    if (!button || button.disabled) return;

    const action = button.dataset.periodAction;
    const feedback = root.querySelector('#periodos-feedback');
    button.disabled = true;

    try {
      const result = action === 'open' ? await requestOpenPeriod() : await requestClosePeriod();
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.tone = result.deferred ? 'info' : result.ok ? 'success' : 'error';
        feedback.textContent = result.message;
      }
    } catch (error) {
      if (feedback) {
        feedback.hidden = false;
        feedback.dataset.tone = 'error';
        feedback.textContent = error.message || 'No se pudo completar la acción.';
      }
    } finally {
      syncActionButtons(root, DEMO_PERIODS);
    }
  });
}

function renderPeriodsScreen(root, periods) {
  const active = getActivePeriod(periods);
  const hasOpen = Boolean(active);

  root.innerHTML = `
    <section class="periodos-hero" aria-label="Período activo">
      <div>
        <p class="periodos-kicker">Período activo</p>
        <h2 class="periodos-active-label">${escapeHtml(active?.label || 'Ninguno')}</h2>
        <p class="periodos-active-meta">
          ${active ? statusBadge(active.status) : statusBadge('Cerrado')}
          <span class="muted">${hasOpen ? 'Listo para la carga de informes' : 'No hay un período abierto'}</span>
        </p>
      </div>
      <div class="periodos-actions">
        <button type="button" class="button" data-period-action="open" ${hasOpen ? 'disabled' : ''}>
          Abrir nuevo período
        </button>
        <button type="button" class="button button-secondary" data-period-action="close" ${hasOpen ? '' : 'disabled'}>
          Cerrar período
        </button>
      </div>
    </section>

    <p id="periodos-feedback" class="periodos-feedback" role="status" hidden></p>

    <section class="panel card periodos-list-panel" aria-label="Listado de períodos">
      <div class="panel-head">
        <h2>Períodos</h2>
        <span class="muted">${periods.length} registrados</span>
      </div>
      <div class="table-wrap">
        <table class="data-table periodos-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Estado</th>
              <th>Activo</th>
              <th>Cierre</th>
            </tr>
          </thead>
          <tbody>
            ${periods
              .map((item) => {
                const isActive = item.status === 'Abierto';
                return `
                  <tr class="${isActive ? 'is-active-period' : ''}">
                    <td class="periodos-name">${escapeHtml(item.label)}</td>
                    <td>${statusBadge(item.status)}</td>
                    <td>${isActive ? 'Sí' : 'No'}</td>
                    <td>${formatClosedAt(item.closedAt)}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="periodos-note muted">
        Vista de administración. Las acciones aún no modifican Google Sheets, Historial ni las hojas de grupo.
      </p>
    </section>
  `;
}

function syncActionButtons(root, periods) {
  const hasOpen = Boolean(getActivePeriod(periods));
  const openBtn = root.querySelector('[data-period-action="open"]');
  const closeBtn = root.querySelector('[data-period-action="close"]');
  if (openBtn) openBtn.disabled = hasOpen;
  if (closeBtn) closeBtn.disabled = !hasOpen;
}
