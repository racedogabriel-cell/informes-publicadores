/**
 * Portal Encargados — UI + lectura GET desde Apps Script.
 * Sin POST, sin validaciones de negocio, sin mensajes de guardado.
 *
 * Grupo determinado (temporal):
 * - ?grupo=1 | ?grupo=2
 * - ?grupo=Grupo%201 | ?grupo=Grupo%202
 * - por defecto: Grupo 1
 */

import { getMonthlyReports } from '../js/sheets.js';

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];
const DEFAULT_GROUP = 'Grupo 1';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

/** Resolución temporal del grupo hasta definir el mecanismo definitivo. */
export function resolveGroupName() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('grupo') || params.get('group') || '').trim();

  if (!raw) return DEFAULT_GROUP;
  if (raw === '1' || /^grupo\s*1$/i.test(raw)) return 'Grupo 1';
  if (raw === '2' || /^grupo\s*2$/i.test(raw)) return 'Grupo 2';
  if (raw === 'Grupo 1' || raw === 'Grupo 2') return raw;

  return DEFAULT_GROUP;
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

async function loadGroup() {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  const grupo = resolveGroupName();
  setContext(grupo, '…');
  showStatus('Cargando informes…');

  const data = await getMonthlyReports();
  if (!data) throw new Error('El conector de Apps Script no está configurado.');
  if (data.error) throw new Error(String(data.error));

  const group = (data.groups || []).find((item) => item.grupo === grupo);
  if (!group) throw new Error(`No se encontró ${grupo} en la respuesta.`);

  const people = (group.informes || []).filter((person) => person.id && person.nombre);
  setContext(group.grupo, group.mes || '—');
  root.innerHTML = renderTable(people);
}

async function init() {
  try {
    await loadGroup();
  } catch (error) {
    setContext(resolveGroupName(), '—');
    showStatus(error.message || 'No se pudieron cargar los informes.');
  }
}

init();
