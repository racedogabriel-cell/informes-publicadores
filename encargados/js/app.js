/**
 * Portal Encargados — auto-save por persona (savePerson).
 * Reutiliza js/reports-editor.js (misma lógica que Admin en modo edición).
 *
 * Grupo (Fase 8): ?grupoId=1 (preferido) | legacy ?grupo=1 | ?grupo=Grupo%201
 */

import { getMonthlyReports, getSystemState } from './sheets.js';
import { isEstadoAbierto, periodKeyToLabel } from './period.js';
import {
  createReportsEditor,
  renderEditableRow,
  seedPersonFromApi,
} from '../../js/reports-editor.js';

/** @type {{ grupoId: string, grupo: string, color: string, mes: string, periodo: string } | null} */
let sessionContext = null;
/** @type {{ grupoId: string } | null} */
let resolvedGrupo = null;
/** @type {ReturnType<typeof createReportsEditor> | null} */
let activeEditor = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function normalizeGrupoIdCandidate(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;
  const match = value.match(/^grupo\s*(\d+)$/i);
  if (match) return match[1];
  return null;
}

/**
 * Preferido: ?grupoId=1
 * Legacy: ?grupo=1 | ?grupo=Grupo 1 | ?group=…
 */
export function resolveGroupParam() {
  const params = new URLSearchParams(window.location.search);
  const rawId = (params.get('grupoId') || params.get('groupId') || '').trim();
  const raw = (params.get('grupo') || params.get('group') || '').trim();

  if (rawId) {
    const grupoId = normalizeGrupoIdCandidate(rawId);
    if (!grupoId) {
      return {
        ok: false,
        reason: 'invalid',
        raw: rawId,
        message: `El parámetro grupoId "${rawId}" no es válido. Usá un ID numérico (ej. ?grupoId=1).`,
      };
    }
    return { ok: true, grupoId };
  }

  if (!raw) {
    return {
      ok: false,
      reason: 'missing',
      raw: '',
      message: 'Falta el parámetro de grupo. Abrí el portal con ?grupoId=1 (o legacy ?grupo=1).',
    };
  }

  const grupoId = normalizeGrupoIdCandidate(raw);
  if (!grupoId) {
    return {
      ok: false,
      reason: 'invalid',
      raw,
      message: `El parámetro grupo "${raw}" no es válido. Usá ?grupoId=1 o ?grupo=1.`,
    };
  }

  return { ok: true, grupoId };
}

function renderTable(people) {
  return `
    <section class="encargados-board" aria-label="Informes del grupo">
      <div class="encargados-progress" aria-live="polite">
        <div class="progress-stats">
          <span class="progress-stat"><strong data-stat="total">0</strong><span class="progress-stat-label">personas</span></span>
          <span class="progress-stat is-complete-stat"><strong data-stat="complete">0</strong><span class="progress-stat-label">completas</span></span>
          <span class="progress-stat is-pending-stat"><strong data-stat="pending">0</strong><span class="progress-stat-label">pendientes</span></span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progress-track>
          <i data-progress-fill></i>
        </div>
      </div>
      <div class="encargados-table-scroll">
        <table class="encargados-table">
          <thead>
            <tr>
              <th class="col-id">ID</th>
              <th class="col-name">Nombre</th>
              <th class="col-privilege">Privilegio</th>
              <th class="col-hours">Horas</th>
              <th class="col-studies">Est.</th>
              <th class="col-comments">Comentarios</th>
            </tr>
          </thead>
          <tbody>
            ${people.map((person) => renderEditableRow(person, { layout: 'encargados' })).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function setSaveIndicator(state, message) {
  const el = document.querySelector('#save-indicator');
  if (!el) return;
  el.hidden = false;
  el.dataset.state = state;
  const text = el.querySelector('.save-indicator-text');
  const retry = el.querySelector('.save-indicator-retry');
  if (text) text.textContent = message;
  if (retry) retry.hidden = state !== 'error';
}

function setContext(grupoNombre, mes, color) {
  const grupoEl = document.querySelector('#context-grupo');
  const mesEl = document.querySelector('#context-mes');
  const chip = document.querySelector('#context-grupo-chip');
  if (grupoEl) grupoEl.textContent = grupoNombre || '—';
  if (mesEl) mesEl.textContent = mes || '—';
  if (chip instanceof HTMLElement) {
    const hex = String(color || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      chip.style.setProperty('--grupo-color', hex);
      chip.dataset.hasColor = 'true';
    } else {
      chip.style.removeProperty('--grupo-color');
      delete chip.dataset.hasColor;
    }
  }
}

function showStatus(message, { retry = false } = {}) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;
  root.innerHTML = `
    <p class="encargados-status" role="status">${escapeHtml(message)}</p>
    ${retry ? '<p><button type="button" class="button" id="retry-load-group">Reintentar</button></p>' : ''}
  `;
  if (retry) {
    document.querySelector('#retry-load-group')?.addEventListener('click', () => {
      if (resolvedGrupo?.grupoId) void loadGroup(resolvedGrupo.grupoId);
    });
  }
}

function findGroupInReports(groups, grupoId) {
  const id = String(grupoId || '').trim();
  return (groups || []).find((item) => String(item.grupoId || '').trim() === id) || null;
}

async function loadGroup(grupoId) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  activeEditor?.destroy();
  activeEditor = null;
  sessionContext = null;
  setContext('…', '…', '');
  showStatus('Cargando informes…');
  setSaveIndicator('saving', 'Cargando...');

  const [system, data] = await Promise.all([getSystemState(), getMonthlyReports()]);
  if (!data) throw new Error('El conector de Apps Script no está configurado.');
  if (data.error) throw new Error(String(data.error));
  if (system?.error) throw new Error(String(system.error || system.message));

  const periodo = String(system?.PeriodoActivo || '').trim();
  if (!periodo) {
    throw new Error('Sistema no tiene PeriodoActivo. Abrí un período desde el Portal General.');
  }
  if (!isEstadoAbierto(system?.EstadoPeriodo)) {
    throw new Error(
      `No hay un período ABIERTO en Sistema (PeriodoActivo=${periodo}). No se puede editar.`,
    );
  }

  const group = findGroupInReports(data.groups, grupoId);
  if (!group) {
    throw new Error(
      `No se encontró el grupo ID ${grupoId} en el período abierto (¿existe y está activo?).`,
    );
  }

  const grupoNombre = String(group.grupo || `Grupo ${grupoId}`);
  const color = String(group.color || '');
  const people = (group.informes || [])
    .filter((person) => person.id && person.nombre)
    .map((person) =>
      seedPersonFromApi({
        ...person,
        grupo: grupoNombre,
        grupoId: String(group.grupoId || grupoId),
      }),
    );
  const mesLabel = periodKeyToLabel(periodo);
  sessionContext = {
    grupoId: String(group.grupoId || grupoId),
    grupo: grupoNombre,
    color,
    mes: mesLabel,
    periodo,
  };
  setContext(grupoNombre, mesLabel, color);
  root.innerHTML = renderTable(people);

  activeEditor = createReportsEditor({
    root,
    getSaveContext: () => {
      if (!sessionContext) throw new Error('No hay un grupo cargado.');
      return sessionContext;
    },
    onSaveStateChange: ({ state, message }) => setSaveIndicator(state, message),
  });
  activeEditor.seedLastSaved(people);
  activeEditor.bind();
  setSaveIndicator('saved', 'Guardado');
}

async function init() {
  const resolved = resolveGroupParam();
  if (!resolved.ok) {
    sessionContext = null;
    setContext('—', '—', '');
    const indicator = document.querySelector('#save-indicator');
    if (indicator) indicator.hidden = true;
    showStatus(resolved.message);
    return;
  }

  resolvedGrupo = { grupoId: resolved.grupoId };

  document.querySelector('#save-indicator-retry')?.addEventListener('click', () => {
    activeEditor?.retryLastFailedSave();
  });

  try {
    await loadGroup(resolved.grupoId);
  } catch (error) {
    sessionContext = null;
    activeEditor?.destroy();
    activeEditor = null;
    setContext(`ID ${resolved.grupoId}`, '—', '');
    setSaveIndicator('error', 'Error al cargar');
    showStatus(error.message || 'No se pudieron cargar los informes.', { retry: true });
  }
}

void init();
