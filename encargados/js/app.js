/**
 * Portal Encargados — lectura GET + canal POST dry-run (sin escritura en Sheets).
 *
 * Grupo determinado (temporal vía query):
 * - ?grupo=1 | ?grupo=2
 * - ?grupo=Grupo%201 | ?grupo=Grupo%202
 * - ausente o inválido → error; no se carga ni se permite guardar
 */

import { getMonthlyReports, postSaveGroupDryRun } from '../js/sheets.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];

/** @type {{ grupo: string, mes: string } | null} */
let sessionContext = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

/**
 * Resolución estricta del grupo. Sin fallback silencioso.
 * @returns {{ ok: true, grupo: string } | { ok: false, reason: 'missing' | 'invalid', message: string, raw: string }}
 */
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

function showStatus(message) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;
  root.innerHTML = `<p class="encargados-status" role="status">${escapeHtml(message)}</p>`;
}

function setSaveEnabled(enabled) {
  const button = document.querySelector('#save-group');
  if (!button) return;
  button.disabled = !enabled;
  button.title = enabled
    ? 'Enviar lote de prueba (sin escribir en Sheets)'
    : 'Disponible cuando el grupo esté cargado';
}

function setSaveBusy(busy) {
  const button = document.querySelector('#save-group');
  if (!button) return;
  button.disabled = busy || !sessionContext;
  button.textContent = busy ? 'Enviando…' : 'Guardar Grupo';
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
    mode: 'dryRun',
    grupo: sessionContext.grupo,
    mes: sessionContext.mes,
    personas,
  };
}

async function handleSaveGroup() {
  setFeedback('');
  setSaveBusy(true);

  try {
    const payload = collectPayload();
    const result = await postSaveGroupDryRun(payload);

    if (!result || result.ok !== true || result.received !== true) {
      const detail = result?.message || result?.error || 'El servidor rechazó el lote.';
      setFeedback(detail, 'error');
      return;
    }

    if (result.wroteToSheet === true) {
      setFeedback('Respuesta inesperada: el servidor indicó escritura. Revisar Apps Script.', 'error');
      return;
    }

    const count = result.counts?.received ?? payload.personas.length;
    setFeedback(
      result.message || `Lote recibido (${count} personas). Sheets sin cambios.`,
      'success',
    );
  } catch (error) {
    setFeedback(error.message || 'No se pudo enviar el lote.', 'error');
  } finally {
    setSaveBusy(false);
  }
}

async function loadGroup(grupo) {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  sessionContext = null;
  setSaveEnabled(false);
  setFeedback('');
  setContext(grupo, '…');
  showStatus('Cargando informes…');

  const data = await getMonthlyReports();
  if (!data) throw new Error('El conector de Apps Script no está configurado.');
  if (data.error) throw new Error(String(data.error));

  const group = (data.groups || []).find((item) => item.grupo === grupo);
  if (!group) throw new Error(`No se encontró ${grupo} en la respuesta.`);

  const people = (group.informes || []).filter((person) => person.id && person.nombre);
  sessionContext = { grupo: group.grupo, mes: group.mes || '' };
  setContext(group.grupo, group.mes || '—');
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
    showStatus(error.message || 'No se pudieron cargar los informes.');
  }
}

init();
