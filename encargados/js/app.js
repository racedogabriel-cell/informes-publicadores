/**
 * Portal Encargados — lectura GET + guardado real POST (saveGroup).
 * Sprint UX: progreso del grupo, estados de fila, campos disabled/enabled,
 * tintes suaves por privilegio (selector + indicador).
 *
 * Grupo: ?grupo=1 | ?grupo=2
 * Horas: Publicador Sí/No; Auxiliar/Regular numérico; vacío/Inactivo bloquea campos.
 */

import { getMonthlyReports, getSystemState, postSaveGroup } from './sheets.js';
import { isEstadoAbierto, periodKeyToLabel } from './period.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];
const ROW_STATE_CLASSES = [
  'is-empty',
  'is-editing',
  'is-complete',
  'is-error',
  'is-saved',
  'is-row-locked',
];

/** @type {{ grupo: string, mes: string, periodo: string } | null} */
let sessionContext = null;
let resolvedGrupo = null;
/** @type {WeakMap<HTMLElement, ReturnType<typeof setTimeout>>} */
const savedTimers = new WeakMap();

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
  const normalized = text.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return false;
  return Number.isFinite(Number(normalized));
}

/** Misma regla de completitud que Informes (docs/07–08): no cambia negocio. */
function isPersonComplete(privilegio, horas) {
  const privilege = String(privilegio || '').trim();
  if (privilege === 'Inactivo') return true;
  if (privilege === 'Publicador') return isPublicadorHours(horas);
  if (privilege === 'Auxiliar' || privilege === 'Regular') return isNumericHours(horas);
  return false;
}

function isRowLocked(privilegio) {
  return privilegio === '' || privilegio === 'Inactivo';
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
    const value = /^-?\d+([.,]\d+)?$/.test(safe) ? safe : '';
    return `<input class="field-input field-hours field-enabled" type="text" inputmode="decimal" value="${escapeHtml(value)}" placeholder="0" aria-label="${label}" />`;
  }

  return `<input class="field-input field-hours field-disabled" type="text" value="" placeholder="—" aria-label="${label}" disabled />`;
}

function renderRow(person) {
  const nombre = person.nombre || '';
  const privilegio = String(person.privilegio || '').trim();
  const locked = isRowLocked(privilegio);
  const slug = privilegeSlug(privilegio);
  const disabledAttr = locked ? ' disabled' : '';
  const fieldState = locked ? 'field-disabled' : 'field-enabled';
  const estudiosValue = privilegio === '' ? '' : person.estudios;
  const comentariosValue = privilegio === '' ? '' : person.comentarios;
  return `
    <tr data-id="${escapeHtml(person.id)}" data-privilege="${slug}">
      <td class="col-id">
        <span class="privilege-dot" data-privilege="${slug}" aria-hidden="true"></span>
        <span class="id-value muted">${escapeHtml(person.id)}</span>
      </td>
      <td class="col-name person-name" title="${escapeHtml(nombre)}">${escapeHtml(nombre)}</td>
      <td class="col-privilege">
        <select class="field-input field-select field-privilege field-enabled privilege-${slug}" aria-label="Privilegio de ${escapeHtml(nombre)}">
          ${privilegeOptions(privilegio)}
        </select>
      </td>
      <td class="col-hours">
        ${hoursControlHtml(privilegio, person.horas, nombre)}
      </td>
      <td class="col-studies">
        <input class="field-input field-studies ${fieldState}" type="text" inputmode="numeric" value="${escapeHtml(estudiosValue)}" placeholder="${locked ? '—' : ''}" aria-label="Estudios de ${escapeHtml(nombre)}"${disabledAttr} />
      </td>
      <td class="col-comments">
        <input class="field-input field-comments ${fieldState}" type="text" value="${escapeHtml(comentariosValue)}" placeholder="${locked ? 'Elegí privilegio' : ''}" aria-label="Comentarios de ${escapeHtml(nombre)}"${disabledAttr} />
      </td>
    </tr>
  `;
}

function renderTable(people) {
  return `
    <section class="encargados-board" aria-label="Informes del grupo">
      <div class="encargados-progress" aria-live="polite">
        <div class="progress-stats">
          <span class="progress-stat"><strong data-stat="total">0</strong> personas</span>
          <span class="progress-stat is-complete-stat"><strong data-stat="complete">0</strong> completas</span>
          <span class="progress-stat is-pending-stat"><strong data-stat="pending">0</strong> pendientes</span>
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
  return {
    id: row.getAttribute('data-id') || '',
    privilegio,
    horas: isRowLocked(privilegio) ? '' : readHoursValue(row),
    estudios: privilegio === '' ? '' : row.querySelector('.field-studies')?.value ?? '',
    comentarios: privilegio === '' ? '' : row.querySelector('.field-comments')?.value ?? '',
  };
}

function sanitizeNumericHoursInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.classList.contains('field-hours')) return;
  const row = input.closest('tr');
  const privilegio = row?.querySelector('.field-privilege')?.value ?? '';
  if (privilegio !== 'Auxiliar' && privilegio !== 'Regular') return;

  const cleaned = input.value.replace(/[^\d.,]/g, '');
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

  const dot = row.querySelector('.privilege-dot');
  if (dot) dot.dataset.privilege = slug;
}

function clearTransientSaved(row) {
  const timer = savedTimers.get(row);
  if (timer) {
    clearTimeout(timer);
    savedTimers.delete(row);
  }
  row.classList.remove('is-saved');
}

function setRowVisualState(row, state) {
  ROW_STATE_CLASSES.forEach((cls) => row.classList.remove(cls));
  if (state) row.classList.add(state);
  if (state === 'is-empty' || state === 'is-complete') {
    const privilegio = row.querySelector('.field-privilege')?.value ?? '';
    if (isRowLocked(privilegio)) row.classList.add('is-row-locked');
  }
}

function classifyRowState(row) {
  if (row.classList.contains('is-error')) return 'is-error';
  if (row.classList.contains('is-saved')) return 'is-saved';

  const person = readRowPerson(row);
  if (!person.privilegio) return 'is-empty';
  if (isPersonComplete(person.privilegio, person.horas)) return 'is-complete';
  return 'is-editing';
}

function refreshRowState(row, { keepError = true } = {}) {
  applyPrivilegeChrome(row);

  if (!keepError) row.classList.remove('is-error');

  const hadSaved = row.classList.contains('is-saved');
  const state = classifyRowState(row);
  setRowVisualState(row, state);
  if (hadSaved && state === 'is-complete') {
    row.classList.add('is-saved');
  }
}

function refreshAllRowStates({ keepError = true } = {}) {
  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    refreshRowState(row, { keepError });
  });
  refreshProgressSummary();
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

function markRowsSaved(ids) {
  const idSet = new Set((ids || []).map(String));
  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    const id = row.getAttribute('data-id') || '';
    if (idSet.size && !idSet.has(id)) return;
    clearTransientSaved(row);
    row.classList.remove('is-error');
    refreshRowState(row, { keepError: false });
    if (!row.classList.contains('is-complete') && !row.classList.contains('is-empty')) {
      // Guardado parcial de fila aún pendiente: no marcar saved.
      return;
    }
    row.classList.add('is-saved');
    const timer = setTimeout(() => {
      row.classList.remove('is-saved');
      savedTimers.delete(row);
      refreshRowState(row, { keepError: false });
    }, 1800);
    savedTimers.set(row, timer);
  });
  refreshProgressSummary();
}

function applyRowMode(row) {
  const privilegio = row.querySelector('.field-privilege')?.value ?? '';
  const nombre = row.querySelector('.person-name')?.textContent || '';
  const hoursCell = row.querySelector('.col-hours');
  const studies = row.querySelector('.field-studies');
  const comments = row.querySelector('.field-comments');
  if (!hoursCell || !studies || !comments) return;

  const previousHours = readHoursValue(row);
  const locked = isRowLocked(privilegio);

  hoursCell.innerHTML = hoursControlHtml(privilegio, locked ? '' : previousHours, nombre);
  studies.disabled = locked;
  comments.disabled = locked;
  studies.classList.toggle('field-disabled', locked);
  studies.classList.toggle('field-enabled', !locked);
  comments.classList.toggle('field-disabled', locked);
  comments.classList.toggle('field-enabled', !locked);
  studies.placeholder = locked ? '—' : '';
  comments.placeholder = locked ? 'Elegí privilegio' : '';

  if (privilegio === '') {
    studies.value = '';
    comments.value = '';
  }

  row.classList.remove('is-error');
  clearTransientSaved(row);
  refreshRowState(row, { keepError: false });
  refreshProgressSummary();
}

function bindTableInteractions(root) {
  root.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    const privilege = row.querySelector('.field-privilege');
    privilege?.addEventListener('change', () => applyRowMode(row));
  });

  root.addEventListener('input', (event) => {
    sanitizeNumericHoursInput(event);
    const row = event.target instanceof Element ? event.target.closest('tr') : null;
    if (!row || !root.contains(row)) return;
    if (event.target instanceof Element && event.target.classList.contains('field-privilege')) return;
    row.classList.remove('is-error');
    clearTransientSaved(row);
    refreshRowState(row, { keepError: false });
    refreshProgressSummary();
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.classList.contains('field-privilege')) return;
    const row = target.closest('tr');
    if (!row || !root.contains(row)) return;
    row.classList.remove('is-error');
    clearTransientSaved(row);
    refreshRowState(row, { keepError: false });
    refreshProgressSummary();
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

function setSaveEnabled(enabled) {
  const button = document.querySelector('#save-group');
  if (!button) return;
  button.disabled = !enabled;
  button.title = enabled
    ? 'Guardar informes del grupo en Google Sheets'
    : 'Disponible cuando el grupo esté cargado';
}

function setSaveBusy(busy) {
  const button = document.querySelector('#save-group');
  if (!button) return;
  button.disabled = busy || !sessionContext;
  button.textContent = busy ? 'Guardando…' : 'Guardar Grupo';
}

function setFeedback(message, tone = 'info') {
  const el = document.querySelector('#save-feedback');
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.dataset.tone = '';
    return;
  }
  el.hidden = false;
  el.dataset.tone = tone;
  el.textContent = message;
}

function markErrorRows(errors) {
  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    row.classList.remove('is-error', 'is-saved');
  });

  (errors || []).forEach((item) => {
    const id = item?.id;
    if (id == null || id === '') return;
    const row = document.querySelector(`.encargados-table tbody tr[data-id="${CSS.escape(String(id))}"]`);
    if (!row) return;
    clearTransientSaved(row);
    ROW_STATE_CLASSES.forEach((cls) => row.classList.remove(cls));
    row.classList.add('is-error');
    applyPrivilegeChrome(row);
  });

  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    if (!row.classList.contains('is-error')) refreshRowState(row, { keepError: false });
  });
  refreshProgressSummary();
}

function collectPayload() {
  if (!sessionContext) {
    throw new Error('No hay un grupo cargado para enviar.');
  }

  const rows = document.querySelectorAll('.encargados-table tbody tr');
  const personas = Array.from(rows).map((row) => readRowPerson(row));

  return {
    action: 'saveGroup',
    mode: 'save',
    grupo: sessionContext.grupo,
    mes: sessionContext.mes,
    periodo: sessionContext.periodo,
    personas,
  };
}

function formatErrorSummary(errors) {
  if (!errors?.length) return '';
  const sample = errors
    .slice(0, 5)
    .map((item) => `ID ${item.id}: ${item.error}`)
    .join(' · ');
  const more = errors.length > 5 ? ` (+${errors.length - 5} más)` : '';
  return `${sample}${more}`;
}

async function handleSaveGroup() {
  setFeedback('');
  setSaveBusy(true);

  try {
    const payload = collectPayload();
    const result = await postSaveGroup(payload);

    if (!result) {
      setFeedback('Respuesta vacía del servidor.', 'error');
      return;
    }

    if (result.ok === false && !result.wroteToSheet && !(result.errors || []).length) {
      setFeedback(result.message || result.error || 'No se pudo guardar el grupo.', 'error');
      return;
    }

    const errors = result.errors || [];
    if (errors.length) markErrorRows(errors);

    if (result.counts?.updated > 0 && errors.length === 0) {
      const savedIds = payload.personas.map((person) => person.id);
      try {
        await loadGroup(sessionContext.grupo, { keepFeedback: true });
        markRowsSaved(savedIds);
        setFeedback(result.message || 'Grupo guardado correctamente.', 'success');
      } catch (reloadError) {
        setFeedback(
          `${result.message || 'Grupo guardado.'} No se pudo releer la tabla: ${reloadError.message || 'error'}`,
          'error',
        );
      }
      return;
    }

    if (result.counts?.updated > 0 && errors.length > 0) {
      const failed = new Set(errors.map((item) => String(item.id)));
      const savedIds = payload.personas
        .map((person) => person.id)
        .filter((id) => !failed.has(String(id)));
      markRowsSaved(savedIds);
      setFeedback(
        `${result.message || 'Guardado parcial.'} ${formatErrorSummary(errors)}`,
        'error',
      );
      return;
    }

    if (errors.length) {
      setFeedback(
        `${result.message || 'No se actualizó ninguna persona.'} ${formatErrorSummary(errors)}`,
        'error',
      );
      return;
    }

    setFeedback(result.message || 'Guardado completado.', result.ok ? 'success' : 'error');
  } catch (error) {
    setFeedback(error.message || 'No se pudo enviar el lote.', 'error');
  } finally {
    setSaveBusy(false);
  }
}

async function loadGroup(grupo, { keepFeedback = false } = {}) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  sessionContext = null;
  setSaveEnabled(false);
  if (!keepFeedback) setFeedback('');
  setContext(grupo, '…');
  showStatus('Cargando informes…');

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
  bindTableInteractions(root);
  refreshAllRowStates({ keepError: false });
  setSaveEnabled(true);
}

async function init() {
  setSaveEnabled(false);
  setFeedback('');

  const resolved = resolveGroupParam();
  if (!resolved.ok) {
    sessionContext = null;
    setContext('—', '—');
    showStatus(resolved.message);
    return;
  }

  resolvedGrupo = resolved.grupo;

  const saveButton = document.querySelector('#save-group');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      void handleSaveGroup();
    });
  }

  try {
    await loadGroup(resolved.grupo);
  } catch (error) {
    sessionContext = null;
    setSaveEnabled(false);
    setContext(resolved.grupo, '—');
    showStatus(error.message || 'No se pudieron cargar los informes.', { retry: true });
  }
}

init();
