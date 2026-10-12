(async () => {
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  try {
    const response = await fetch('/radio/update', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(String(response.status));
    const release = await response.json();
    set('version', release.version || '—');
    set('released', release.publishedAt ? new Date(release.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
    set('size', Number.isFinite(release.size) ? `${(release.size / 1024 / 1024).toFixed(1)} MB` : '—');
    set('sha', release.sha256 || '—');
  } catch {
    for (const id of ['version', 'released', 'size', 'sha']) set(id, '—');
  }
})();
