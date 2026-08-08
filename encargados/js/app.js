/**
 * Portal Encargados — auto-save por persona (savePerson).
 * saveGroup permanece en Apps Script como fallback, no lo usa esta UI.
 *
 * Grupo: ?grupo=1 | ?grupo=2
 * Completitud = indicador visual (docs/07); no condiciona el guardado.
 */

import { getMonthlyReports, getSystemState, postSavePerson } from './sheets.js';
import { isEstadoAbierto, periodKeyToLabel } from './period.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];
const COMPLETENESS_CLASSES = ['is-empty', 'is-editing', 'is-complete'];

/** @type {{ grupo: string, mes: string, periodo: string } | null} */
let sessionContext = null;
let resolvedGrupo = null;

/** @type {Map<string, string>} id → snapshot JSON del último estado guardado */
const lastSavedById = new Map();

/** @type {Map<string, { pending: object | null, running: boolean }>} */
const saveQueues = new Map();

/** @type {{ persona: object, error: string } | null} */
let lastFailedSave = null;

/** Contador de saves en vuelo (para indicador global). */
let activeSaveCount = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

export function resolveGroupParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('grupo') || params.get('group') || '').trim();

  if (!raw) {
    return {
      ok: false,
      reason: 'missing',
      raw: '',
      message: 'Falta el parámetro grupo. Abrí el portal con ?grupo=1 o ?grupo=2.',
    };
  }

  if (raw === '1' || /^grupo\s*1$/i.test(raw) || raw === 'Grupo 1') {
    return { ok: true, grupo: 'Grupo 1' };
  }
  if (raw === '2' || /^grupo\s*2$/i.test(raw) || raw === 'Grupo 2') {
    return { ok: true, grupo: 'Grupo 2' };
  }

  return {
    ok: false,
    reason: 'invalid',
    raw,
    message: `El parámetro grupo "${raw}" no es válido. Usá ?grupo=1 o ?grupo=2.`,
  };
}

function privilegeOptions(selected) {
  const current = selected ?? '';
  return PRIVILEGIOS.map((value) => {
    const label = value || '—';
    const isSelected = value === current ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function privilegeSlug(privilegio) {
  const value = String(privilegio || '').trim();
  if (value === 'Publicador') return 'publicador';
  if (value === 'Auxiliar') return 'auxiliar';
  if (value === 'Regular') return 'regular';
  if (value === 'Inactivo') return 'inactivo';
  return 'none';
}

function normalizeYesNo(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (token === 'si' || token === 's' || token === 'yes' || token === 'true' || token === '1') {
    return 'Sí';
  }
  if (token === 'no' || token === 'n' || token === 'false' || token === '0') return 'No';
  return '';
}

function isPublicadorHours(value) {
  return Boolean(normalizeYesNo(value));
}

function isNumericHours(value) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (normalizeYesNo(text)) return false;
  return /^\d+$/.test(text);
}

/** Completitud docs/07: privilegio + horas válidas. Estudios/comentarios no cuentan. */
function isPersonComplete(privilegio, horas) {
  const privilege = String(privilegio || '').trim();
  if (privilege === 'Inactivo') return true;
  if (privilege === 'Publicador') return isPublicadorHours(horas);
  if (privilege === 'Auxiliar' || privilege === 'Regular') return isNumericHours(horas);
  return false;
}

function hasStarted(privilegio, horas, estudios, comentarios) {
  return Boolean(
    String(privilegio || '').trim() ||
      String(horas || '').trim() ||
      String(estudios || '').trim() ||
      String(comentarios || '').trim(),
  );
}

function isReportFieldsLocked(privilegio) {
  return String(privilegio || '').trim() === '';
}

function isHoursDisabled(privilegio) {
  const value = String(privilegio || '').trim();
  return value === '' || value === 'Inactivo';
}

function personSnapshot(person) {
  return JSON.stringify({
    id: String(person.id || ''),
    privilegio: String(person.privilegio || ''),
    horas: String(person.horas || ''),
    estudios: String(person.estudios || ''),
    comentarios: String(person.comentarios || ''),
  });
}

function hoursControlHtml(privilegio, horas, nombre) {
  const label = `Horas de ${escapeHtml(nombre)}`;

  if (privilegio === 'Publicador') {
    const current = normalizeYesNo(horas);
    const options = [
      { value: '', label: '—' },
      { value: 'Sí', label: 'Sí' },
      { value: 'No', label: 'No' },
    ]
      .map((item) => {
        const selected = item.value === current ? ' selected' : '';
        return `<option value="${escapeHtml(item.value)}"${selected}>${escapeHtml(item.label)}</option>`;
      })
      .join('');
    return `<select class="field-input field-select field-hours field-enabled" aria-label="${label}">${options}</select>`;
  }

  if (privilegio === 'Auxiliar' || privilegio === 'Regular') {
    const safe = String(horas || '').trim();
    const value = /^\d+$/.test(safe) ? safe : '';
    return `<input class="field-input field-hours field-enabled" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(value)}" placeholder="0" aria-label="${label}" />`;
  }

  return `<input class="field-input field-hours field-disabled" type="text" value="" placeholder="—" aria-label="${label}" disabled />`;
}

function renderRow(person) {
  const nombre = person.nombre || '';
  const privilegio = String(person.privilegio || '').trim();
  const slug = privilegeSlug(privilegio);
  const fieldsLocked = isReportFieldsLocked(privilegio);
  const hoursDisabled = isHoursDisabled(privilegio);
  const studiesDisabled = fieldsLocked;
  const commentsDisabled = fieldsLocked;
  const estudiosValue = fieldsLocked ? '' : person.estudios;
  const comentariosValue = fieldsLocked ? '' : person.comentarios;

  return `
    <tr data-id="${escapeHtml(person.id)}" data-privilege="${slug}">
      <td class="col-id" data-label="ID">
        <span class="completeness-dot" aria-hidden="true"></span>
        <span class="id-value muted">${escapeHtml(person.id)}</span>
      </td>
      <td class="col-name person-name" data-label="Nombre" title="${escapeHtml(nombre)}">${escapeHtml(nombre)}</td>
      <td class="col-privilege" data-label="Privilegio">
        <select class="field-input field-select field-privilege field-enabled privilege-${slug}" aria-label="Privilegio de ${escapeHtml(nombre)}">
          ${privilegeOptions(privilegio)}
        </select>
      </td>
      <td class="col-hours" data-label="Horas">
        ${hoursControlHtml(privilegio, person.horas, nombre)}
      </td>
      <td class="col-studies" data-label="Estudios">
        <input class="field-input field-studies ${studiesDisabled ? 'field-disabled' : 'field-enabled'}" type="text" inputmode="numeric" value="${escapeHtml(estudiosValue)}" placeholder="${studiesDisabled ? '—' : 'Est.'}" aria-label="Estudios de ${escapeHtml(nombre)}"${studiesDisabled ? ' disabled' : ''} />
      </td>
      <td class="col-comments" data-label="Comentarios">
        <input class="field-input field-comments ${commentsDisabled ? 'field-disabled' : 'field-enabled'}" type="text" value="${escapeHtml(comentariosValue)}" placeholder="${commentsDisabled ? '—' : '+ Comentario'}" aria-label="Comentarios de ${escapeHtml(nombre)}"${commentsDisabled ? ' disabled' : ''} />
      </td>
    </tr>
  `;
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
            ${people.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function readHoursValue(row) {
  const hoursEl = row.querySelector('.field-hours');
  if (!hoursEl) return '';
  return String(hoursEl.value ?? '').trim();
}

function readRowPerson(row) {
  const privilegio = row.querySelector('.field-privilege')?.value ?? '';
  const hoursDisabled = isHoursDisabled(privilegio);
  const fieldsLocked = isReportFieldsLocked(privilegio);
  return {
    id: row.getAttribute('data-id') || '',
    privilegio,
    horas: hoursDisabled ? '' : readHoursValue(row),
    estudios: fieldsLocked ? '' : row.querySelector('.field-studies')?.value ?? '',
    comentarios: fieldsLocked ? '' : row.querySelector('.field-comments')?.value ?? '',
  };
}

function sanitizeIntegerInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const isHours = input.classList.contains('field-hours');
  const isStudies = input.classList.contains('field-studies');
  if (!isHours && !isStudies) return;

  if (isHours) {
    const row = input.closest('tr');
    const privilegio = row?.querySelector('.field-privilege')?.value ?? '';
    if (privilegio !== 'Auxiliar' && privilegio !== 'Regular') return;
  }

  const cleaned = input.value.replace(/\D/g, '');
  if (cleaned !== input.value) input.value = cleaned;
}

function applyPrivilegeChrome(row) {
  const privilegio = row.querySelector('.field-privilege')?.value ?? '';
  const slug = privilegeSlug(privilegio);
  row.dataset.privilege = slug;
  const select = row.querySelector('.field-privilege');
  if (select) {
    select.className = `field-input field-select field-privilege field-enabled privilege-${slug}`;
  }
}

function setCompletenessState(row) {
  const person = readRowPerson(row);
  COMPLETENESS_CLASSES.forEach((cls) => row.classList.remove(cls));

  let state = 'is-empty';
  if (isPersonComplete(person.privilegio, person.horas)) {
    state = 'is-complete';
  } else if (hasStarted(person.privilegio, person.horas, person.estudios, person.comentarios)) {
    state = 'is-editing';
  }
  row.classList.add(state);
}

function refreshProgressSummary() {
  const rows = Array.from(document.querySelectorAll('.encargados-table tbody tr'));
  const total = rows.length;
  let complete = 0;
  rows.forEach((row) => {
    const person = readRowPerson(row);
    if (isPersonComplete(person.privilegio, person.horas)) complete += 1;
  });
  const pending = Math.max(total - complete, 0);
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);

  const root = document.querySelector('.encargados-progress');
  if (!root) return;

  const totalEl = root.querySelector('[data-stat="total"]');
  const completeEl = root.querySelector('[data-stat="complete"]');
  const pendingEl = root.querySelector('[data-stat="pending"]');
  const fill = root.querySelector('[data-progress-fill]');
  const track = root.querySelector('[data-progress-track]');

  if (totalEl) totalEl.textContent = String(total);
  if (completeEl) completeEl.textContent = String(complete);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (fill instanceof HTMLElement) fill.style.width = `${pct}%`;
  if (track) {
    track.setAttribute('aria-valuenow', String(pct));
    track.setAttribute('aria-label', `Progreso del grupo: ${complete} de ${total} completas`);
  }
  root.dataset.complete = complete === total && total > 0 ? 'true' : 'false';
}

function refreshRowVisuals(row) {
  applyPrivilegeChrome(row);
  setCompletenessState(row);
}

function refreshAllVisuals() {
  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => refreshRowVisuals(row));
  refreshProgressSummary();
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

function syncSaveIndicator() {
  if (lastFailedSave) {
    setSaveIndicator('error', 'Error al guardar');
    return;
  }
  if (activeSaveCount > 0) {
    setSaveIndicator('saving', 'Guardando cambios…');
    return;
  }
  setSaveIndicator('saved', 'Todos los cambios guardados');
}

function applyRowMode(row) {
  const privilegio = row.querySelector('.field-privilege')?.value ?? '';
  const nombre = row.querySelector('.person-name')?.textContent || '';
  const hoursCell = row.querySelector('.col-hours');
  const studies = row.querySelector('.field-studies');
  const comments = row.querySelector('.field-comments');
  if (!hoursCell || !studies || !comments) return;

  const previousHours = readHoursValue(row);
  const fieldsLocked = isReportFieldsLocked(privilegio);
  const hoursDisabled = isHoursDisabled(privilegio);

  hoursCell.innerHTML = hoursControlHtml(
    privilegio,
    hoursDisabled ? '' : previousHours,
    nombre,
  );

  studies.disabled = fieldsLocked;
  comments.disabled = fieldsLocked;
  studies.classList.toggle('field-disabled', fieldsLocked);
  studies.classList.toggle('field-enabled', !fieldsLocked);
  comments.classList.toggle('field-disabled', fieldsLocked);
  comments.classList.toggle('field-enabled', !fieldsLocked);
  studies.placeholder = fieldsLocked ? '—' : 'Est.';
  comments.placeholder = fieldsLocked ? '—' : '+ Comentario';

  if (fieldsLocked) {
    studies.value = '';
    comments.value = '';
  }

  refreshRowVisuals(row);
  refreshProgressSummary();
}

function buildSavePersonPayload(persona) {
  if (!sessionContext) throw new Error('No hay un grupo cargado.');
  return {
    action: 'savePerson',
    mode: 'save',
    grupo: sessionContext.grupo,
    mes: sessionContext.mes,
    periodo: sessionContext.periodo,
    persona: {
      id: String(persona.id || ''),
      privilegio: String(persona.privilegio || ''),
      horas: String(persona.horas || ''),
      estudios: String(persona.estudios || ''),
      comentarios: String(persona.comentarios || ''),
    },
  };
}

async function drainPersonQueue(personId) {
  const queue = saveQueues.get(personId);
  if (!queue || queue.running) return;
  queue.running = true;

  while (queue.pending) {
    const persona = queue.pending;
    queue.pending = null;
    activeSaveCount += 1;
    syncSaveIndicator();

    try {
      const result = await postSavePerson(buildSavePersonPayload(persona));
      const failed =
        !result ||
        result.ok === false ||
        (result.errors && result.errors.length > 0) ||
        result.wroteToSheet === false;

      if (failed) {
        lastFailedSave = {
          persona,
          error: result?.message || result?.error || result?.errors?.[0]?.error || 'Error al guardar',
        };
        activeSaveCount = Math.max(0, activeSaveCount - 1);
        syncSaveIndicator();
        break;
      }

      lastSavedById.set(String(persona.id), personSnapshot(persona));
      if (lastFailedSave && String(lastFailedSave.persona.id) === String(persona.id)) {
        lastFailedSave = null;
      }
    } catch (error) {
      lastFailedSave = {
        persona,
        error: error?.message || 'Error al guardar',
      };
      activeSaveCount = Math.max(0, activeSaveCount - 1);
      syncSaveIndicator();
      break;
    }

    activeSaveCount = Math.max(0, activeSaveCount - 1);
    syncSaveIndicator();
  }

  queue.running = false;
  if (queue.pending) {
    void drainPersonQueue(personId);
  }
}

function enqueuePersonSave(persona, { force = false } = {}) {
  const id = String(persona.id || '');
  if (!id || !sessionContext) return;

  const snap = personSnapshot(persona);
  if (!force && lastSavedById.get(id) === snap) return;

  let queue = saveQueues.get(id);
  if (!queue) {
    queue = { pending: null, running: false };
    saveQueues.set(id, queue);
  }
  queue.pending = { ...persona, id };
  void drainPersonQueue(id);
}

function requestSaveFromRow(row, { force = false } = {}) {
  const persona = readRowPerson(row);
  enqueuePersonSave(persona, { force });
}

function retryLastFailedSave() {
  if (!lastFailedSave?.persona) return;
  const persona = lastFailedSave.persona;
  lastFailedSave = null;
  enqueuePersonSave(persona, { force: true });
}

function bindTableInteractions(root) {
  root.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    const privilege = row.querySelector('.field-privilege');
    privilege?.addEventListener('change', () => {
      applyRowMode(row);
      requestSaveFromRow(row);
    });
  });

  root.addEventListener('input', (event) => {
    sanitizeIntegerInput(event);
    const row = event.target instanceof Element ? event.target.closest('tr') : null;
    if (!row || !root.contains(row)) return;
    if (event.target instanceof Element && event.target.classList.contains('field-privilege')) return;
    refreshRowVisuals(row);
    refreshProgressSummary();
  });

  root.addEventListener(
    'blur',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.classList.contains('field-privilege')) return;
      if (
        !target.classList.contains('field-hours') &&
        !target.classList.contains('field-studies') &&
        !target.classList.contains('field-comments')
      ) {
        return;
      }
      const row = target.closest('tr');
      if (!row || !root.contains(row)) return;
      requestSaveFromRow(row);
    },
    true,
  );

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.classList.contains('field-hours')) return;
    if (target.tagName !== 'SELECT') return;
    const row = target.closest('tr');
    if (!row || !root.contains(row)) return;
    refreshRowVisuals(row);
    refreshProgressSummary();
    requestSaveFromRow(row);
  });
}

function setContext(grupo, mes) {
  const grupoEl = document.querySelector('#context-grupo');
  const mesEl = document.querySelector('#context-mes');
  if (grupoEl) grupoEl.textContent = grupo || '—';
  if (mesEl) mesEl.textContent = mes || '—';
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
      if (resolvedGrupo) void loadGroup(resolvedGrupo);
    });
  }
}

async function loadGroup(grupo) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  sessionContext = null;
  lastSavedById.clear();
  saveQueues.clear();
  lastFailedSave = null;
  activeSaveCount = 0;
  setContext(grupo, '…');
  showStatus('Cargando informes…');
  setSaveIndicator('saving', 'Cargando…');

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

  const group = (data.groups || []).find((item) => item.grupo === grupo);
  if (!group) throw new Error(`No se encontró ${grupo} en la respuesta.`);

  const people = (group.informes || []).filter((person) => person.id && person.nombre);
  const mesLabel = periodKeyToLabel(periodo);
  sessionContext = { grupo: group.grupo, mes: mesLabel, periodo };
  setContext(group.grupo, mesLabel);
  root.innerHTML = renderTable(people);

  people.forEach((person) => {
    lastSavedById.set(
      String(person.id),
      personSnapshot({
        id: person.id,
        privilegio: person.privilegio || '',
        horas: person.horas || '',
        estudios: person.estudios || '',
        comentarios: person.comentarios || '',
      }),
    );
  });

  bindTableInteractions(root);
  refreshAllVisuals();
  setSaveIndicator('saved', 'Todos los cambios guardados');
}

async function init() {
  const resolved = resolveGroupParam();
  if (!resolved.ok) {
    sessionContext = null;
    setContext('—', '—');
    const indicator = document.querySelector('#save-indicator');
    if (indicator) indicator.hidden = true;
    showStatus(resolved.message);
    return;
  }

  resolvedGrupo = resolved.grupo;

  document.querySelector('#save-indicator-retry')?.addEventListener('click', () => {
    retryLastFailedSave();
  });

  try {
    await loadGroup(resolved.grupo);
  } catch (error) {
    sessionContext = null;
    setContext(resolved.grupo, '—');
    setSaveIndicator('error', 'Error al cargar');
    showStatus(error.message || 'No se pudieron cargar los informes.', { retry: true });
  }
}

init();
