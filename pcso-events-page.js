import { fetchPcsoContent, renderEventsDirectoryHtml } from './pcso-events.js?v=20261002-press-release';

const directory = document.querySelector('[data-events-directory]');
const search = document.querySelector('[data-events-search]');
let events = [];

function paint() {
  if (!directory) return;
  directory.innerHTML = renderEventsDirectoryHtml(events, { query: search?.value || '' });
}

search?.addEventListener('input', paint);
const payload = await fetchPcsoContent();
events = payload.events;
paint();
