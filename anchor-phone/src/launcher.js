document.getElementById('launch')?.addEventListener('click', async () => {
  const btn = document.getElementById('launch');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Launching…';
  }
  try {
    await window.anchorPhone?.launchOverlay?.();
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Launch Phone';
    }
  }
});

document.getElementById('quit')?.addEventListener('click', () => {
  window.anchorPhone?.quit?.();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.anchorPhone?.quit?.();
});
