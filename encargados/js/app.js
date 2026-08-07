/**
 * Portal Encargados — interfaz únicamente.
 * Sin lectura/escritura Apps Script, sin validaciones ni guardado real.
 * Datos simulados para maqueta visual (densidad ~grupo completo).
 */

const MOCK_CONTEXT = {
  grupo: 'Grupo 1',
  mes: 'Agosto 2026',
};

const MOCK_NAMES = [
  'Araya Veronica',
  'Bonaguidi Adalberto',
  'Bonaguidi Mirta',
  'Carballo Hugo',
  'Di Ferdinando Liana',
  'Di Ferdinando Miqueas',
  'Diaz Carlitos',
  'Diaz Maria Rosa',
  'Diez Antonio',
  'Diez Claudia',
  'Ducco Lourdes',
  'Gelabert Claudia',
  'Gomez Alicia',
  'Habitante Mirta',
  'Harnaud Antonela',
  'Harnaud Nicolás',
  'Ocaranza José',
  'Ocaranza Patricia',
  'Perez Elsa',
  'Perez Roberto',
  'Renatti Yolanda',
  'Reyna Carina',
  'Reyna Jose',
  'Rosales Elizabeth',
  'Rosales Joel',
  'Torres Miguel',
];

const MOCK_PEOPLE = MOCK_NAMES.map((nombre, index) => ({
  id: String(index + 1),
  nombre,
  privilegio: index === 1 ? 'Publicador' : index === 2 ? 'Auxiliar' : index === 3 ? 'Inactivo' : '',
  horas: index === 1 ? 'Sí' : index === 2 ? '12' : '',
  estudios: index === 2 ? '1' : '',
  comentarios: '',
}));

const PRIVILEGIOS = ['', 'Publicador', 'Auxiliar', 'Regular', 'Inactivo'];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function privilegeOptions(selected) {
  return PRIVILEGIOS.map((value) => {
    const label = value || '—';
    const isSelected = value === selected ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderRow(person) {
  return `
    <tr data-id="${escapeHtml(person.id)}">
      <td class="col-id muted">${escapeHtml(person.id)}</td>
      <td class="col-name person-name">${escapeHtml(person.nombre)}</td>
      <td class="col-privilege">
        <select class="field-input field-select" aria-label="Privilegio de ${escapeHtml(person.nombre)}">
          ${privilegeOptions(person.privilegio)}
        </select>
      </td>
      <td class="col-hours">
        <input class="field-input field-hours" type="text" value="${escapeHtml(person.horas)}" aria-label="Horas de ${escapeHtml(person.nombre)}" />
      </td>
      <td class="col-studies">
        <input class="field-input field-studies" type="text" value="${escapeHtml(person.estudios)}" aria-label="Estudios de ${escapeHtml(person.nombre)}" />
      </td>
      <td class="col-comments">
        <input class="field-input field-comments" type="text" value="${escapeHtml(person.comentarios)}" aria-label="Comentarios de ${escapeHtml(person.nombre)}" />
      </td>
    </tr>
  `;
}

function renderScreen() {
  const root = document.querySelector('#encargados-app');
  if (!root) return;

  document.querySelector('#context-grupo').textContent = MOCK_CONTEXT.grupo;
  document.querySelector('#context-mes').textContent = MOCK_CONTEXT.mes;

  root.innerHTML = `
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
            ${MOCK_PEOPLE.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

renderScreen();
