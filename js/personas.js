/**
 * Módulo: Personas
 * Objetivo: ABM del padrón maestro (hoja Personas)
 * Estado: En desarrollo
 *
 * No modifica Informes históricos ni hojas de grupo del período abierto.
 * Contacto/emergencia viven solo en el padrón.
 *
 * Fase 9: select/filtros desde catálogo Grupos + badge con color.
 */

import {
  getPersonas,
  getGrupos,
  createPersona,
  updatePersona,
  setPersonaActivo,
} from './sheets.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[char],
  );
}

function isActivo(value) {
  return value === true || value === 'Sí' || value === 'Si' || value === 'sí';
}

function statusBadge(activo) {
  const on = isActivo(activo);
  return `<span class="personas-status ${on ? 'is-active' : 'is-inactive'}"><span class="personas-status-dot" aria-hidden="true"></span>${on ? 'Activo' : 'Inactivo'}</span>`;
}

function sortGroups(groups) {
  return (groups || [])
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function activeGroups(state) {
  return sortGroups((state.groups || []).filter((g) => g.activo === true));
}

function findGroup(state, grupoId) {
  const id = String(grupoId || '').trim();
  if (!id) return null;
  return (state.groups || []).find((g) => String(g.id) === id) || null;
}

function personGrupoId(person) {
  return String(person?.grupoId || '').trim();
}

function groupBadgeHtml(person, state) {
  const id = personGrupoId(person);
  const fromCatalog = findGroup(state, id);
  const nombre = String(person.grupoNombre || person.grupo || fromCatalog?.nombre || '').trim();
  const color = String(person.grupoColor || fromCatalog?.color || '').trim();
  const label = id ? `G${id}` : nombre || '—';
  const title = nombre || label;
  const colorAttr = /^#[0-9A-Fa-f]{6}$/.test(color)
    ? ` style="--grupo-color:${escapeHtml(color)}" data-has-color="true"`
    : '';
  return `<span class="grupo-badge"${colorAttr} title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function defaultGrupoId(state) {
  const first = activeGroups(state)[0];
  return first ? String(first.id) : '';
}

function emptyPersona(state) {
  const grupoId = defaultGrupoId(state);
  const group = findGroup(state, grupoId);
  return {
    id: '',
    nombre: '',
    grupoId,
    grupo: group?.nombre || '',
    activo: true,
    numeroContacto: '',
    contactoEmergencia: '',
    nombreEmergencia: '',
    relacionEmergencia: '',
  };
}

export function personasView() {
  return `<div class="personas-view" id="personas-view"></div>`;
}

export function bindPersonas() {
  const root = document.querySelector('#personas-view');
  if (!root) return;

  const state = {
    people: [],
    groups: [],
    search: '',
    filter: 'todos',
    mode: null,
    draft: emptyPersona({ groups: [] }),
    saveState: 'idle',
    saveMessage: '',
    busy: false,
  };

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === 'retry-personas') {
      await loadPersonas(root, state);
      return;
    }

    if (target.id === 'personas-new') {
      openForm(root, state, 'create', emptyPersona(state));
      return;
    }

    if (target.id === 'personas-cancel') {
      closeForm(root, state);
      return;
    }

    if (target.id === 'personas-save-retry') {
      await submitForm(root, state);
      return;
    }

    const editBtn = target.closest('[data-persona-edit]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-persona-edit');
      const person = state.people.find((p) => String(p.id) === String(id));
      if (person) {
        openForm(root, state, 'edit', {
          ...person,
          grupoId: personGrupoId(person) || defaultGrupoId(state),
        });
      }
      return;
    }

    const deactivateBtn = target.closest('[data-persona-deactivate]');
    if (deactivateBtn && !state.busy) {
      const id = deactivateBtn.getAttribute('data-persona-deactivate');
      if (!window.confirm('¿Desactivar esta persona?')) return;
      await toggleActivo(root, state, id, false);
      return;
    }

    const activateBtn = target.closest('[data-persona-activate]');
    if (activateBtn && !state.busy) {
      const id = activateBtn.getAttribute('data-persona-activate');
      if (!window.confirm('¿Activar esta persona?')) return;
      await toggleActivo(root, state, id, true);
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'personas-search') {
      state.search = target.value || '';
      renderList(root, state);
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'personas-filter') {
      state.filter = target.value || 'todos';
      renderList(root, state);
    }
  });

  root.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'personas-form') return;
    event.preventDefault();
    await submitForm(root, state);
  });

  loadPersonas(root, state);
}

async function loadPersonas(root, state) {
  root.innerHTML = `<p class="personas-feedback" data-tone="info" role="status">Cargando…</p>`;
  try {
    const [peopleData, groupsData] = await Promise.all([getPersonas(), getGrupos()]);
    if (!peopleData?.ok) {
      throw new Error(peopleData?.message || peopleData?.error || 'No se pudo leer Personas.');
    }
    if (!groupsData?.ok) {
      throw new Error(groupsData?.message || groupsData?.error || 'No se pudo leer el catálogo de grupos.');
    }
    state.people = Array.isArray(peopleData.personas) ? peopleData.personas : [];
    state.groups = Array.isArray(groupsData.grupos) ? groupsData.grupos : [];
    state.mode = null;
    state.saveState = 'idle';
    if (String(state.filter || '').startsWith('gid:')) {
      const fid = state.filter.slice(4);
      if (!findGroup(state, fid)) state.filter = 'todos';
    }
    renderScreen(root, state);
  } catch (error) {
    root.innerHTML = `
      <p class="personas-feedback" data-tone="error" role="status">${escapeHtml(error.message || 'Error al cargar.')}</p>
      <p><button type="button" class="button" id="retry-personas">Reintentar</button></p>
    `;
  }
}

function filteredPeople(state) {
  const q = String(state.search || '')
    .trim()
    .toLowerCase();
  const filter = String(state.filter || 'todos');
  return state.people
    .filter((person) => {
      if (filter === 'activos' && !isActivo(person.activo)) return false;
      if (filter === 'inactivos' && isActivo(person.activo)) return false;
      if (filter.startsWith('gid:')) {
        const gid = filter.slice(4);
        if (personGrupoId(person) !== gid) return false;
      }
      if (!q) return true;
      return String(person.nombre || '')
        .toLowerCase()
        .includes(q);
    })
    .slice()
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function filterOptionsHtml(state) {
  const groupOpts = sortGroups(state.groups)
    .map((g) => {
      const value = `gid:${g.id}`;
      const label = g.activo ? g.nombre : `${g.nombre} (inactivo)`;
      return `<option value="${escapeHtml(value)}" ${state.filter === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');
  return `
    <option value="todos" ${state.filter === 'todos' ? 'selected' : ''}>Todos</option>
    <option value="activos" ${state.filter === 'activos' ? 'selected' : ''}>Activos</option>
    <option value="inactivos" ${state.filter === 'inactivos' ? 'selected' : ''}>Inactivos</option>
    ${groupOpts}
  `;
}

function renderScreen(root, state) {
  const count = filteredPeople(state).length;
  root.innerHTML = `
    <section class="personas-toolbar" aria-label="Acciones de Personas">
      <button type="button" class="button personas-new-btn" id="personas-new">+ Nueva persona</button>
      <div class="personas-toolbar-filters">
        <label class="personas-search-wrap">
          <span class="visually-hidden">Buscar persona</span>
          <input
            id="personas-search"
            class="personas-search"
            type="search"
            placeholder="Buscar persona…"
            value="${escapeHtml(state.search)}"
            autocomplete="off"
          />
        </label>
        <label class="personas-filter-wrap">
          <span class="visually-hidden">Filtrar</span>
          <select id="personas-filter" class="personas-filter" aria-label="Filtrar personas">
            ${filterOptionsHtml(state)}
          </select>
        </label>
      </div>
    </section>

    <div id="personas-form-host"></div>

    <section class="panel card personas-list-panel" aria-label="Listado de personas">
      <div class="panel-head personas-panel-head">
        <h2>Personas</h2>
        <span class="muted" id="personas-count">${count} visibles</span>
      </div>
      <div id="personas-list"></div>
    </section>
  `;

  renderFormHost(root, state);
  renderList(root, state);
}

function renderList(root, state) {
  const host = root.querySelector('#personas-list');
  const countEl = root.querySelector('#personas-count');
  if (!host) return;

  const rows = filteredPeople(state);
  if (countEl) countEl.textContent = `${rows.length} visibles`;

  if (!rows.length) {
    host.innerHTML = `<p class="empty-state muted">No hay personas para mostrar.</p>`;
    return;
  }

  host.innerHTML = `
    <div class="encargados-table-scroll personas-table-scroll">
      <table class="encargados-table personas-table">
        <colgroup>
          <col class="personas-col-name" style="width:560px" />
          <col class="personas-col-group" style="width:60px" />
          <col class="personas-col-status" style="width:100px" />
          <col class="personas-col-actions" style="width:150px" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" class="col-name">Nombre</th>
            <th scope="col" class="col-group">Grupo</th>
            <th scope="col" class="col-status">Estado</th>
            <th scope="col" class="col-actions">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((person) => {
              const activo = isActivo(person.activo);
              return `
              <tr data-id="${escapeHtml(person.id)}" class="${activo ? '' : 'is-inactive-row'}">
                <td data-label="Nombre" class="col-name person-name personas-name">${escapeHtml(person.nombre)}</td>
                <td data-label="Grupo" class="col-group">${groupBadgeHtml(person, state)}</td>
                <td data-label="Estado" class="col-status">${statusBadge(person.activo)}</td>
                <td data-label="Acción" class="col-actions personas-actions-cell">
                  <button type="button" class="personas-action-link" data-persona-edit="${escapeHtml(person.id)}">Editar</button>
                  ${
                    activo
                      ? `<button type="button" class="personas-action-link personas-danger" data-persona-deactivate="${escapeHtml(person.id)}">Desactivar</button>`
                      : `<button type="button" class="personas-action-link" data-persona-activate="${escapeHtml(person.id)}">Activar</button>`
                  }
                </td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openForm(root, state, mode, draft) {
  state.mode = mode;
  state.draft = { ...emptyPersona(state), ...draft };
  if (!personGrupoId(state.draft)) {
    state.draft.grupoId = defaultGrupoId(state);
  }
  state.saveState = 'idle';
  state.saveMessage = '';
  renderFormHost(root, state);
  root.querySelector('#persona-nombre')?.focus();
}

function closeForm(root, state) {
  state.mode = null;
  state.draft = emptyPersona(state);
  state.saveState = 'idle';
  state.saveMessage = '';
  renderFormHost(root, state);
}

function renderFormHost(root, state) {
  const host = root.querySelector('#personas-form-host');
  if (!host) return;
  if (!state.mode) {
    host.innerHTML = '';
    return;
  }

  const d = state.draft;
  const title = state.mode === 'create' ? 'Nueva persona' : 'Editar persona';
  const selectedId = personGrupoId(d) || defaultGrupoId(state);
  const selectable = activeGroups(state);
  // Si edita persona con grupo inactivo, incluir esa opción para no perder el valor hasta reasignar.
  const selectedGroup = findGroup(state, selectedId);
  const optionsSource =
    selectedGroup && !selectedGroup.activo
      ? sortGroups([selectedGroup, ...selectable.filter((g) => String(g.id) !== String(selectedGroup.id))])
      : selectable;

  if (!optionsSource.length) {
    host.innerHTML = `
      <section class="panel card personas-form-panel">
        <p class="personas-feedback" data-tone="error" role="status">No hay grupos activos en el catálogo. No se puede asignar grupo.</p>
        <button type="button" class="button button-secondary" id="personas-cancel">Cancelar</button>
      </section>
    `;
    return;
  }

  const groupOptions = optionsSource
    .map((g) => {
      const label = g.activo ? g.nombre : `${g.nombre} (inactivo)`;
      return `<option value="${escapeHtml(g.id)}" ${String(g.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');

  host.innerHTML = `
    <section class="panel card personas-form-panel" aria-label="${escapeHtml(title)}">
      <div class="panel-head">
        <h2>${escapeHtml(title)}</h2>
        ${saveIndicatorHtml(state)}
      </div>
      <form id="personas-form" class="personas-form" novalidate>
        <div class="personas-form-grid">
          <label>
            <span>Nombre</span>
            <input id="persona-nombre" name="nombre" class="field-input" type="text" required value="${escapeHtml(d.nombre)}" autocomplete="off" />
          </label>
          <label>
            <span>Grupo</span>
            <select id="persona-grupo" name="grupoId" class="field-input field-select" required>
              ${groupOptions}
            </select>
          </label>
          <label class="personas-activo-field">
            <span>Activo</span>
            <select id="persona-activo" name="activo" class="field-input field-select">
              <option value="true" ${isActivo(d.activo) ? 'selected' : ''}>Sí</option>
              <option value="false" ${!isActivo(d.activo) ? 'selected' : ''}>No</option>
            </select>
          </label>
        </div>

        <fieldset class="personas-fieldset">
          <legend>Contacto</legend>
          <label>
            <span>Número de contacto</span>
            <input id="persona-numero" name="numeroContacto" class="field-input" type="text" inputmode="text" value="${escapeHtml(d.numeroContacto)}" autocomplete="off" />
          </label>
        </fieldset>

        <fieldset class="personas-fieldset">
          <legend>Emergencia</legend>
          <div class="personas-form-grid">
            <label>
              <span>Contacto de emergencia</span>
              <input id="persona-emergencia-tel" name="contactoEmergencia" class="field-input" type="text" inputmode="text" value="${escapeHtml(d.contactoEmergencia)}" autocomplete="off" />
            </label>
            <label>
              <span>Nombre de emergencia</span>
              <input id="persona-emergencia-nombre" name="nombreEmergencia" class="field-input" type="text" value="${escapeHtml(d.nombreEmergencia)}" autocomplete="off" />
            </label>
            <label>
              <span>Relación</span>
              <input id="persona-emergencia-relacion" name="relacionEmergencia" class="field-input" type="text" value="${escapeHtml(d.relacionEmergencia)}" autocomplete="off" />
            </label>
          </div>
        </fieldset>

        <div class="personas-form-actions">
          <button type="submit" class="button" ${state.busy ? 'disabled' : ''}>Guardar</button>
          <button type="button" class="button button-secondary" id="personas-cancel" ${state.busy ? 'disabled' : ''}>Cancelar</button>
        </div>
      </form>
    </section>
  `;
}

function saveIndicatorHtml(state) {
  if (state.saveState === 'idle') return '';
  const label =
    state.saveState === 'saving'
      ? 'Guardando…'
      : state.saveState === 'saved'
        ? 'Guardado'
        : state.saveMessage || 'Error al guardar';
  const retry =
    state.saveState === 'error'
      ? `<button type="button" class="save-indicator-retry" id="personas-save-retry">Reintentar</button>`
      : '';
  return `
    <div class="save-indicator" data-state="${escapeHtml(state.saveState)}" role="status" aria-live="polite">
      <span class="save-indicator-dot" aria-hidden="true"></span>
      <span class="save-indicator-text">${escapeHtml(label)}</span>
      ${retry}
    </div>
  `;
}

function readFormDraft(root) {
  const form = root.querySelector('#personas-form');
  if (!form) return null;
  const data = new FormData(form);
  return {
    nombre: String(data.get('nombre') || '').trim(),
    grupoId: String(data.get('grupoId') || '').trim(),
    activo: String(data.get('activo') || 'true') === 'true',
    numeroContacto: String(data.get('numeroContacto') ?? ''),
    contactoEmergencia: String(data.get('contactoEmergencia') ?? ''),
    nombreEmergencia: String(data.get('nombreEmergencia') ?? ''),
    relacionEmergencia: String(data.get('relacionEmergencia') ?? ''),
  };
}

async function submitForm(root, state) {
  if (state.busy || !state.mode) return;
  const draft = readFormDraft(root);
  if (!draft) return;

  if (!draft.nombre) {
    state.saveState = 'error';
    state.saveMessage = 'El nombre es obligatorio.';
    state.draft = { ...state.draft, ...draft };
    renderFormHost(root, state);
    return;
  }

  if (!draft.grupoId) {
    state.saveState = 'error';
    state.saveMessage = 'Seleccioná un grupo.';
    state.draft = { ...state.draft, ...draft };
    renderFormHost(root, state);
    return;
  }

  const group = findGroup(state, draft.grupoId);
  if (!group || (!group.activo && state.mode === 'create')) {
    state.saveState = 'error';
    state.saveMessage = 'El grupo seleccionado no está activo.';
    state.draft = { ...state.draft, ...draft };
    renderFormHost(root, state);
    return;
  }

  state.busy = true;
  state.draft = { ...state.draft, ...draft, grupo: group?.nombre || '' };
  state.saveState = 'saving';
  state.saveMessage = '';
  renderFormHost(root, state);

  const payload = {
    nombre: draft.nombre,
    grupoId: draft.grupoId,
    activo: draft.activo,
    numeroContacto: draft.numeroContacto,
    contactoEmergencia: draft.contactoEmergencia,
    nombreEmergencia: draft.nombreEmergencia,
    relacionEmergencia: draft.relacionEmergencia,
  };

  try {
    let result;
    if (state.mode === 'create') {
      result = await createPersona(payload);
    } else {
      result = await updatePersona({ id: state.draft.id, ...payload });
    }

    if (!result?.ok) {
      throw new Error(result?.message || result?.error || 'Error al guardar.');
    }

    const persona = result.persona;
    if (state.mode === 'create' && persona) {
      state.people.push(persona);
    } else if (persona) {
      state.people = state.people.map((p) => (String(p.id) === String(persona.id) ? persona : p));
    }

    state.saveState = 'saved';
    state.busy = false;
    closeForm(root, state);
    renderList(root, state);
  } catch (error) {
    state.busy = false;
    state.saveState = 'error';
    state.saveMessage = error.message || 'Error al guardar';
    renderFormHost(root, state);
  }
}

async function toggleActivo(root, state, id, activo) {
  if (state.busy) return;
  state.busy = true;
  try {
    const result = await setPersonaActivo(id, activo);
    if (!result?.ok) {
      throw new Error(result?.message || result?.error || 'No se pudo actualizar el estado.');
    }
    const persona = result.persona;
    if (persona) {
      state.people = state.people.map((p) => (String(p.id) === String(persona.id) ? persona : p));
    }
    if (state.mode === 'edit' && String(state.draft.id) === String(id)) {
      state.draft = { ...state.draft, activo };
      renderFormHost(root, state);
    }
    renderList(root, state);
  } catch (error) {
    window.alert(error.message || 'No se pudo actualizar el estado.');
  } finally {
    state.busy = false;
  }
}
