import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

/** Fulton County Sheriff's Office main Discord: roles are read here. */
export const FULTON_MAIN_GUILD_ID = '1558194247398588416';

/** Fulton County Divisional Hub: matching roles are given and taken here. */
export const FULTON_HUB_GUILD_ID = '1555209573365710959';

export const FULTON_ROLE_SYNC_MS = 10 * 60 * 1000;

/**
 * Main-server role → hub role, matched by name. Assistant Chief of
 * Investigations has no hub role, so it is not synced.
 */
export const FULTON_ROLE_LINKS = Object.freeze([
  ['Office of the Sheriff', '1558194248334057599', '1560335103539019979'],
  ['Department Employee', '1558194248166150179', '1560335110044127234'],
  ['SRT Commander', '1558194248040456238', '1560335125449932800'],
  ['SRT Asst. Commander', '1558194248040456237', '1560335126498377921'],
  ['SRT Team Leader', '1558194248040456236', '1560335128532623420'],
  ['SRT Senior Operator', '1558194248040456235', '1560335132534116352'],
  ['SRT Operator II', '1558194247931265043', '1560335134291656916'],
  ['SRT Operator I', '1558194247931265042', '1560335135558082662'],
  ['SRT Trial Operator', '1558194247931265041', '1560335136392741018'],
  ['Special Response Team', '1558194247931265040', '1560335137844240516'],
  ['TEU Overseer', '1558194247931265038', '1560415713544507512'],
  ['TEU Commander', '1558194247931265037', '1560415767726530591'],
  ['TEU Deputy Commander', '1558194247931265036', '1560415796008845393'],
  ['TEU Asst. Commander', '1558194247931265035', '1560415846042435657'],
  ['TEU Supervisor Lead', '1558194247931265034', '1560415884336435261'],
  ['TEU Supervisor', '1558194247910428811', '1560415944214454394'],
  ['TEU Deputy II', '1558194247910428810', '1560415997305819206'],
  ['TEU Deputy I', '1558194247910428809', '1560416035054817310'],
  ['Traffic Enforcement Unit', '1558194247910428807', '1560416065325113395'],
  ['Chief of Investigations', '1558194247910428805', '1560335113856745593'],
  ['Deputy Chief of Investigations', '1558194247910428804', '1560335114645413922'],
  ['Lead Investigator', '1558194247910428802', '1560335116620927036'],
  ['Detective Sergeant', '1558194247868616713', '1560335118164562031'],
  ['Senior Detective', '1558194247868616712', '1560335119380643961'],
  ['Detective', '1558194247868616711', '1560335120513245194'],
  ['Probationary Detective', '1558194247868616710', '1560335121461157958'],
  ['Criminal Investigations Division', '1558194247868616709', '1560335122438553740'],
  ['K-9 Unit Overseer', '1558194247734272058', '1560411531554857070'],
  ['K-9 Unit Director', '1558194247734272057', '1560411524164751460'],
  ['K-9 Unit Training Officer', '1558194247734272056', '1560411517310996650'],
  ['K-9 Duty Supervisor', '1558194247734272055', '1560411510269026455'],
  ['K-9 Handler Deputy', '1558194247734272054', '1560411504128434269'],
  ['K-9 Handler Trainee', '1558194247734272053', '1560411497094713396'],
  ['K-9 Unit', '1558194247734272052', '1560335149785288814'],
  ['Marine Unit Commander', '1558194247599915017', '1560411862045040741'],
  ['Marine Unit Lead Sergeant', '1558194247599915016', '1560411868739272786'],
  ['Marine Unit Sergeant', '1558194247599915015', '1560411883536916520'],
  ['Marine Unit Supervisor', '1558194247599915014', '1560411876175646831'],
  ['Marine Unit Deputy', '1558194247599915013', '1560411889505276036'],
  ['Marine Division', '1558194247599915012', '1560335147675680869'],
  ['Field Training Director', '1558194247855775758', '1560335140163551352'],
  ['Field Training Deputy Director', '1558194247855775757', '1560335141153542214'],
  ['Field Training Senior Instructor', '1558194247855775756', '1560335142180880445'],
  ['Field Training Instructor', '1558194247855775755', '1560335143233650889'],
  ['Field Training Junior Instructor', '1558194247855775754', '1560335144361926736'],
  ['Field Training Operations', '1558194247734272060', '1560335145679200397'],
].map(([name, mainRoleId, hubRoleId]) => Object.freeze({ name, mainRoleId, hubRoleId })));

const REASON = 'Fulton County role sync from the main Sheriff\'s Office server';
const UNKNOWN_MEMBER = 10007;

/**
 * Hub roles to add and remove so the hub matches the main server.
 * mainRoleIds null means the person is not in the main server, so every linked role goes.
 */
export function fultonHubRoleChanges(mainRoleIds, hubRoleIds) {
  const main = new Set((mainRoleIds || []).map(String));
  const hub = new Set((hubRoleIds || []).map(String));
  const add = [];
  const remove = [];
  for (const link of FULTON_ROLE_LINKS) {
    const wanted = main.has(link.mainRoleId);
    const has = hub.has(link.hubRoleId);
    if (wanted && !has) add.push(link.hubRoleId);
    if (!wanted && has) remove.push(link.hubRoleId);
  }
  return { add, remove };
}

async function fetchGuild(client, guildId) {
  return client.guilds.cache.get(guildId)
    || await client.guilds.fetch(guildId).catch(() => null);
}

async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId)
    || await guild.members.fetch(userId).catch((error) => {
      if (error?.code !== UNKNOWN_MEMBER) {
        logger.warn(`Fulton role sync: could not fetch a member: ${error?.message || error}`);
      }
      return null;
    });
}

const warnedUnmanageable = new Set();

/** Apply the changes to one hub member, skipping roles the bot cannot manage. */
async function applyHubChanges(hubMember, mainRoleIds) {
  if (hubMember.user?.bot) return { added: 0, removed: 0 };
  const { add, remove } = fultonHubRoleChanges(mainRoleIds, [...hubMember.roles.cache.keys()]);
  if (!add.length && !remove.length) return { added: 0, removed: 0 };

  const roles = hubMember.guild.roles.cache;
  const manageable = (roleId) => {
    const role = roles.get(roleId);
    if (role?.editable) return true;
    if (!warnedUnmanageable.has(roleId)) {
      warnedUnmanageable.add(roleId);
      const name = FULTON_ROLE_LINKS.find((link) => link.hubRoleId === roleId)?.name || roleId;
      logger.warn(`Fulton role sync: cannot manage hub role "${name}" (missing, or above the bot's role).`);
    }
    return false;
  };

  const toAdd = add.filter(manageable);
  const toRemove = remove.filter(manageable);
  if (toAdd.length) await hubMember.roles.add(toAdd, REASON);
  if (toRemove.length) await hubMember.roles.remove(toRemove, REASON);
  return { added: toAdd.length, removed: toRemove.length };
}

/** Bring one person's hub roles in line with their main-server roles. */
export async function syncFultonMember(client, userId, mainRoleIds) {
  const hub = await fetchGuild(client, FULTON_HUB_GUILD_ID);
  if (!hub) return null;
  const hubMember = await fetchMember(hub, userId);
  if (!hubMember) return null;

  let roleIds = mainRoleIds;
  if (roleIds === undefined) {
    const main = await fetchGuild(client, FULTON_MAIN_GUILD_ID);
    if (!main) return null; // Never strip roles just because the main server is unreachable.
    const mainMember = await fetchMember(main, userId);
    roleIds = mainMember ? [...mainMember.roles.cache.keys()] : null;
  }
  return applyHubChanges(hubMember, roleIds);
}

/** Full pass over the hub: used on startup and as a periodic safety net. */
export async function syncAllFultonMembers(client) {
  const [main, hub] = await Promise.all([
    fetchGuild(client, FULTON_MAIN_GUILD_ID),
    fetchGuild(client, FULTON_HUB_GUILD_ID),
  ]);
  if (!main || !hub) {
    logger.warn(`Fulton role sync: bot is not in the ${main ? 'Divisional Hub' : 'main Sheriff\'s Office'} server; skipping.`);
    return null;
  }

  const mainMembers = await ensureGuildMembers(main, { allowStale: false });
  const hubMembers = await ensureGuildMembers(hub, { allowStale: false });

  let added = 0;
  let removed = 0;
  for (const hubMember of hubMembers.values()) {
    const mainMember = mainMembers.get(hubMember.id);
    try {
      const result = await applyHubChanges(hubMember, mainMember ? [...mainMember.roles.cache.keys()] : null);
      added += result.added;
      removed += result.removed;
    } catch (error) {
      logger.warn(`Fulton role sync: could not update a hub member: ${error?.message || error}`);
    }
  }
  if (added || removed) logger.info(`Fulton role sync: added ${added} and removed ${removed} hub roles.`);
  return { added, removed };
}

export async function handleFultonMemberUpdate(previousMember, member, client) {
  if (member.guild.id !== FULTON_MAIN_GUILD_ID) return;
  await syncFultonMember(client, member.id, [...member.roles.cache.keys()]);
}

export async function handleFultonMemberAdd(member, client) {
  if (member.guild.id === FULTON_HUB_GUILD_ID) {
    await syncFultonMember(client, member.id);
  } else if (member.guild.id === FULTON_MAIN_GUILD_ID) {
    await syncFultonMember(client, member.id, [...member.roles.cache.keys()]);
  }
}

export async function handleFultonMemberRemove(member, client) {
  if (member.guild.id !== FULTON_MAIN_GUILD_ID) return;
  await syncFultonMember(client, member.id, null);
}

export function startFultonRoleSync(client) {
  const run = () => syncAllFultonMembers(client).catch((error) => {
    logger.warn(`Fulton role sync pass failed: ${error?.message || error}`);
  });
  const first = setTimeout(run, 5000);
  const timer = setInterval(run, FULTON_ROLE_SYNC_MS);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
