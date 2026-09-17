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

export function memberById(members, discordId) {
  const id = String(discordId || '');
  if (!id) return null;
  if (typeof members?.get === 'function') {
    return members.get(discordId) || members.get(id) || null;
  }
  return listGuildMembers(members).find((member) => String(member?.id) === id) || null;
}

/** Linked Roblox identity and Discord nickname/username matches. */
export function membersForPlayer(player, members, identities = {}) {
  const found = [];
  const seen = new Set();
  const add = (member) => {
    if (!member || member.user?.bot === true) return;
    const id = String(member.id || '');
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
  if (player?.displayName && String(player.displayName).toLowerCase() !== String(player.username || '').toLowerCase()) {
    for (const member of matchingMembers(members, player.displayName)) add(member);
  }
  return found;
}
