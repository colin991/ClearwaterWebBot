const line = (level, message, details) => {
  const timestamp = new Date().toISOString();
  const suffix = details instanceof Error ? `\n${details.stack || details.message}` : details ? ` ${String(details)}` : '';
  return `[${timestamp}] [${level}] ${message}${suffix}`;
};

export const logger = Object.freeze({
  info(message, details) {
    console.log(line('INFO', message, details));
  },
  warn(message, details) {
    console.warn(line('WARN', message, details));
  },
  error(message, details) {
    console.error(line('ERROR', message, details));
  },
});
