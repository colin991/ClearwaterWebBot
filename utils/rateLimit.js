const buckets = new Map();

function prune(now) {
  if (buckets.size < 4000) return;
  for (const [key, times] of buckets) {
    const next = times.filter((time) => now - time < 60_000);
    if (next.length) buckets.set(key, next);
    else buckets.delete(key);
  }
}

export function allowRate(key, { max, windowMs }) {
  const now = Date.now();
  prune(now);
  const times = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  if (times.length >= max) {
    buckets.set(key, times);
    return false;
  }
  times.push(now);
  buckets.set(key, times);
  return true;
}

export class RateLimitError extends Error {
  constructor(message = 'Too many requests. Wait a moment.') {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
  }
}
