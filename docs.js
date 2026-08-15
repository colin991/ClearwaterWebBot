const tabs = [...document.querySelectorAll('[data-docs-tab]')];
const panes = [...document.querySelectorAll('[data-docs-pane]')];

function openTab(id) {
  const next = String(id || 'start');
  tabs.forEach((tab) => tab.classList.toggle('selected', tab.dataset.docsTab === next));
  panes.forEach((pane) => pane.classList.toggle('selected', pane.dataset.docsPane === next));
  const url = new URL(location.href);
  url.hash = next;
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

tabs.forEach((tab) => tab.addEventListener('click', () => openTab(tab.dataset.docsTab)));

const initial = String(location.hash || '').replace(/^#/, '') || 'start';
if (tabs.some((tab) => tab.dataset.docsTab === initial)) openTab(initial);
else openTab('start');
