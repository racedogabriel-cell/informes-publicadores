import { reportsView, bindReports, availablePeriods } from './informes.js';

/** Estados oficiales de módulo. No implementar módulos marcados como "No iniciado". */
const moduleStatus = {
  inicio: 'No iniciado',
  personas: 'No iniciado',
  informes: 'En desarrollo',
  estadisticas: 'No iniciado',
  configuracion: 'No iniciado',
};

let reportPeriod = availablePeriods().at(-1).key;

function pendingModuleView(status) {
  return `<p class="view-intro">Estado: ${status}.</p>`;
}

const routes = {
  inicio: {
    title: 'Inicio',
    eyebrow: '',
    view: () => pendingModuleView(moduleStatus.inicio),
  },
  personas: {
    title: 'Personas',
    eyebrow: '',
    view: () => pendingModuleView(moduleStatus.personas),
  },
  informes: {
    title: 'Informes',
    eyebrow: '',
    view: () => reportsView(reportPeriod),
    bind: () =>
      bindReports(reportPeriod, (next) => {
        reportPeriod = next;
        renderRoute();
      }),
  },
  estadisticas: {
    title: 'Estadísticas',
    eyebrow: '',
    view: () => pendingModuleView(moduleStatus.estadisticas),
  },
  configuracion: {
    title: 'Configuración',
    eyebrow: '',
    view: () => pendingModuleView(moduleStatus.configuracion),
  },
};

export const navItems = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'personas', label: 'Personas', icon: '♙' },
  { id: 'informes', label: 'Informes', icon: '▤' },
  { id: 'estadisticas', label: 'Estadísticas', icon: '◔' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙' },
];

export function renderRoute() {
  const id = location.hash.slice(1) || 'inicio';
  const route = routes[id] || routes.inicio;
  document.querySelector('#page-title').textContent = route.title;
  document.querySelector('#page-eyebrow').textContent = route.eyebrow;
  document.querySelector('#app').innerHTML = route.view();
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.setAttribute('aria-current', link.dataset.route === id ? 'page' : 'false');
  });
  route.bind?.();
  document.querySelector('#app').focus();
}
