# GTA Speeding

Enabled on bot startup. The PRC player list does not include a speedometer value, so the bot estimates MPH from each player's map movement between snapshots (about every 5 seconds). Reported API speed is used when present.

If someone is going **over 130** on two snapshots in a row:

1. First offense: in-game `:pm` to slow down (wording avoids the Roblox chat filter).
2. If they drop back under 130 and go over again **within 3 minutes** (again two snapshots in a row), they get a second in-game PM. They are **not** `:load`ed, kicked, or jailed for this.

Staying over 130 without dropping under is one offense, not a new one every tick. A single rubberband / lag jump does not warn. If the API reports a speed, that value is used and map jumps cannot override it. Teleports that estimate above 250 mph are ignored. Exempt staff (roles `1514033074948800683` and `1514033321024426154`) are skipped. In-game PMs do not use words the filter hashes (such as GTA).

PMs are posted to channel `1514547037537046688` as `[GtaSpeed]` proximity logs. Runtime warning times are `data/gta-speeding.json` (Git-ignored). Restart the bot after deploying.
