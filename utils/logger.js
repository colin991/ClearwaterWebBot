const snowflake = /\b\d{16,22}\b/g;
const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const ipv6 = /\b(?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}\b/gi;

function redact(value) {
  return String(value || '')
    .replace(ipv4, '[ip]')
    .replace(ipv6, '[ip]')
    .replace(snowflake, '[id]');
}

const line = (level, message, details) => {
  const timestamp = new Date().toISOString();
  const suffix = details instanceof Error
    ? `\n${redact(details.stack || details.message)}`
    : details
      ? ` ${redact(details)}`
      : '';
  return `[${timestamp}] [${level}] ${redact(message)}${suffix}`;
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
