import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { emptyEconomyStore } from './economyLedger.js';
import { ECONOMY_DEPARTMENTS } from './economyConfig.js';

const storePath = join(process.cwd(), 'data', 'economy.json');

let cache = null;
let queue = Promise.resolve();

function normalize(raw) {
  const base = emptyEconomyStore();
  const data = raw && typeof raw === 'object' ? raw : {};
  base.users = data.users && typeof data.users === 'object' ? data.users : {};
  base.transactions = data.transactions && typeof data.transactions === 'object' ? data.transactions : {};
  base.transactionOrder = Array.isArray(data.transactionOrder) ? data.transactionOrder : [];
  base.robbery = data.robbery && typeof data.robbery === 'object' ? data.robbery : { status: 'idle' };
  base.robberyCooldowns = data.robberyCooldowns && typeof data.robberyCooldowns === 'object' ? data.robberyCooldowns : {};
  base.jobs = data.jobs && typeof data.jobs === 'object' ? data.jobs : {};
  base.payroll = data.payroll && typeof data.payroll === 'object' ? data.payroll : {};
  base.steals = data.steals && typeof data.steals === 'object' ? data.steals : {};
  base.deaths = data.deaths && typeof data.deaths === 'object' ? data.deaths : {};
  base.audit = Array.isArray(data.audit) ? data.audit : [];
  base.starterSweepAt = data.starterSweepAt || null;
  base.server = {
    balance: Number(data.server?.balance) || 0,
  };
  for (const dept of ECONOMY_DEPARTMENTS) {
    base.departments[dept.id] = {
      ...base.departments[dept.id],
      ...(data.departments?.[dept.id] || {}),
      id: dept.id,
    };
  }
  return base;
}

export async function loadEconomyStore() {
  if (cache) return cache;
  cache = normalize(await readJsonFile(storePath, emptyEconomyStore()));
  return cache;
}

export async function saveEconomyStore(store = cache) {
  cache = store;
  await writeJsonFile(storePath, store, { backup: true });
  return store;
}

export function withEconomy(work) {
  const run = queue.then(async () => {
    const store = await loadEconomyStore();
    const result = await work(store);
    await saveEconomyStore(store);
    return result;
  });
  queue = run.then(() => {}, () => {});
  return run;
}

export function resetEconomyCacheForTests(store = null) {
  cache = store;
  queue = Promise.resolve();
}
