# GTA Speeding

Enabled on bot startup. The PRC player list does not include a speedometer value, so the bot estimates MPH from each player's map movement between snapshots (about every 5 seconds). Reported API speed is used when present.

If someone is going **over 130**:

1. First offense: in-game `:pm` that GTA Speeding is not allowed.
2. If they drop back under 130 and go over again **within 3 minutes**, they are `:load`ed and PMed that they were loaded for repeating it.

Staying over 130 without dropping under is one offense, not a new one every tick. Teleports and other jumps that estimate above 250 mph are ignored. Exempt staff (role `1514033074948800683`) are skipped.

PMs and loads are posted to channel `1514547037537046688` as `[GtaSpeed]` proximity logs. Runtime warning times are `data/gta-speeding.json` (Git-ignored). Restart the bot after deploying.
