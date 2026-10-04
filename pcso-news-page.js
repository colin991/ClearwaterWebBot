import { fetchPcsoContent, renderNewsDirectoryHtml } from './pcso-events.js?v=20261002-press-release';

const directory = document.querySelector('[data-news-directory]');
const search = document.querySelector('[data-news-search]');
let news = [];
let category = 'all';

function newsCategory(item) {
  const text = `${item.title || ''} ${item.summary || ''} ${item.body || ''}`;
  if (/promot|award|commend|certif|recognition/i.test(text)) return 'recognition';
  if (/community|event|recruit|training/i.test(text)) return 'community';
  return 'press';
}

function paint() {
  if (!directory) return;
  const filtered = category === 'all' ? news : news.filter((item) => newsCategory(item) === category);
  directory.innerHTML = renderNewsDirectoryHtml(filtered, { query: search?.value || '' });
}

search?.addEventListener('input', paint);
document.querySelector('.pcso-news-filters')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-news-category]');
  if (!button) return;
  category = button.dataset.newsCategory;
  document.querySelectorAll('[data-news-category]').forEach((item) => item.classList.toggle('is-active', item === button));
  paint();
});
const payload = await fetchPcsoContent();
news = payload.news;
paint();
