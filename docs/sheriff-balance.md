# Sheriff team balance

Logs go to channel `1549178818814812211`: wanted commands, private notices, over-capacity exempt arrivals, cancelled enforcement, and command failures. Each entry includes Roblox username/ID, observed team occupancy, and a timestamp. Discord log failures do not delay or repeat enforcement. The bot needs View Channel, Send Messages, and Embed Links there.

Main-server role `1514033074948800683` bypasses enforcement, matched through a linked Roblox ID or Roblox username in the Discord member's name. Exempt players still count toward team occupancy. Role lookups must succeed before enforcement.

Enabled on bot startup. The limit is 23 Sheriff players: a join filling the 23rd slot is allowed, and additional arrivals receive `:wanted USERNAME` followed by a private message that the Sheriff team is full. Other teams are unaffected.

The first successful player snapshot establishes incumbents without mass enforcement. Subsequent snapshots identify arrivals to Sheriff (including players newly seen in-game). When multiple arrivals appear together, available slots are assigned in API snapshot order because exact team-switch timestamps are unavailable.

Checks run five seconds after each completed pass. The live roster is fetched again immediately before queued enforcement; if the player has left Sheriff or occupancy is 23 or below, no wanted command or notice is sent. Failed lookups skip enforcement. Failed commands retry without repeating a successfully applied wanted command just because its private message failed.

The shared ER:LC queue and API latency can delay enforcement. The feature does not remove wanted status later or automatically return players to Sheriff. Once capacity opens, future joins are allowed. Rapid leave/rejoin events between snapshots may not be observed.
