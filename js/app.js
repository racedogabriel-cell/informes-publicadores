import { navItems, renderRoute } from './router.js';

const nav = document.querySelector('#primary-navigation');
nav.innerHTML = navItems
  .map((item) => `<a class="nav-link" data-route="${item.id}" href="#${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</a>`)
  .join('');

const sidebar = document.querySelector('.sidebar');
document.querySelector('#menu-button').addEventListener('click', () => sidebar.classList.toggle('is-open'));
nav.addEventListener('click', () => sidebar.classList.remove('is-open'));

window.addEventListener('hashchange', renderRoute);
renderRoute();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
}
