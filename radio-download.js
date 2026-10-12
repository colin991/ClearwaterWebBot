(async () => {
  const details = document.getElementById('details');
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  try {
    const response = await fetch('/radio/update', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(String(response.status));
    const release = await response.json();
    if (!release.version) throw new Error('no version');
    set('version', release.version);
    set('released', release.publishedAt ? new Date(release.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
    set('size', Number.isFinite(release.size) ? `${(release.size / 1024 / 1024).toFixed(1)} MB` : '—');
  } catch {
    // No release details to show: keep the page to the download button rather than empty boxes.
    details.hidden = true;
  }
})();
