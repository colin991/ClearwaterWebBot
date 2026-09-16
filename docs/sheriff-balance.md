# Sheriff team balance

Logs go to channel `1549178818814812211`: wanted commands, private notices, over-capacity exempt arrivals, cancelled enforcement, and command failures. Each entry includes Roblox username/ID, observed team occupancy, and a timestamp. Discord log failures do not delay or repeat enforcement. The bot needs View Channel, Send Messages, and Embed Links there.

Main-server role `1514033074948800683` bypasses enforcement, matched through a linked Roblox ID or Roblox username in the Discord member's name. Exempt players still count toward team occupancy and are never wanted or rotated off. Role lookups must succeed before enforcement.

Enabled on bot startup. The limit is 23 Sheriff players. A join that fills the 23rd slot is allowed. If another player joins while the team is already at 23:

- If at least one non-exempt Sheriff has been on the team for **over 1.5 hours**, that longest-tenured player is removed with `:wanted`, then PMed in-game and DMed on Discord that they were rotated off to free a slot. The new player stays.
- If nobody has been on Sheriff for over 1.5 hours, the new player is removed with `:wanted`, PMed in-game, and DMed on Discord that the team is full.

If two people join at once and only one long-timer qualifies, the first extra keeps the rotated slot and the second extra is wanted. Other teams are unaffected.

Sheriff join times are stored in `data/sheriff-tenure.json` (ignored by Git) so a bot restart does not reset 1.5-hour tenure. Players first seen on Sheriff without a stored time start the clock from that snapshot. Leaving Sheriff clears tenure. On a cold start with no stored times, extras over 23 are wanted like a full-team join.

Checks run five seconds after each completed pass. Every ER:LC snapshot and in-game command (`:wanted`, `:pm`, VC jail, GTA Speeding, priority timers, and the rest) shares **one request queue** with a 5 second minimum gap, so Sheriff balance does not stampede the PRC API. The live roster is reused from that cache immediately before queued enforcement; if the player has left Sheriff or occupancy is 23 or below, the wanted command is skipped. After a successful `:wanted`, a Discord DM is sent to the linked account (Roblox ID in the identity cache, or a single unambiguous Discord name match). Closed DMs or a missing Discord user are logged and are not retried; they do not repeat the wanted command. The in-game `:pm` is still sent as long as the player remains on the server (they may already have left Sheriff). Failed lookups skip enforcement when no Discord member cache is available; after a successful roster load, opcode-8 Discord rate limits reuse that cache so wanted commands still go out. Failed commands retry using the ER:LC retry-after on HTTP 429 (typically 5 seconds) instead of a 60s/120s backoff. A successfully applied wanted command is not repeated just because its private message failed; the private message is retried until it sends or the player leaves the server.

The shared ER:LC queue and API latency can delay enforcement. The feature does not remove wanted status later or automatically return players to Sheriff. Once capacity opens, future joins are allowed. Rapid leave/rejoin events between snapshots may not be observed.
