/**
 * Editor de informes compartido (Portal Encargados + Admin en modo edición).
 * Auto-save por persona vía postSavePerson — misma cola/debounce/validaciones.
 */

import { postSavePerson } from './sheets.js';
import {
  completenessClass,
  isPersonComplete,
  normalizeIntegerField,
  normalizeYesNo,
  privilegeSlug,
} from './report-status.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];
const COMPLETENESS_CLASSES = ['is-empty', 'is-editing', 'is-complete'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function formatGroupBadge(personOrGrupo) {
  if (personOrGrupo && typeof personOrGrupo === 'object') {
    const id = String(personOrGrupo.grupoId || '').trim();
    if (id) return `G${id}`;
    return formatGroupBadge(personOrGrupo.grupo);
  }
  const text = String(personOrGrupo || '').trim();
  const match = text.match(/^grupo\s*(\d+)$/i);
  if (match) return `G${match[1]}`;
  if (/^\d+$/.test(text)) return `G${text}`;
  return text || '—';
}

function groupBadgeCellHtml(person) {
  const label = formatGroupBadge(person);
  const title = String(person?.grupo || label).trim() || label;
  const color = String(person?.grupoColor || '').trim();
  const colorAttr = /^#[0-9A-Fa-f]{6}$/.test(color)
    ? ` style="--grupo-color:${escapeHtml(color)}" data-has-color="true"`
    : '';
  return `<span class="grupo-badge"${colorAttr} title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function privilegeOptions(selected) {
  const current = selected ?? '';
  return PRIVILEGIOS.map((value) => {
    const label = value || '—';
    const slug = privilegeSlug(value);
    const isSelected = value === current ? ' selected' : '';
    return `<option class="privilege-${slug}" value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function isReportFieldsLocked(privilegio) {
  return String(privilegio || '').trim() === '';
}

function isHoursDisabled(privilegio) {
  const value = String(privilegio || '').trim();
  return value === '' || value === 'Inactivo';
}

export function personSnapshot(person) {
  return JSON.stringify({
    id: String(person.id || ''),
    privilegio: String(person.privilegio || ''),
    horas: String(person.horas || ''),
    estudios: String(person.estudios || ''),
    comentarios: String(person.comentarios || ''),
  });
}

export function hoursControlHtml(privilegio, horas, nombre) {
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
    const value = normalizeIntegerField(horas);
    const display = /^\d+$/.test(value) ? value : '';
    return `<input class="field-input field-hours field-enabled" type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(display)}" placeholder="0" aria-label="${label}" />`;
  }

  return `<input class="field-input field-hours field-disabled" type="text" value="" placeholder="—" aria-label="${label}" disabled />`;
}

/**
 * @param {object} person
 * @param {{ layout?: 'encargados' | 'admin' }} [options]
 */
export function renderEditableRow(person, options = {}) {
  const layout = options.layout || 'encargados';
  const nombre = person.nombre || '';
  const privilegio = String(person.privilegio || '').trim();
  const slug = privilegeSlug(privilegio);
  const fieldsLocked = isReportFieldsLocked(privilegio);
  const hoursDisabled = isHoursDisabled(privilegio);
  const studiesDisabled = fieldsLocked;
  const commentsDisabled = fieldsLocked;
  const estudiosValue = fieldsLocked ? '' : normalizeIntegerField(person.estudios);
  const comentariosValue = fieldsLocked ? '' : person.comentarios || '';
  const grupo = person.grupo || '';
  const grupoId = String(person.grupoId || '').trim();
  const idCell =
    layout === 'encargados'
      ? `<td class="col-id" data-label="ID"><span class="id-value muted">${escapeHtml(person.id)}</span></td>`
      : '';
  const groupCell =
    layout === 'admin'
      ? `<td class="col-group" data-label="Grupo">${groupBadgeCellHtml(person)}</td>`
      : '';

  const dataGrupo = layout === 'admin' && grupo ? ` data-grupo="${escapeHtml(grupo)}"` : '';
  const dataGrupoId = layout === 'admin' && grupoId ? ` data-grupo-id="${escapeHtml(grupoId)}"` : '';

  return `
    <tr data-id="${escapeHtml(person.id)}" data-privilege="${slug}"${dataGrupo}${dataGrupoId}>
      ${idCell}
      <td class="col-name person-name" data-label="Nombre" title="${escapeHtml(nombre)}">
        <span class="completeness-dot" aria-hidden="true"></span>${escapeHtml(nombre)}
      </td>
      ${groupCell}
      <td class="col-privilege" data-label="Privilegio">
        <select class="field-input field-select field-privilege field-enabled privilege-${slug}" aria-label="Privilegio de ${escapeHtml(nombre)}">
          ${privilegeOptions(privilegio)}
        </select>
      </td>
      <td class="col-hours" data-label="Horas">
        ${hoursControlHtml(privilegio, hoursDisabled ? '' : person.horas, nombre)}
      </td>
      <td class="col-studies" data-label="Estudios">
        <input class="field-input field-studies ${studiesDisabled ? 'field-disabled' : 'field-enabled'}" type="text" inputmode="numeric" value="${escapeHtml(estudiosValue)}" placeholder="${studiesDisabled ? '—' : 'Est.'}" aria-label="Estudios de ${escapeHtml(nombre)}"${studiesDisabled ? ' disabled' : ''} />
      </td>
      <td class="col-comments" data-label="Comentarios">
        <input class="field-input field-comments ${commentsDisabled ? 'field-disabled' : 'field-enabled'}" type="text" value="${escapeHtml(comentariosValue)}" placeholder="${commentsDisabled ? '—' : '+'}" aria-label="Comentarios de ${escapeHtml(nombre)}"${commentsDisabled ? ' disabled' : ''} />
      </td>
    </tr>
  `;
}

export function seedPersonFromApi(person) {
  const privilegio = person.privilegio || '';
  const rawHours = person.horas || '';
  const horas =
    privilegio === 'Auxiliar' || privilegio === 'Regular'
      ? normalizeIntegerField(rawHours)
      : rawHours;
  return {
    id: person.id,
    privilegio,
    horas,
    estudios: normalizeIntegerField(person.estudios || ''),
    comentarios: person.comentarios || '',
    grupo: person.grupo || '',
    grupoId: person.grupoId || '',
    grupoColor: person.grupoColor || person.color || '',
    nombre: person.nombre || '',
  };
}

/**
 * @param {object} options
 * @param {ParentNode} options.root Contenedor con .encargados-table
 * @param {(row: HTMLElement) => { grupo: string, mes: string, periodo: string }} options.getSaveContext
 * @param {(info: { state: string, message: string }) => void} [options.onSaveStateChange]
 * @param {() => void} [options.onAfterChange]
 * @param {number} [options.debounceMs]
 */
export function createReportsEditor(options) {
  const root = options.root;
  const getSaveContext = options.getSaveContext;
  const onSaveStateChange = options.onSaveStateChange || (() => {});
  const onAfterChange = options.onAfterChange || (() => {});
  const debounceMs = options.debounceMs ?? 350;

  const lastSavedById = new Map();
  const saveQueues = new Map();
  const inputSaveTimers = new Map();
  let lastFailedSave = null;
  let activeSaveCount = 0;
  let destroyed = false;
  const abortControllers = [];

  function syncSaveIndicator() {
    if (destroyed) return;
    if (lastFailedSave) {
      onSaveStateChange({ state: 'error', message: 'Error al guardar' });
      return;
    }
    if (activeSaveCount > 0) {
      onSaveStateChange({ state: 'saving', message: 'Guardando...' });
      return;
    }
    onSaveStateChange({ state: 'saved', message: 'Guardado' });
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
    const rawHours = hoursDisabled ? '' : readHoursValue(row);
    const horas =
      privilegio === 'Auxiliar' || privilegio === 'Regular'
        ? normalizeIntegerField(rawHours)
        : rawHours;
    const nombreEl = row.querySelector('.person-name');
    const nombre = nombreEl
      ? String(nombreEl.textContent || '')
          .replace(/^\s*/, '')
          .trim()
      : '';
    return {
      id: row.getAttribute('data-id') || '',
      grupo: row.getAttribute('data-grupo') || '',
      nombre,
      privilegio,
      horas: hoursDisabled ? '' : horas,
      estudios: fieldsLocked
        ? ''
        : normalizeIntegerField(row.querySelector('.field-studies')?.value ?? ''),
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

    const cleanedSource = normalizeIntegerField(input.value);
    const cleaned = /^\d*$/.test(cleanedSource) ? cleanedSource : input.value.replace(/\D/g, '');
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
    row.classList.add(completenessClass(person));
  }

  function refreshRowVisuals(row) {
    applyPrivilegeChrome(row);
    setCompletenessState(row);
  }

  function getTableRows() {
    return Array.from(root.querySelectorAll('.encargados-table tbody tr'));
  }

  function refreshProgressSummary() {
    const rows = getTableRows();
    const total = rows.length;
    let complete = 0;
    rows.forEach((row) => {
      const person = readRowPerson(row);
      if (isPersonComplete(person.privilegio, person.horas)) complete += 1;
    });
    const pending = Math.max(total - complete, 0);
    const pct = total === 0 ? 0 : Math.round((complete / total) * 100);

    const progress = root.querySelector('.encargados-progress') || document.querySelector('.encargados-progress');
    if (!progress) return { total, complete, pending, pct };

    const totalEl = progress.querySelector('[data-stat="total"]');
    const completeEl = progress.querySelector('[data-stat="complete"]');
    const pendingEl = progress.querySelector('[data-stat="pending"]');
    const fill = progress.querySelector('[data-progress-fill]');
    const track = progress.querySelector('[data-progress-track]');
    const pctEl = progress.querySelector('[data-stat="pct"]');

    if (totalEl) totalEl.textContent = String(total);
    if (completeEl) completeEl.textContent = String(complete);
    if (pendingEl) pendingEl.textContent = String(pending);
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (fill instanceof HTMLElement) fill.style.width = `${pct}%`;
    if (track) {
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-label', `Progreso: ${complete} de ${total} completas`);
    }
    progress.dataset.complete = complete === total && total > 0 ? 'true' : 'false';

    const groupsLine = progress.querySelector('[data-groups-line]');
    if (groupsLine) {
      const byGroup = new Map();
      rows.forEach((row) => {
        const person = readRowPerson(row);
        const grupo = person.grupo || row.getAttribute('data-grupo') || '—';
        if (!byGroup.has(grupo)) byGroup.set(grupo, { total: 0, completed: 0 });
        const bucket = byGroup.get(grupo);
        bucket.total += 1;
        if (isPersonComplete(person.privilegio, person.horas)) bucket.completed += 1;
      });
      groupsLine.textContent = Array.from(byGroup.entries())
        .map(([grupo, stats]) => `${grupo}: ${stats.completed}/${stats.total}`)
        .join(' · ');
    }

    return { total, complete, pending, pct };
  }

  function refreshAllVisuals() {
    getTableRows().forEach((row) => refreshRowVisuals(row));
    refreshProgressSummary();
    onAfterChange();
  }

  function applyRowMode(row) {
    const privilegio = row.querySelector('.field-privilege')?.value ?? '';
    const nombreNode = row.querySelector('.person-name');
    const nombre = nombreNode
      ? String(nombreNode.textContent || '')
          .replace(/^\s*/, '')
          .trim()
      : '';
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
    comments.placeholder = fieldsLocked ? '—' : '+';

    if (fieldsLocked) {
      studies.value = '';
      comments.value = '';
    }

    refreshRowVisuals(row);
    refreshProgressSummary();
    onAfterChange();
  }

  function buildSavePersonPayload(persona) {
    const row = root.querySelector(
      `.encargados-table tbody tr[data-id="${String(persona.id).replace(/"/g, '')}"]`,
    );
    const context = getSaveContext(row || document.createElement('tr'));
    if (!context?.mes || !context?.periodo) {
      throw new Error('No hay contexto de guardado (mes/período).');
    }
    if (!context.grupoId && !context.grupo) {
      throw new Error('No hay contexto de guardado (grupoId/grupo).');
    }
    const payload = {
      action: 'savePerson',
      mode: 'save',
      mes: context.mes,
      periodo: context.periodo,
      persona: {
        id: String(persona.id || ''),
        privilegio: String(persona.privilegio || ''),
        horas: String(persona.horas || ''),
        estudios: String(persona.estudios || ''),
        comentarios: String(persona.comentarios || ''),
      },
    };
    // Fase 7/8: preferir grupoId; mantener grupo legacy si está presente.
    if (context.grupoId) payload.grupoId = String(context.grupoId);
    if (context.grupo) payload.grupo = String(context.grupo);
    return payload;
  }

  async function drainPersonQueue(personId) {
    const queue = saveQueues.get(personId);
    if (!queue || queue.running || destroyed) return;
    queue.running = true;

    while (queue.pending && !destroyed) {
      const persona = queue.pending;
      queue.pending = null;
      activeSaveCount += 1;
      syncSaveIndicator();

      try {
        const result = await postSavePerson(buildSavePersonPayload(persona));
        const failed = !(result && result.ok === true && result.wroteToSheet === true);

        if (failed) {
          lastFailedSave = {
            persona,
            error:
              result?.message ||
              result?.error ||
              result?.errors?.[0]?.error ||
              'Error al guardar',
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
    if (queue.pending && !destroyed) {
      void drainPersonQueue(personId);
    }
  }

  function enqueuePersonSave(persona, { force = false } = {}) {
    const id = String(persona.id || '');
    if (!id || destroyed) return;

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

  function clearInputSaveTimer(personId) {
    const id = String(personId || '');
    const timer = inputSaveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      inputSaveTimers.delete(id);
    }
  }

  function requestSaveFromRowNow(row, { force = false } = {}) {
    clearInputSaveTimer(row.getAttribute('data-id') || '');
    requestSaveFromRow(row, { force });
  }

  function requestSaveFromRowOnInput(row) {
    const id = String(row.getAttribute('data-id') || '');
    if (!id) return;
    clearInputSaveTimer(id);
    inputSaveTimers.set(
      id,
      setTimeout(() => {
        inputSaveTimers.delete(id);
        if (!destroyed) requestSaveFromRow(row);
      }, debounceMs),
    );
  }

  function getEditableFields() {
    return Array.from(root.querySelectorAll('.encargados-table .field-input')).filter(
      (el) => el instanceof HTMLElement && !el.disabled && !el.classList.contains('field-disabled'),
    );
  }

  function focusNextEditableField(current) {
    const fields = getEditableFields();
    const index = fields.indexOf(current);
    if (index < 0) return;
    const next = fields[index + 1];
    if (!(next instanceof HTMLElement)) return;
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('field-input')) return;
    if (target.disabled || target.classList.contains('field-disabled')) return;
    if (!root.contains(target)) return;
    event.preventDefault();
    focusNextEditableField(target);
  }

  function onInput(event) {
    sanitizeIntegerInput(event);
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest('tr');
    if (!row || !root.contains(row)) return;
    if (target.classList.contains('field-privilege')) return;
    refreshRowVisuals(row);
    refreshProgressSummary();
    onAfterChange();
    if (
      target.classList.contains('field-hours') ||
      target.classList.contains('field-studies') ||
      target.classList.contains('field-comments')
    ) {
      requestSaveFromRowOnInput(row);
    }
  }

  function onBlur(event) {
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
    requestSaveFromRowNow(row);
  }

  function onChange(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      !target.classList.contains('field-hours') &&
      !target.classList.contains('field-studies') &&
      !target.classList.contains('field-comments')
    ) {
      return;
    }
    const row = target.closest('tr');
    if (!row || !root.contains(row)) return;
    refreshRowVisuals(row);
    refreshProgressSummary();
    onAfterChange();
    requestSaveFromRowNow(row);
  }

  function bindPrivilegeHandlers() {
    root.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
      const privilege = row.querySelector('.field-privilege');
      if (!privilege || privilege.dataset.bound === '1') return;
      privilege.dataset.bound = '1';
      privilege.addEventListener('change', () => {
        applyRowMode(row);
        requestSaveFromRowNow(row);
      });
    });
  }

  function seedLastSaved(people) {
    lastSavedById.clear();
    people.forEach((person) => {
      const seeded = seedPersonFromApi(person);
      lastSavedById.set(String(seeded.id), personSnapshot(seeded));
    });
  }

  function bind() {
    bindPrivilegeHandlers();
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('input', onInput);
    root.addEventListener('blur', onBlur, true);
    root.addEventListener('change', onChange);
    abortControllers.push(() => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('input', onInput);
      root.removeEventListener('blur', onBlur, true);
      root.removeEventListener('change', onChange);
    });
    refreshAllVisuals();
    syncSaveIndicator();
  }

  function readAllPeople() {
    return getTableRows().map((row) => readRowPerson(row));
  }

  function retryLastFailedSave() {
    if (!lastFailedSave?.persona) return;
    const persona = lastFailedSave.persona;
    lastFailedSave = null;
    enqueuePersonSave(persona, { force: true });
  }

  function destroy() {
    destroyed = true;
    inputSaveTimers.forEach((timer) => clearTimeout(timer));
    inputSaveTimers.clear();
    abortControllers.forEach((fn) => fn());
    abortControllers.length = 0;
    saveQueues.clear();
  }

  return {
    bind,
    seedLastSaved,
    refreshAll: refreshAllVisuals,
    refreshProgress: refreshProgressSummary,
    readAllPeople,
    retryLastFailedSave,
    destroy,
  };
}
