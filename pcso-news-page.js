import { fetchPcsoContent, renderNewsDirectoryHtml } from './pcso-events.js?v=20261002-press-release';

const directory = document.querySelector('[data-news-directory]');
const search = document.querySelector('[data-news-search]');
let news = [];

function paint() {
  if (!directory) return;
  directory.innerHTML = renderNewsDirectoryHtml(news, { query: search?.value || '' });
}

search?.addEventListener('input', paint);
const payload = await fetchPcsoContent();
news = payload.news;
paint();
