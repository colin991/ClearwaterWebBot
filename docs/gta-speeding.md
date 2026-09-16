# GTA Speeding

Enabled on bot startup. The PRC player list does not include a speedometer value, so the bot estimates MPH from each player's map movement between snapshots (about every 5 seconds). Reported API speed is used when present.

If someone is going **over 130** on two snapshots in a row:

1. First offense: in-game `:pm` to slow down (wording avoids the Roblox chat filter).
2. If they drop back under 130 and go over again **within 3 minutes** (again two snapshots in a row), they are `:load`ed and PMed.

Staying over 130 without dropping under is one offense, not a new one every tick. A single rubberband / lag jump does not warn or load. If the API reports a speed, that value is used and map jumps cannot override it. Teleports that estimate above 250 mph are ignored. Exempt staff (role `1514033074948800683`) are skipped. In-game PMs do not use words the filter hashes (such as GTA).

PMs and loads are posted to channel `1514547037537046688` as `[GtaSpeed]` proximity logs. Runtime warning times are `data/gta-speeding.json` (Git-ignored). Restart the bot after deploying.
