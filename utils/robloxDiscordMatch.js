function compactAlnum(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function robloxNameMatchesText(text, username) {
  const user = String(username || '').trim();
  if (user.length < 3) return false;
  const hay = String(text || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '');
  if (!hay) return false;
  if (hay.toLowerCase().includes(user.toLowerCase())) return true;
  const needle = compactAlnum(user);
  if (needle.length < 3) return false;
  const compactHay = compactAlnum(hay);
  if (compactHay === needle) return true;
  // "Rank | iTsAronJ" or "iTs Aron J" still counts as the Roblox user.
  if (needle.length >= 4 && compactHay.includes(needle)) return true;
  const tokens = hay.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => compactAlnum(token) === needle)) return true;
  for (let i = 0; i < tokens.length; i += 1) {
    let acc = '';
    for (let j = i; j < tokens.length; j += 1) {
      acc += tokens[j];
      if (acc === needle) return true;
      if (acc.length > needle.length) break;
    }
  }
  return false;
}

export function memberNameTexts(member) {
  return [
    member?.nickname,
    member?.nick,
    member?.displayName,
    member?.user?.globalName,
    member?.user?.displayName,
    member?.user?.username,
    member?.user?.tag,
  ];
}

export function listGuildMembers(members) {
  if (!members) return [];
  if (Array.isArray(members)) return members;
  if (typeof members.values === 'function') return [...members.values()];
  if (typeof members[Symbol.iterator] === 'function') {
    const items = [...members];
    if (items.length && Array.isArray(items[0]) && items[0].length === 2) {
      return items.map((entry) => entry[1]);
    }
    return items;
  }
  return Object.values(members);
}

export function matchingMembers(members, username) {
  const name = String(username || '').trim();
  if (name.length < 3) return [];
  return listGuildMembers(members).filter((member) => member?.user?.bot !== true
    && memberNameTexts(member).some((text) => robloxNameMatchesText(text, name)));
}

export function snowflakeId(value) {
  return String(value ?? '').trim();
}

export function memberById(members, discordId) {
  const id = snowflakeId(discordId);
  if (!id) return null;
  if (typeof members?.get === 'function') {
    return members.get(id) || members.get(discordId) || null;
  }
  return listGuildMembers(members).find((member) => snowflakeId(member?.id) === id) || null;
}

const GENERIC_DISPLAY_NAMES = new Set([
  'jail', 'police', 'sheriff', 'civilian', 'fire', 'dot', 'staff', 'mod',
]);

function displayNameForMatch(player) {
  const display = String(player?.displayName || '').trim();
  const username = String(player?.username || '').trim();
  if (!display || display.toLowerCase() === username.toLowerCase()) return '';
  if (display.length < 5) return '';
  if (GENERIC_DISPLAY_NAMES.has(compactAlnum(display))) return '';
  return display;
}

/** Linked Roblox identity and Discord nickname/username matches. */
export function membersForPlayer(player, members, identities = {}) {
  const found = [];
  const seen = new Set();
  const add = (member) => {
    if (!member || member.user?.bot === true) return;
    const id = snowflakeId(member.id || member.user?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    found.push(member);
  };
  const robloxId = String(player?.robloxId || '');
  if (robloxId) {
    for (const [discordId, identity] of Object.entries(identities || {})) {
      if (String(identity?.robloxId || '') !== robloxId) continue;
      add(memberById(members, discordId));
    }
  }
  for (const member of matchingMembers(members, player?.username)) add(member);
  const display = displayNameForMatch(player);
  if (display) {
    for (const member of matchingMembers(members, display)) add(member);
  }
  return found;
}

function voiceEntries(voiceStates) {
  if (!voiceStates) return [];
  if (typeof voiceStates.values === 'function') return [...voiceStates.values()];
  return listGuildMembers(voiceStates);
}

export function connectedVoiceUserIds(voiceStates) {
  const ids = new Set();
  for (const vs of voiceEntries(voiceStates)) {
    if (!vs?.channelId && !vs?.channel?.id) continue;
    const id = snowflakeId(vs.id || vs.userId || vs.member?.id || vs.member?.user?.id);
    if (id) ids.add(id);
  }
  return ids;
}

export function isDiscordUserInVoice(discordId, inVoice, voiceStates) {
  const id = snowflakeId(discordId);
  if (!id) return false;
  if (typeof inVoice === 'function' && (inVoice(id) || inVoice(discordId))) return true;
  if (voiceStates && typeof voiceStates.get === 'function') {
    const vs = voiceStates.get(id) || voiceStates.get(discordId);
    if (vs?.channelId || vs?.channel?.id) return true;
  }
  return connectedVoiceUserIds(voiceStates).has(id);
}

/** True when a linked or name-matched Discord user is in any guild voice channel. */
export function playerIsInVoice(player, members, identities = {}, inVoice = () => false, voiceStates) {
  const connected = connectedVoiceUserIds(voiceStates);
  const voiceMembers = [];
  for (const vs of voiceEntries(voiceStates)) {
    if (!vs?.channelId && !vs?.channel?.id) continue;
    const member = vs.member;
    if (member) voiceMembers.push(member);
    else {
      const id = snowflakeId(vs.id || vs.userId);
      if (id) voiceMembers.push({ id, user: vs.user });
    }
  }
  const matches = membersForPlayer(player, members, identities);
  for (const member of membersForPlayer(player, voiceMembers, identities)) {
    matches.push(member);
  }
  const seen = new Set();
  for (const member of matches) {
    const id = snowflakeId(member.id || member.user?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (connected.has(id) || isDiscordUserInVoice(id, inVoice, voiceStates)) return true;
    if (member.voice?.channelId || member.voice?.channel?.id) return true;
  }
  const robloxId = String(player?.robloxId || '');
  if (robloxId) {
    for (const id of connected) {
      if (String(identities?.[id]?.robloxId || '') === robloxId) return true;
    }
  }
  return false;
}
