import { navItems, renderRoute } from './router.js';

const nav = document.querySelector('#primary-navigation');
nav.innerHTML = navItems
  .map((item) => `<a class="nav-link" data-route="${item.id}" href="#${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</a>`)
  .join('');

const sidebar = document.querySelector('#app-sidebar');
const menuButton = document.querySelector('#menu-button');
const backdrop = document.querySelector('#sidebar-backdrop');

function setSidebarOpen(open) {
  sidebar.classList.toggle('is-open', open);
  backdrop.classList.toggle('is-visible', open);
  menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
}

function closeSidebar() {
  setSidebarOpen(false);
}

menuButton.addEventListener('click', () => {
  setSidebarOpen(!sidebar.classList.contains('is-open'));
});

backdrop.addEventListener('click', closeSidebar);
nav.addEventListener('click', closeSidebar);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSidebar();
});

window.addEventListener('hashchange', renderRoute);
renderRoute();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}
