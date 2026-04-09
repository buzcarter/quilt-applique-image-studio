/**
 * Manages the hero / sidebar panel layout.
 *
 * Clicking any .canvas-wrapper[data-panel] promotes it to the hero slot;
 * remaining panels move to the sidebar in their original data-order sequence.
 *
 * initPanelLayout(container) — sets up click handlers and renders initial layout
 * promoteToHero(panelName)   — moves the named panel to the hero slot
 */

let _container = null;
let _currentHero = 'pattern';

export function initPanelLayout(container) {
  _container = container;
  for (const panel of container.querySelectorAll('.canvas-wrapper[data-panel]')) {
    panel.addEventListener('click', () => promoteToHero(panel.dataset.panel));
  }
  promoteToHero(_currentHero);
}

export function promoteToHero(panelName) {
  _currentHero = panelName;
  const sidebar = document.getElementById('panelSidebar');
  const hero    = document.getElementById('panelHero');
  const panels  = Array.from(_container.querySelectorAll('.canvas-wrapper[data-panel]'));

  const sidebarPanels = panels
    .filter((p) => p.dataset.panel !== panelName)
    .sort((a, b) => +a.dataset.order - +b.dataset.order);

  const heroPanel = panels.find((p) => p.dataset.panel === panelName);

  sidebar.replaceChildren(...sidebarPanels);
  hero.replaceChildren(heroPanel);
}
