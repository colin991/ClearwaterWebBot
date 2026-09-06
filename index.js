/**
 * Apollo zip-upload entrypoint.
 * Do not import host sync here — many hosts have no .git and incomplete utils/.
 * Startup is locked to: npm install; node /home/container/index.js
 */
console.log('[boot] starting bot...');
await import('./bot.js');
