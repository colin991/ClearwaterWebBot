export function robloxNameMatchesText(text, username) {
  const user = String(username || '').trim();
  if (user.length < 3) return false;
  const hay = String(text || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '');
  if (hay.toLowerCase().includes(user.toLowerCase())) return true;
  const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = compact(user);
  if (needle.length < 3) return false;
  const tokens = hay.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => compact(token) === needle)) return true;
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
  ];
}

export function matchingMembers(members, username) {
  const name = String(username || '').trim();
  if (name.length < 3) return [];
  return [...(members?.values?.() || [])].filter(member => !member?.user?.bot
    && memberNameTexts(member).some(text => robloxNameMatchesText(text, name)));
}

/** Linked Roblox identity and Discord nickname/username matches. */
export function membersForPlayer(player, members, identities = {}) {
  const found = [];
  const seen = new Set();
  const add = member => {
    if (!member || member.user?.bot || seen.has(member.id)) return;
    seen.add(member.id);
    found.push(member);
  };
  const robloxId = String(player?.robloxId || '');
  if (robloxId) {
    for (const [discordId, identity] of Object.entries(identities || {})) {
      if (String(identity?.robloxId || '') !== robloxId) continue;
      add(members?.get?.(discordId) || members?.get?.(String(discordId)));
    }
  }
  for (const member of matchingMembers(members, player?.username)) add(member);
  if (player?.displayName && String(player.displayName).toLowerCase() !== String(player.username || '').toLowerCase()) {
    for (const member of matchingMembers(members, player.displayName)) add(member);
  }
  return found;
}
