/**
 * Módulo: Configuración
 * Objetivo: ABM del catálogo Grupos (hoja Grupos)
 * Estado: En desarrollo
 *
 * Fase 11: Configuración → Grupos.
 * No crea hojas de trabajo ni regenera el período abierto.
 * Sin DELETE físico.
 */

import {
  getGrupos,
  createGrupo,
  updateGrupo,
  setGrupoActivo,
} from './sheets.js';

const DEFAULT_COLORS = ['#2B6B4F', '#2F5D8A', '#A15C2B', '#5A3D7A'];
const NOMBRE_MAX = 40;

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

function normalizeHex(raw) {
  const value = String(raw || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return '';
  return value.toUpperCase();
}

function pickDefaultColor(groups) {
  const used = new Set(
    (groups || []).map((g) => String(g.color || '').toUpperCase()).filter(Boolean),
  );
  for (const color of DEFAULT_COLORS) {
    if (!used.has(color)) return color;
  }
  return DEFAULT_COLORS[(groups || []).length % DEFAULT_COLORS.length];
}

function emptyGrupo(state) {
  return {
    id: '',
    nombre: '',
    color: pickDefaultColor(state.groups),
    activo: true,
  };
}

export function configuracionView() {
  return `<div class="configuracion-view" id="configuracion-view"></div>`;
}

export function bindConfiguracion() {
  const root = document.querySelector('#configuracion-view');
  if (!root) return;

  const state = {
    groups: [],
    mode: null,
    draft: emptyGrupo({ groups: [] }),
    saveState: 'idle',
    saveMessage: '',
    busy: false,
  };

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.id === 'retry-configuracion') {
      await loadGrupos(root, state);
      return;
    }

    if (target.id === 'grupos-new') {
      openForm(root, state, 'create', emptyGrupo(state));
      return;
    }

    if (target.id === 'grupos-cancel') {
      closeForm(root, state);
      return;
    }

    if (target.id === 'grupos-save-retry') {
      await submitForm(root, state);
      return;
    }

    const editBtn = target.closest('[data-grupo-edit]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-grupo-edit');
      const group = state.groups.find((g) => String(g.id) === String(id));
      if (group) {
        openForm(root, state, 'edit', {
          id: group.id,
          nombre: group.nombre,
          color: normalizeHex(group.color) || pickDefaultColor(state.groups),
          activo: isActivo(group.activo),
        });
      }
      return;
    }

    const deactivateBtn = target.closest('[data-grupo-deactivate]');
    if (deactivateBtn && !state.busy) {
      const id = deactivateBtn.getAttribute('data-grupo-deactivate');
      if (
        !window.confirm(
          '¿Desactivar este grupo?\n\nNo se podrá asignar a personas ni materializar en la próxima apertura.\nSi hay personas activas asignadas, el backend lo bloqueará.',
        )
      ) {
        return;
      }
      await toggleActivo(root, state, id, false);
      return;
    }

    const activateBtn = target.closest('[data-grupo-activate]');
    if (activateBtn && !state.busy) {
      const id = activateBtn.getAttribute('data-grupo-activate');
      if (!window.confirm('¿Activar este grupo?')) return;
      await toggleActivo(root, state, id, true);
    }
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !state.mode) return;
    if (target.id === 'grupo-nombre') {
      state.draft.nombre = target.value || '';
    }
    if (target.id === 'grupo-color' || target.id === 'grupo-color-text') {
      const hex = normalizeHex(target.value);
      if (hex) {
        state.draft.color = hex;
        syncColorInputs(root, hex);
      } else if (target.id === 'grupo-color-text') {
        state.draft.color = String(target.value || '').trim();
      }
    }
  });

  root.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'grupos-form') return;
    event.preventDefault();
    await submitForm(root, state);
  });

  loadGrupos(root, state);
}

async function loadGrupos(root, state) {
  root.innerHTML = `<p class="personas-feedback" data-tone="info" role="status">Cargando…</p>`;
  try {
    const data = await getGrupos();
    if (!data?.ok) {
      throw new Error(data?.message || data?.error || 'No se pudo leer el catálogo de grupos.');
    }
    state.groups = Array.isArray(data.grupos) ? data.grupos : [];
    state.mode = null;
    state.saveState = 'idle';
    state.saveMessage = '';
    renderScreen(root, state);
  } catch (error) {
    root.innerHTML = `
      <p class="personas-feedback" data-tone="error" role="status">${escapeHtml(error.message || 'Error al cargar.')}</p>
      <p><button type="button" class="button" id="retry-configuracion">Reintentar</button></p>
    `;
  }
}

function renderScreen(root, state) {
  const groups = sortGroups(state.groups);
  root.innerHTML = `
    <section class="personas-toolbar configuracion-toolbar" aria-label="Acciones de Grupos">
      <button type="button" class="button personas-new-btn" id="grupos-new">+ Nuevo grupo</button>
    </section>

    <div id="grupos-form-host"></div>

    <section class="panel card personas-list-panel" aria-label="Catálogo de grupos">
      <div class="panel-head personas-panel-head">
        <h2>Grupos</h2>
        <span class="muted">${groups.length} en catálogo</span>
      </div>
      <p class="configuracion-hint muted">
        El ID es estable. Renombrar no cambia Historial ni las pestañas de trabajo.
        Un grupo nuevo no se materializa hasta la próxima apertura de período.
      </p>
      <div id="grupos-list"></div>
    </section>
  `;

  renderFormHost(root, state);
  renderList(root, state);
}

function renderFormHost(root, state) {
  const host = root.querySelector('#grupos-form-host');
  if (!host) return;
  if (!state.mode) {
    host.innerHTML = '';
    return;
  }

  const isCreate = state.mode === 'create';
  const draft = state.draft;
  const color = normalizeHex(draft.color) || '#2B6B4F';
  const feedback =
    state.saveState === 'error'
      ? `<p class="personas-feedback" data-tone="error" role="status">${escapeHtml(state.saveMessage)}</p>
         <p><button type="button" class="button" id="grupos-save-retry">Reintentar guardado</button></p>`
      : state.saveState === 'saving'
        ? `<p class="personas-feedback" data-tone="info" role="status">Guardando…</p>`
        : '';

  host.innerHTML = `
    <section class="panel card personas-form-panel" aria-label="${isCreate ? 'Nuevo grupo' : 'Editar grupo'}">
      <div class="panel-head personas-panel-head">
        <h2>${isCreate ? 'Nuevo grupo' : `Editar grupo ${escapeHtml(draft.id)}`}</h2>
      </div>
      <form id="grupos-form" class="personas-form configuracion-form" novalidate>
        <div class="personas-form-grid configuracion-form-grid">
          <label>
            Nombre
            <input
              id="grupo-nombre"
              class="field-input"
              name="nombre"
              type="text"
              maxlength="${NOMBRE_MAX}"
              required
              value="${escapeHtml(draft.nombre)}"
              autocomplete="off"
            />
          </label>
          <label class="configuracion-color-field">
            Color
            <span class="configuracion-color-row">
              <input id="grupo-color" type="color" value="${escapeHtml(color)}" aria-label="Selector de color" />
              <input
                id="grupo-color-text"
                class="field-input"
                name="color"
                type="text"
                maxlength="7"
                pattern="#[0-9A-Fa-f]{6}"
                value="${escapeHtml(draft.color || color)}"
                autocomplete="off"
              />
            </span>
          </label>
        </div>
        ${
          isCreate
            ? ''
            : `<p class="muted configuracion-id-note">ID inmutable: <strong>${escapeHtml(draft.id)}</strong> · SheetKey: Grupo ${escapeHtml(draft.id)}</p>`
        }
        ${feedback}
        <div class="personas-form-actions">
          <button type="submit" class="button" ${state.busy ? 'disabled' : ''}>Guardar</button>
          <button type="button" class="button button-secondary" id="grupos-cancel" ${state.busy ? 'disabled' : ''}>Cancelar</button>
        </div>
      </form>
    </section>
  `;
}

function syncColorInputs(root, hex) {
  const picker = root.querySelector('#grupo-color');
  const text = root.querySelector('#grupo-color-text');
  if (picker && picker.value.toUpperCase() !== hex) picker.value = hex;
  if (text && String(text.value || '').toUpperCase() !== hex) text.value = hex;
}

function renderList(root, state) {
  const host = root.querySelector('#grupos-list');
  if (!host) return;
  const groups = sortGroups(state.groups);

  if (!groups.length) {
    host.innerHTML = `<p class="muted">Todavía no hay grupos en el catálogo.</p>`;
    return;
  }

  host.innerHTML = `
    <div class="personas-table-scroll">
      <table class="encargados-table personas-table configuracion-table">
        <thead>
          <tr>
            <th class="col-id">ID</th>
            <th class="col-name">Nombre</th>
            <th class="col-color">Vista</th>
            <th class="col-status">Estado</th>
            <th class="col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${groups
            .map((g) => {
              const on = isActivo(g.activo);
              const color = normalizeHex(g.color);
              const label = g.id ? `G${g.id}` : '—';
              const title = `${g.nombre || label}${color ? ` · ${color}` : ''}`;
              const colorCell = color
                ? `<span class="grupo-badge" style="--grupo-color:${escapeHtml(color)}" data-has-color="true" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`
                : escapeHtml(label);
              return `
                <tr class="${on ? '' : 'is-inactive-row'}">
                  <td class="col-id" data-label="ID">${escapeHtml(g.id)}</td>
                  <td class="col-name" data-label="Nombre">${escapeHtml(g.nombre)}</td>
                  <td class="col-color" data-label="Vista">${colorCell}</td>
                  <td class="col-status" data-label="Estado">${statusBadge(on)}</td>
                  <td class="col-actions" data-label="Acciones">
                    <div class="personas-actions-cell">
                      <button type="button" class="personas-action-link" data-grupo-edit="${escapeHtml(g.id)}">Editar</button>
                      ${
                        on
                          ? `<button type="button" class="personas-action-link personas-danger" data-grupo-deactivate="${escapeHtml(g.id)}">Desactivar</button>`
                          : `<button type="button" class="personas-action-link" data-grupo-activate="${escapeHtml(g.id)}">Activar</button>`
                      }
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function openForm(root, state, mode, draft) {
  state.mode = mode;
  state.draft = { ...draft };
  state.saveState = 'idle';
  state.saveMessage = '';
  renderFormHost(root, state);
  root.querySelector('#grupo-nombre')?.focus();
}

function closeForm(root, state) {
  state.mode = null;
  state.draft = emptyGrupo(state);
  state.saveState = 'idle';
  state.saveMessage = '';
  renderFormHost(root, state);
}

async function submitForm(root, state) {
  if (!state.mode || state.busy) return;
  const nombre = String(state.draft.nombre || '').trim().replace(/\s+/g, ' ');
  const color = normalizeHex(state.draft.color);
  if (!nombre) {
    state.saveState = 'error';
    state.saveMessage = 'El nombre es obligatorio.';
    renderFormHost(root, state);
    return;
  }
  if (nombre.length > NOMBRE_MAX) {
    state.saveState = 'error';
    state.saveMessage = `El nombre no puede superar ${NOMBRE_MAX} caracteres.`;
    renderFormHost(root, state);
    return;
  }
  if (!color) {
    state.saveState = 'error';
    state.saveMessage = 'Color inválido. Usá formato #RRGGBB.';
    renderFormHost(root, state);
    return;
  }

  state.busy = true;
  state.saveState = 'saving';
  state.saveMessage = '';
  renderFormHost(root, state);

  try {
    const result =
      state.mode === 'create'
        ? await createGrupo({ nombre, color, activo: true })
        : await updateGrupo({ id: state.draft.id, nombre, color });

    if (!result?.ok) {
      throw new Error(result?.message || result?.error || 'No se pudo guardar el grupo.');
    }

    await loadGrupos(root, state);
  } catch (error) {
    state.saveState = 'error';
    state.saveMessage = error.message || 'No se pudo guardar el grupo.';
    state.busy = false;
    renderFormHost(root, state);
  } finally {
    state.busy = false;
  }
}

async function toggleActivo(root, state, id, activo) {
  state.busy = true;
  try {
    const result = await setGrupoActivo(id, activo);
    if (!result?.ok) {
      window.alert(result?.message || result?.error || 'No se pudo cambiar el estado del grupo.');
      return;
    }
    await loadGrupos(root, state);
  } catch (error) {
    window.alert(error.message || 'No se pudo cambiar el estado del grupo.');
  } finally {
    state.busy = false;
  }
}
