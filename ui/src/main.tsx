import './styles.css';
import { bootIslands } from './islands';

function boot() {
  bootIslands();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
