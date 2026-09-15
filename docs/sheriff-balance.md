# Sheriff team balance

Logs go to channel `1549178818814812211`: wanted commands, private notices, over-capacity exempt arrivals, cancelled enforcement, and command failures. Each entry includes Roblox username/ID, observed team occupancy, and a timestamp. Discord log failures do not delay or repeat enforcement. The bot needs View Channel, Send Messages, and Embed Links there.

Main-server role `1514033074948800683` bypasses enforcement, matched through a linked Roblox ID or Roblox username in the Discord member's name. Exempt players still count toward team occupancy. Role lookups must succeed before enforcement.

Enabled on bot startup. The limit is 23 Sheriff players. If the team is already over 23 when the bot starts, extras (from the end of the live roster, after keeping incumbents) receive `:wanted USERNAME` and a private message that the Sheriff team is full. A join that fills the 23rd slot is allowed; additional arrivals are wanted. Other teams are unaffected.

The first successful player snapshot enforces the cap immediately. Subsequent snapshots keep players already counted in the previous pass, then assign remaining slots to new Sheriff arrivals in API snapshot order. Exempt players are never wanted, but they still count toward occupancy.

Checks run five seconds after each completed pass. The live roster is fetched again immediately before queued enforcement; if the player has left Sheriff or occupancy is 23 or below, no wanted command or notice is sent. Failed lookups skip enforcement when no Discord member cache is available; after a successful roster load, opcode-8 Discord rate limits reuse that cache so wanted commands still go out. Failed commands retry using the ER:LC retry-after on HTTP 429 (typically 5 seconds) instead of a 60s/120s backoff. A successfully applied wanted command is not repeated just because its private message failed.

The shared ER:LC queue and API latency can delay enforcement. The feature does not remove wanted status later or automatically return players to Sheriff. Once capacity opens, future joins are allowed. Rapid leave/rejoin events between snapshots may not be observed.
