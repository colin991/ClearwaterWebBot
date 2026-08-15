const jumps = [...document.querySelectorAll('[data-docs-jump]')];
const sections = jumps
  .map((link) => document.getElementById(link.dataset.docsJump))
  .filter(Boolean);

function setActive(id) {
  jumps.forEach((link) => {
    link.classList.toggle('selected', link.dataset.docsJump === id);
  });
}

function scrollToSection(id, { updateHash = true } = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 18;
  window.scrollTo({ top, behavior: 'smooth' });
  setActive(id);
  if (updateHash) {
    history.replaceState({}, '', `${location.pathname}${location.search}#${id}`);
  }
}

jumps.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    scrollToSection(link.dataset.docsJump);
  });
});

let ticking = false;
function syncActiveFromScroll() {
  ticking = false;
  const marker = window.scrollY + 96;
  let current = sections[0]?.id || 'start';
  for (const section of sections) {
    if (section.offsetTop <= marker) current = section.id;
  }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
    current = sections[sections.length - 1]?.id || current;
  }
  setActive(current);
}

window.addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(syncActiveFromScroll);
  },
  { passive: true }
);

const initial = String(location.hash || '').replace(/^#/, '') || 'start';
if (document.getElementById(initial)) {
  // Jump without fighting the browser's default hash scroll on first paint.
  requestAnimationFrame(() => scrollToSection(initial, { updateHash: false }));
} else {
  setActive('start');
}
