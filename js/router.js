import { reportsView, bindReports, availablePeriods } from './informes.js';
import { periodsView, bindPeriods } from './periodos.js';
import { personasView, bindPersonas } from './personas.js';
import { configuracionView, bindConfiguracion } from './configuracion.js';
import { historialView, bindHistorial, historialPeriods } from './historial.js';

/** Estados oficiales de módulo. No implementar módulos marcados como "No iniciado". */
const moduleStatus = {
  inicio: 'No iniciado',
  personas: 'En desarrollo',
  informes: 'En desarrollo',
  periodos: 'En desarrollo',
  historial: 'En desarrollo',
  configuracion: 'En desarrollo',
};

let reportPeriod = availablePeriods().at(-1).key;
let historialPeriod = historialPeriods()[0].key;

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
    view: () => personasView(),
    bind: () => bindPersonas(),
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
  periodos: {
    title: 'Períodos',
    eyebrow: '',
    view: () => periodsView(),
    bind: () => bindPeriods(),
  },
  historial: {
    title: 'Historial',
    eyebrow: '',
    view: () => historialView(historialPeriod),
    bind: () =>
      bindHistorial(historialPeriod, (next) => {
        historialPeriod = next;
        renderRoute();
      }),
  },
  // Compat: hash antiguo #estadisticas → Historial
  estadisticas: {
    title: 'Historial',
    eyebrow: '',
    view: () => historialView(historialPeriod),
    bind: () =>
      bindHistorial(historialPeriod, (next) => {
        historialPeriod = next;
        renderRoute();
      }),
  },
  configuracion: {
    title: 'Configuración',
    eyebrow: '',
    view: () => configuracionView(),
    bind: () => bindConfiguracion(),
  },
};

export const navItems = [
  { id: 'inicio', label: 'Inicio', icon: '⌂' },
  { id: 'personas', label: 'Personas', icon: '♙' },
  { id: 'informes', label: 'Informes', icon: '▤' },
  { id: 'periodos', label: 'Períodos', icon: '◷' },
  { id: 'historial', label: 'Historial', icon: '◔' },
  { id: 'configuracion', label: 'Configuración', icon: '⚙' },
];

export function renderRoute() {
  const id = location.hash.slice(1) || 'informes';
  const route = routes[id] || routes.informes;
  const navId = id === 'estadisticas' ? 'historial' : id;
  document.querySelector('#page-title').textContent = route.title;
  document.querySelector('#page-eyebrow').textContent = route.eyebrow;
  document.querySelector('#app').innerHTML = route.view();
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.setAttribute('aria-current', link.dataset.route === navId ? 'page' : 'false');
  });
  route.bind?.();
  document.querySelector('#app').focus();
}
