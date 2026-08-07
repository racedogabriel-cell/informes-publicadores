/**
 * Portal Encargados — lectura GET + guardado real POST (saveGroup).
 * Estabilización 1: Sistema como autoridad, relectura post-guardado, timeout/reintento.
 *
 * Grupo determinado (temporal vía query):
 * - ?grupo=1 | ?grupo=2
 * - ausente o inválido → error; no se carga ni se permite guardar
 */

import { getMonthlyReports, getSystemState, postSaveGroup } from '../../js/sheets.js';
import { isEstadoAbierto, periodKeyToLabel } from '../../js/period.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];

/** @type {{ grupo: string, mes: string, periodo: string } | null} */
let sessionContext = null;
let resolvedGrupo = null;

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

function renderRow(person) {
  const nombre = person.nombre || '';
  return `
    <tr data-id="${escapeHtml(person.id)}">
      <td class="col-id muted">${escapeHtml(person.id)}</td>
      <td class="col-name person-name" title="${escapeHtml(nombre)}">${escapeHtml(nombre)}</td>
      <td class="col-privilege">
        <select class="field-input field-select" aria-label="Privilegio de ${escapeHtml(nombre)}">
          ${privilegeOptions(person.privilegio)}
        </select>
      </td>
      <td class="col-hours">
        <input class="field-input field-hours" type="text" value="${escapeHtml(person.horas)}" aria-label="Horas de ${escapeHtml(nombre)}" />
      </td>
      <td class="col-studies">
        <input class="field-input field-studies" type="text" value="${escapeHtml(person.estudios)}" aria-label="Estudios de ${escapeHtml(nombre)}" />
      </td>
      <td class="col-comments">
        <input class="field-input field-comments" type="text" value="${escapeHtml(person.comentarios)}" aria-label="Comentarios de ${escapeHtml(nombre)}" />
      </td>
    </tr>
  `;
}

function renderTable(people) {
  return `
    <section class="encargados-board" aria-label="Informes del grupo">
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

function clearRowStates() {
  document.querySelectorAll('.encargados-table tbody tr').forEach((row) => {
    row.classList.remove('is-error', 'is-complete', 'is-pending');
  });
}

function markErrorRows(errors) {
  clearRowStates();
  (errors || []).forEach((item) => {
    const id = item?.id;
    if (id == null || id === '') return;
    const row = document.querySelector(`.encargados-table tbody tr[data-id="${CSS.escape(String(id))}"]`);
    if (row) row.classList.add('is-error');
  });
}

function collectPayload() {
  if (!sessionContext) {
    throw new Error('No hay un grupo cargado para enviar.');
  }

  const rows = document.querySelectorAll('.encargados-table tbody tr');
  const personas = Array.from(rows).map((row) => {
    const id = row.getAttribute('data-id') || '';
    const privilegio = row.querySelector('.field-select')?.value ?? '';
    const horas = row.querySelector('.field-hours')?.value ?? '';
    const estudios = row.querySelector('.field-studies')?.value ?? '';
    const comentarios = row.querySelector('.field-comments')?.value ?? '';
    return { id, privilegio, horas, estudios, comentarios };
  });

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
  clearRowStates();
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
      try {
        await loadGroup(sessionContext.grupo, { keepFeedback: true });
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
